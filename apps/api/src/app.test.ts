import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryRealtimeRepository, type RoomEventBroadcaster, type RoomUpdateReason } from "./realtime";
import { GameService } from "./service";
import { hashToken, MemoryRoomRepository } from "./store";
import { createWebSocketHandlers } from "./ws-handler";

class RecordingBroadcaster implements RoomEventBroadcaster {
  readonly events: Array<{ roomId: string; reason: RoomUpdateReason }> = [];

  async broadcastRoomUpdate(roomId: string, reason: RoomUpdateReason): Promise<void> {
    this.events.push({ roomId, reason });
  }
}

describe("api", () => {
  it("serves OpenAPI from the runtime route", async () => {
    const app = createApp(new GameService(new MemoryRoomRepository()));
    const response = await app.request("/api/openapi.json");
    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/api/v1/rooms"].post.summary).toBe("ルームを作成");
  });

  it("creates and joins a room", async () => {
    const app = createApp(new GameService(new MemoryRoomRepository()));
    const createResponse = await app.request("/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ nickname: "さくら", avatarId: "rabbit" }),
      headers: { "Content-Type": "application/json" }
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.roomId).toMatch(/^[A-Z2-9]{6}$/);

    const joinResponse = await app.request(`/api/v1/rooms/${created.roomId}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname: "ぺんたろう", avatarId: "penguin" }),
      headers: { "Content-Type": "application/json" }
    });
    expect(joinResponse.status).toBe(200);
    const joined = await joinResponse.json();
    expect(joined.snapshot.players).toHaveLength(2);
  });

  it("notifies the room when a player joins", async () => {
    const broadcaster = new RecordingBroadcaster();
    const service = new GameService(new MemoryRoomRepository(), new MemoryRealtimeRepository(), broadcaster);
    const created = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });

    await service.joinRoom(created.roomId, { nickname: "ぺんたろう", avatarId: "penguin" });

    expect(broadcaster.events).toEqual([
      { roomId: created.roomId, reason: "player.joined" }
    ]);
  });

  it("notifies the room after game state changes", async () => {
    const broadcaster = new RecordingBroadcaster();
    const repository = new MemoryRoomRepository();
    const service = new GameService(repository, new MemoryRealtimeRepository(), broadcaster);
    const created = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });
    const joined1 = await service.joinRoom(created.roomId, { nickname: "ぺんたろう", avatarId: "penguin" });
    const joined2 = await service.joinRoom(created.roomId, { nickname: "ひよこ", avatarId: "chick" });

    await service.startGame(created.roomId, created.hostToken ?? "");
    await service.submitHint(created.roomId, 1, joined1.playerToken, "あまい");
    await service.submitHint(created.roomId, 1, joined2.playerToken, "まるい");
    await service.submitAnswer(created.roomId, 1, created.playerToken, "ちがう");
    await service.submitAnswer(created.roomId, 1, created.playerToken, "ぱんけーき");
    await service.nextRound(created.roomId, created.hostToken ?? "");

    const state = await repository.getRoomState(created.roomId);
    expect(state?.round).toBeTruthy();
    if (state?.round) {
      state.room.currentRoundNo = state.players.length;
      state.round.status = "ROUND_RESULT";
      await repository.saveRoomState(state);
    }
    await service.nextRound(created.roomId, created.hostToken ?? "");

    expect(broadcaster.events.map((event) => event.reason)).toEqual([
      "player.joined",
      "player.joined",
      "game.started",
      "hint.submitted",
      "answering.started",
      "hint.revealed",
      "round.result",
      "round.started",
      "game.result"
    ]);
  });

  it("separates host permissions from answerer and hinter roles", async () => {
    const service = new GameService(new MemoryRoomRepository(), new MemoryRealtimeRepository(), new RecordingBroadcaster());
    const created = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });
    const joined1 = await service.joinRoom(created.roomId, { nickname: "ぺんたろう", avatarId: "penguin" });
    const joined2 = await service.joinRoom(created.roomId, { nickname: "ひよこ", avatarId: "chick" });

    const hostSnapshot = await service.startGame(created.roomId, created.hostToken ?? "");
    expect(hostSnapshot.viewerRole).toBe("answerer");
    expect(hostSnapshot.round?.topicDisplay).toBeUndefined();
    expect(hostSnapshot.permissions.canSubmitAnswer).toBe(false);
    expect(hostSnapshot.permissions.canSubmitHint).toBe(false);

    const joinedSnapshot = await service.snapshot(created.roomId, joined1.playerToken);
    expect(joinedSnapshot.viewerRole).toBe("hinter");
    expect(joinedSnapshot.round?.topicDisplay).toBe("パンケーキ");
    expect(joinedSnapshot.permissions.canSubmitHint).toBe(true);
    expect(joinedSnapshot.permissions.canSubmitAnswer).toBe(false);

    await service.submitHint(created.roomId, 1, joined1.playerToken, "あまい");
    const submittedSnapshot = await service.snapshot(created.roomId, joined1.playerToken);
    expect(submittedSnapshot.permissions.canSubmitHint).toBe(false);

    await service.submitHint(created.roomId, 1, joined2.playerToken, "まるい");
    const answeringHostSnapshot = await service.snapshot(created.roomId, created.playerToken);
    expect(answeringHostSnapshot.viewerRole).toBe("answerer");
    expect(answeringHostSnapshot.round?.topicDisplay).toBeUndefined();
    expect(answeringHostSnapshot.permissions.canSubmitAnswer).toBe(true);
  });

  it("stores websocket tickets and registers authorized connections", async () => {
    const realtimeRepository = new MemoryRealtimeRepository();
    const service = new GameService(new MemoryRoomRepository(), realtimeRepository, new RecordingBroadcaster());
    const created = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });
    const ticketResponse = await service.wsTicket(created.roomId, created.playerToken);
    const ticket = new URL(ticketResponse.wsUrl, "https://example.com").searchParams.get("ticket");
    expect(ticket).toBeTruthy();

    const handlers = createWebSocketHandlers(realtimeRepository);
    const connected = await handlers.connectHandler({
      requestContext: {
        routeKey: "$connect",
        connectionId: "conn-1"
      },
      queryStringParameters: { ticket: ticket ?? undefined }
    });

    expect(connected.statusCode).toBe(200);
    await expect(realtimeRepository.consumeTicket(hashToken(ticket ?? ""))).resolves.toBeNull();
    await expect(realtimeRepository.listConnectionsByRoom(created.roomId)).resolves.toEqual([
      expect.objectContaining({
        connectionId: "conn-1",
        roomId: created.roomId,
        playerId: created.playerId
      })
    ]);

    const disconnected = await handlers.disconnectHandler({
      requestContext: {
        routeKey: "$disconnect",
        connectionId: "conn-1"
      }
    });
    expect(disconnected.statusCode).toBe(200);
    await expect(realtimeRepository.listConnectionsByRoom(created.roomId)).resolves.toEqual([]);
  });

  it("returns the configured websocket stage URL in tickets", async () => {
    const originalWebSocketUrl = process.env.WEBSOCKET_URL;
    process.env.WEBSOCKET_URL = "wss://example.execute-api.ap-northeast-1.amazonaws.com/v1";
    try {
      const service = new GameService(new MemoryRoomRepository(), new MemoryRealtimeRepository(), new RecordingBroadcaster());
      const created = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });

      const ticketResponse = await service.wsTicket(created.roomId, created.playerToken);
      const wsUrl = new URL(ticketResponse.wsUrl);

      expect(wsUrl.origin).toBe("wss://example.execute-api.ap-northeast-1.amazonaws.com");
      expect(wsUrl.pathname).toBe("/v1");
      expect(wsUrl.searchParams.get("ticket")).toBeTruthy();
    } finally {
      if (originalWebSocketUrl === undefined) {
        delete process.env.WEBSOCKET_URL;
      } else {
        process.env.WEBSOCKET_URL = originalWebSocketUrl;
      }
    }
  });
});
