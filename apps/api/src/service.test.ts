import { describe, expect, it } from "vitest";
import { MemoryRealtimeRepository, type RoomEventBroadcaster, type RoomUpdateReason } from "./realtime";
import { ApiError, GameService } from "./service";
import { MemoryRoomRepository, type RoomRepository, type RoomState } from "./store";

class RecordingBroadcaster implements RoomEventBroadcaster {
  readonly events: Array<{ roomId: string; reason: RoomUpdateReason }> = [];

  async broadcastRoomUpdate(roomId: string, reason: RoomUpdateReason): Promise<void> {
    this.events.push({ roomId, reason });
  }
}

class CloneOnReadRoomRepository implements RoomRepository {
  savedState: RoomState | null = null;

  constructor(private readonly callOrder: string[]) {}

  async getRoomState(roomId: string): Promise<RoomState | null> {
    if (this.savedState?.room.roomId !== roomId.toUpperCase()) {
      return null;
    }
    return structuredClone(this.savedState);
  }

  async saveRoomState(state: RoomState): Promise<void> {
    this.callOrder.push("saveRoomState");
    this.savedState = structuredClone(state);
  }
}

class OrderedBroadcaster implements RoomEventBroadcaster {
  readonly events: Array<{ roomId: string; reason: RoomUpdateReason; savedState: RoomState | null }> = [];

  constructor(
    private readonly repository: CloneOnReadRoomRepository,
    private readonly callOrder: string[]
  ) {}

  async broadcastRoomUpdate(roomId: string, reason: RoomUpdateReason): Promise<void> {
    this.callOrder.push("broadcastRoomUpdate");
    this.events.push({ roomId, reason, savedState: structuredClone(this.repository.savedState) });
  }
}

async function createThreePlayerRoom() {
  const repository = new MemoryRoomRepository();
  const broadcaster = new RecordingBroadcaster();
  const service = new GameService(repository, new MemoryRealtimeRepository(), broadcaster);
  const host = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });
  const second = await service.joinRoom(host.roomId, { nickname: "ぺんたろう", avatarId: "penguin" });
  const third = await service.joinRoom(host.roomId, { nickname: "ひよこ", avatarId: "chick" });

  return { service, broadcaster, host, second, third };
}

async function finishFirstRound(service: GameService, roomId: string, hostToken: string, answererToken: string, hinterTokens: string[]): Promise<void> {
  await service.startGame(roomId, hostToken);
  await service.submitHint(roomId, 1, hinterTokens[0] ?? "", "あまい");
  await service.submitHint(roomId, 1, hinterTokens[1] ?? "", "まるい");
  await service.skipAnswer(roomId, 1, answererToken);
  await service.skipAnswer(roomId, 1, answererToken);
}

