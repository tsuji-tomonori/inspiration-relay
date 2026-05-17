import { describe, expect, it } from "vitest";
import { MemoryRealtimeRepository, type RoomEventBroadcaster, type RoomUpdateReason } from "./realtime";
import { ApiError, GameService } from "./service";
import { MemoryRoomRepository } from "./store";

class RecordingBroadcaster implements RoomEventBroadcaster {
  readonly events: Array<{ roomId: string; reason: RoomUpdateReason }> = [];

  async broadcastRoomUpdate(roomId: string, reason: RoomUpdateReason): Promise<void> {
    this.events.push({ roomId, reason });
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

  it("回答者のsnapshotにはtopicDisplayを含めない", async () => {
    const { service, host } = await createThreePlayerRoom();

    const snapshot = await service.startGame(host.roomId, host.hostToken ?? "");

    expect(snapshot.viewerRole).toBe("answerer");
    expect(snapshot.round?.answererPlayerId).toBe(host.playerId);
    expect(snapshot.round?.topicDisplay).toBeUndefined();
    expect(snapshot.round?.answerKana).toBeUndefined();
    expect(snapshot.round?.aliases).toBeUndefined();
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
