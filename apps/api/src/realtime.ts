import { ApiGatewayManagementApiClient, GoneException, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { DeleteItemCommand, DynamoDBClient, PutItemCommand, QueryCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";

export type RoomUpdateReason = "player.joined" | "game.started";

export interface RoomUpdateEvent {
  type: "room.snapshot.updated";
  roomId: string;
  reason: RoomUpdateReason;
  occurredAt: string;
}

export interface StoredWsTicket {
  ticketHash: string;
  roomId: string;
  playerId: string;
  expiresAt: string;
  ttl: number;
}

export interface StoredWsConnection {
  connectionId: string;
  roomId: string;
  playerId: string;
  connectedAt: string;
  ttl: number;
}

export interface RealtimeRepository {
  saveTicket(ticket: StoredWsTicket): Promise<void>;
  consumeTicket(ticketHash: string): Promise<StoredWsTicket | null>;
  saveConnection(connection: StoredWsConnection): Promise<void>;
  deleteConnection(connectionId: string): Promise<void>;
  listConnectionsByRoom(roomId: string): Promise<StoredWsConnection[]>;
}

export interface RoomEventBroadcaster {
  broadcastRoomUpdate(roomId: string, reason: RoomUpdateReason): Promise<void>;
}

export class MemoryRealtimeRepository implements RealtimeRepository {
  private readonly tickets = new Map<string, StoredWsTicket>();
  private readonly connections = new Map<string, StoredWsConnection>();

  async saveTicket(ticket: StoredWsTicket): Promise<void> {
    this.tickets.set(ticket.ticketHash, structuredClone(ticket));
  }

  async consumeTicket(ticketHash: string): Promise<StoredWsTicket | null> {
    const ticket = this.tickets.get(ticketHash);
    this.tickets.delete(ticketHash);
    if (!ticket || new Date(ticket.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    return structuredClone(ticket);
  }

  async saveConnection(connection: StoredWsConnection): Promise<void> {
    this.connections.set(connection.connectionId, structuredClone(connection));
  }

  async deleteConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
  }

  async listConnectionsByRoom(roomId: string): Promise<StoredWsConnection[]> {
    return [...this.connections.values()]
      .filter((connection) => connection.roomId === roomId)
      .map((connection) => structuredClone(connection));
  }
}

export class DynamoRealtimeRepository implements RealtimeRepository {
  constructor(
    private readonly tableName: string,
    private readonly client = new DynamoDBClient({})
  ) {}

  async saveTicket(ticket: StoredWsTicket): Promise<void> {
    await this.client.send(new PutItemCommand({
      TableName: this.tableName,
      Item: {
        connectionId: { S: ticketPk(ticket.ticketHash) },
        kind: { S: "ticket" },
        ticketHash: { S: ticket.ticketHash },
        roomId: { S: ticket.roomId },
        playerId: { S: ticket.playerId },
        expiresAt: { S: ticket.expiresAt },
        ttl: { N: String(ticket.ttl) }
      }
    }));
  }

  async consumeTicket(ticketHash: string): Promise<StoredWsTicket | null> {
    const key = { connectionId: { S: ticketPk(ticketHash) } };
    const result = await this.client.send(new DeleteItemCommand({
      TableName: this.tableName,
      Key: key,
      ReturnValues: "ALL_OLD"
    }));
    if (!result.Attributes) {
      return null;
    }
    const ticket = readTicket(result.Attributes);
    if (!ticket || new Date(ticket.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    return ticket;
  }

  async saveConnection(connection: StoredWsConnection): Promise<void> {
    await this.client.send(new PutItemCommand({
      TableName: this.tableName,
      Item: {
        connectionId: { S: connection.connectionId },
        kind: { S: "connection" },
        roomId: { S: connection.roomId },
        playerId: { S: connection.playerId },
        connectedAt: { S: connection.connectedAt },
        ttl: { N: String(connection.ttl) },
        GSI1PK: { S: roomPk(connection.roomId) },
        GSI1SK: { S: `CONNECTION#${connection.connectionId}` }
      }
    }));
  }

  async deleteConnection(connectionId: string): Promise<void> {
    await this.client.send(new DeleteItemCommand({
      TableName: this.tableName,
      Key: { connectionId: { S: connectionId } }
    }));
  }

  async listConnectionsByRoom(roomId: string): Promise<StoredWsConnection[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: "ByRoom",
      KeyConditionExpression: "GSI1PK = :room",
      ExpressionAttributeValues: {
        ":room": { S: roomPk(roomId) }
      }
    }));
    return (result.Items ?? []).map(readConnection).filter((connection): connection is StoredWsConnection => Boolean(connection));
  }
}

export class NoopRoomEventBroadcaster implements RoomEventBroadcaster {
  async broadcastRoomUpdate(_roomId: string, _reason: RoomUpdateReason): Promise<void> {}
}

export class ApiGatewayRoomEventBroadcaster implements RoomEventBroadcaster {
  constructor(
    private readonly repository: RealtimeRepository,
    endpoint: string,
    private readonly client = new ApiGatewayManagementApiClient({ endpoint })
  ) {}

  async broadcastRoomUpdate(roomId: string, reason: RoomUpdateReason): Promise<void> {
    const event: RoomUpdateEvent = {
      type: "room.snapshot.updated",
      roomId,
      reason,
      occurredAt: new Date().toISOString()
    };
    const payload = new TextEncoder().encode(JSON.stringify(event));
    const connections = await this.repository.listConnectionsByRoom(roomId);

    await Promise.all(connections.map(async (connection) => {
      try {
        await this.client.send(new PostToConnectionCommand({
          ConnectionId: connection.connectionId,
          Data: payload
        }));
      } catch (error) {
        if (error instanceof GoneException || isGoneError(error)) {
          await this.repository.deleteConnection(connection.connectionId);
          return;
        }
        throw error;
      }
    }));
  }
}

export function createRealtimeRepositoryFromEnv(): RealtimeRepository {
  const tableName = process.env.CONNECTION_TABLE_NAME;
  return tableName ? new DynamoRealtimeRepository(tableName) : new MemoryRealtimeRepository();
}

export function createRoomEventBroadcasterFromEnv(repository: RealtimeRepository): RoomEventBroadcaster {
  const endpoint = process.env.WEBSOCKET_MANAGEMENT_ENDPOINT;
  return endpoint ? new ApiGatewayRoomEventBroadcaster(repository, endpoint) : new NoopRoomEventBroadcaster();
}

export function ttlFromNow(seconds: number, now = new Date()): number {
  return Math.floor(now.getTime() / 1000) + seconds;
}

function ticketPk(ticketHash: string): string {
  return `TICKET#${ticketHash}`;
}

function roomPk(roomId: string): string {
  return `ROOM#${roomId}`;
}

function readTicket(item: Record<string, AttributeValue>): StoredWsTicket | null {
  const ticketHash = item.ticketHash?.S;
  const roomId = item.roomId?.S;
  const playerId = item.playerId?.S;
  const expiresAt = item.expiresAt?.S;
  const ttl = Number(item.ttl?.N);
  if (!ticketHash || !roomId || !playerId || !expiresAt || !Number.isFinite(ttl)) {
    return null;
  }
  return { ticketHash, roomId, playerId, expiresAt, ttl };
}

function readConnection(item: Record<string, AttributeValue>): StoredWsConnection | null {
  const connectionId = item.connectionId?.S;
  const roomId = item.roomId?.S;
  const playerId = item.playerId?.S;
  const connectedAt = item.connectedAt?.S;
  const ttl = Number(item.ttl?.N);
  if (!connectionId || !roomId || !playerId || !connectedAt || !Number.isFinite(ttl)) {
    return null;
  }
  return { connectionId, roomId, playerId, connectedAt, ttl };
}

function isGoneError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "$metadata" in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 410;
}