describe("GameService.startGame", () => {
  it("3人以上のLOBBYでゲームを開始し、HINT_SUBMITTINGのroundを作る", async () => {
    const { service, host } = await createThreePlayerRoom();

    const snapshot = await service.startGame(host.roomId, host.hostToken ?? "");

    expect(snapshot.status).toBe("IN_GAME");
    expect(snapshot.currentRoundNo).toBe(1);
    expect(snapshot.round).toEqual(expect.objectContaining({
      roundNo: 1,
      status: "HINT_SUBMITTING",
      answererPlayerId: host.playerId,
      revealedHintCount: 0,
      result: null
    }));
  });

  it("ゲーム開始後にroom.snapshot.updated reason=game.startedをbroadcastする", async () => {
    const { service, broadcaster, host } = await createThreePlayerRoom();
    broadcaster.events.length = 0;

    await service.startGame(host.roomId, host.hostToken ?? "");

    expect(broadcaster.events).toEqual([
      { roomId: host.roomId, reason: "game.started" }
    ]);
  });

  it("永続化後にgame.startedをbroadcastする", async () => {
    const callOrder: string[] = [];
    const repository = new CloneOnReadRoomRepository(callOrder);
    const broadcaster = new OrderedBroadcaster(repository, callOrder);
    const service = new GameService(repository, new MemoryRealtimeRepository(), broadcaster);
    const host = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });
    await service.joinRoom(host.roomId, { nickname: "ぺんたろう", avatarId: "penguin" });
    await service.joinRoom(host.roomId, { nickname: "ひよこ", avatarId: "chick" });
    callOrder.length = 0;
    broadcaster.events.length = 0;

    await service.startGame(host.roomId, host.hostToken ?? "");

    expect(callOrder).toEqual(["saveRoomState", "broadcastRoomUpdate"]);
    expect(repository.savedState?.room.status).toBe("IN_GAME");
    expect(repository.savedState?.room.currentRoundNo).toBe(1);
    expect(repository.savedState?.round?.status).toBe("HINT_SUBMITTING");
    expect(broadcaster.events).toEqual([
      expect.objectContaining({
        roomId: host.roomId,
        reason: "game.started",
        savedState: expect.objectContaining({
          room: expect.objectContaining({
            status: "IN_GAME",
            currentRoundNo: 1
          }),
          round: expect.objectContaining({
            status: "HINT_SUBMITTING"
          })
        })
      })
    ]);
  });

  it("回答者のsnapshotにはtopicDisplayを含めない", async () => {
    const { service, host } = await createThreePlayerRoom();

    const snapshot = await service.startGame(host.roomId, host.hostToken ?? "");

    expect(snapshot.viewerRole).toBe("answerer");
    expect(snapshot.round?.answererPlayerId).toBe(host.playerId);
    expect(snapshot.round?.topicDisplay).toBeUndefined();
    expect(snapshot.round?.answerKana).toBeUndefined();
    expect(snapshot.round?.aliases).toBeUndefined();
  });

  it("2ラウンド目で非ホストが回答者になってもtopicDisplayと答え情報を秘匿する", async () => {
    const { service, host, second, third } = await createThreePlayerRoom();

    await finishFirstRound(service, host.roomId, host.hostToken ?? "", host.playerToken, [second.playerToken, third.playerToken]);
    await service.nextRound(host.roomId, host.hostToken ?? "");

    const answererSnapshot = await service.snapshot(host.roomId, second.playerToken);
    expect(answererSnapshot.viewerRole).toBe("answerer");
    expect(answererSnapshot.round?.answererPlayerId).toBe(second.playerId);
    expect(answererSnapshot.round?.topicDisplay).toBeUndefined();
    expect(answererSnapshot.round?.answerKana).toBeUndefined();
    expect(answererSnapshot.round?.aliases).toBeUndefined();

    const hostSnapshot = await service.snapshot(host.roomId, host.playerToken);
    expect(hostSnapshot.viewerRole).toBe("hinter");
    expect(hostSnapshot.round?.answererPlayerId).toBe(second.playerId);
    expect(hostSnapshot.round?.topicDisplay).toBeTruthy();
    expect(hostSnapshot.round?.answerKana).toBeUndefined();
    expect(hostSnapshot.round?.aliases).toBeUndefined();
  });

  it("ヒント役のsnapshotにはtopicDisplayを含める", async () => {
    const { service, host, second } = await createThreePlayerRoom();

    await service.startGame(host.roomId, host.hostToken ?? "");
    const snapshot = await service.snapshot(host.roomId, second.playerToken);

    expect(snapshot.viewerRole).toBe("hinter");
    expect(snapshot.round?.answererPlayerId).toBe(host.playerId);
    expect(snapshot.round?.topicDisplay).toBeTruthy();
    expect(snapshot.round?.answerKana).toBeUndefined();
    expect(snapshot.round?.aliases).toBeUndefined();
  });

  it("非ホストはゲームを開始できない", async () => {
    const { service, host, second } = await createThreePlayerRoom();

    await expect(service.startGame(host.roomId, second.playerToken)).rejects.toMatchObject({
      code: "HOST_ONLY",
      status: 403
    } satisfies Partial<ApiError>);
  });

  it("3人未満ではゲームを開始できない", async () => {
    const repository = new MemoryRoomRepository();
    const service = new GameService(repository, new MemoryRealtimeRepository(), new RecordingBroadcaster());
    const host = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });
    await service.joinRoom(host.roomId, { nickname: "ぺんたろう", avatarId: "penguin" });

    await expect(service.startGame(host.roomId, host.hostToken ?? "")).rejects.toMatchObject({
      code: "INVALID_ROOM_STATUS",
      message: "3人以上で開始できます",
      status: 409
    } satisfies Partial<ApiError>);
  });
});

describe("GameService.snapshot start permission", () => {
  it("3人目参加後、ホストのsnapshotでcanStartGameがtrueになる", async () => {
    const repository = new MemoryRoomRepository();
    const service = new GameService(repository, new MemoryRealtimeRepository(), new RecordingBroadcaster());
    const host = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });

    await service.joinRoom(host.roomId, { nickname: "ぺんたろう", avatarId: "penguin" });

    let snapshot = await service.snapshot(host.roomId, host.playerToken);
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.permissions.canStartGame).toBe(false);

    await service.joinRoom(host.roomId, { nickname: "ひよこ", avatarId: "chick" });

    snapshot = await service.snapshot(host.roomId, host.playerToken);
    expect(snapshot.players).toHaveLength(3);
    expect(snapshot.hostPlayerId).toBe(host.playerId);
    expect(snapshot.viewerPlayerId).toBe(host.playerId);
    expect(snapshot.permissions.canStartGame).toBe(true);
  });

  it("3人いても非ホストのsnapshotではcanStartGameがfalseになる", async () => {
    const repository = new MemoryRoomRepository();
    const service = new GameService(repository, new MemoryRealtimeRepository(), new RecordingBroadcaster());
    const host = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });
    const guest = await service.joinRoom(host.roomId, { nickname: "ぺんたろう", avatarId: "penguin" });

    await service.joinRoom(host.roomId, { nickname: "ひよこ", avatarId: "chick" });

    const snapshot = await service.snapshot(host.roomId, guest.playerToken);
    expect(snapshot.players).toHaveLength(3);
    expect(snapshot.hostPlayerId).toBe(host.playerId);
    expect(snapshot.viewerPlayerId).toBe(guest.playerId);
    expect(snapshot.permissions.canStartGame).toBe(false);
  });
});
