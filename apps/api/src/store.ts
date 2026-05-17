import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DynamoDBClient, GetItemCommand, PutItemCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { defaultRoomSettings, initialTopics, type AvatarId, type Hint, type Player, type RoomSettings, type RoomStatus, type Round, type Topic } from "@hirameki-relay/shared";

export interface StoredRoom {
  roomId: string;
  status: RoomStatus;
  hostPlayerId: string;
  hostTokenHash: string;
  settings: RoomSettings;
  currentRoundNo: number;
  usedTopicIds: string[];
  createdAt: string;
  updatedAt: string;
  ttl: number;
}

export interface StoredPlayer extends Player {
  tokenHash: string;
}

export interface StoredRound extends Round {
  topicDisplay: string;
  answerKana: string;
  aliases: string[];
}

export interface RoomState {
  room: StoredRoom;
  players: StoredPlayer[];
  round: StoredRound | null;
  hints: Hint[];
  topics: Topic[];
}

export interface RoomRepository {
  getRoomState(roomId: string): Promise<RoomState | null>;
  saveRoomState(state: RoomState): Promise<void>;
}

export class MemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, RoomState>();

  async getRoomState(roomId: string): Promise<RoomState | null> {
    return this.rooms.get(roomId.toUpperCase()) ?? null;
  }

  async saveRoomState(state: RoomState): Promise<void> {
    this.rooms.set(state.room.roomId, structuredClone(state));
  }
}

export class DynamoRoomRepository implements RoomRepository {
  constructor(
    private readonly tableName: string,
    private readonly client = new DynamoDBClient({})
  ) {}

  async getRoomState(roomId: string): Promise<RoomState | null> {
    const result = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: roomKey(roomId)
    }));
    const rawState = result.Item?.state?.S;
    if (!rawState) {
      return null;
    }
    return JSON.parse(rawState) as RoomState;
  }

  async saveRoomState(state: RoomState): Promise<void> {
    await this.client.send(new PutItemCommand({
      TableName: this.tableName,
      Item: {
        ...roomKey(state.room.roomId),
        roomId: { S: state.room.roomId },
        ttl: { N: String(state.room.ttl) },
        state: { S: JSON.stringify(state) }
      }
    }));
  }
}

export function createRoomRepositoryFromEnv(): RoomRepository {
  const tableName = process.env.GAME_TABLE_NAME;
  return tableName ? new DynamoRoomRepository(tableName) : new MemoryRoomRepository();
}

export function makeInitialRoom(nickname: string, avatarId: AvatarId, now = new Date()): { state: RoomState; playerToken: string; hostToken: string } {
  const roomId = generateRoomId();
  const playerId = `p_${randomUUID()}`;
  const playerToken = randomToken();
  const hostToken = randomToken();
  const isoNow = now.toISOString();
  const ttl = Math.floor(now.getTime() / 1000) + 60 * 60 * 24;

  const host: StoredPlayer = {
    playerId,
    nickname,
    avatarId,
    score: 0,
    correctCount: 0,
    assistCount: 0,
    isHost: true,
    joinedAt: isoNow,
    lastSeenAt: isoNow,
    tokenHash: hashToken(playerToken)
  };

  return {
    playerToken,
    hostToken,
    state: {
      room: {
        roomId,
        status: "LOBBY",
        hostPlayerId: playerId,
        hostTokenHash: hashToken(hostToken),
        settings: defaultRoomSettings,
        currentRoundNo: 0,
        usedTopicIds: [],
        createdAt: isoNow,
        updatedAt: isoNow,
        ttl
      },
      players: [host],
      round: null,
      hints: [],
      topics: initialTopics
    }
  };
}

export function makePlayer(nickname: string, avatarId: AvatarId, now = new Date()): { player: StoredPlayer; playerToken: string } {
  const playerToken = randomToken();
  const isoNow = now.toISOString();
  return {
    playerToken,
    player: {
      playerId: `p_${randomUUID()}`,
      nickname,
      avatarId,
      score: 0,
      correctCount: 0,
      assistCount: 0,
      isHost: false,
      joinedAt: isoNow,
      lastSeenAt: isoNow,
      tokenHash: hashToken(playerToken)
    }
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function generateRoomId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)] ?? "A").join("");
}

function roomKey(roomId: string): Record<string, AttributeValue> {
  return {
    PK: { S: `ROOM#${roomId.toUpperCase()}` },
    SK: { S: "STATE" }
  };
}
