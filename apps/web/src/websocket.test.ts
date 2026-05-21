import { describe, expect, it } from "vitest";
import { parseRoomSnapshotUpdatedMessage, resolveWebSocketUrl } from "./websocket";

describe("resolveWebSocketUrl", () => {
  it("https URLをwss URLへ変換する", () => {
    expect(resolveWebSocketUrl("https://example.com/ws/v1?ticket=abc")).toBe("wss://example.com/ws/v1?ticket=abc");
  });

  it("http URLをws URLへ変換する", () => {
    expect(resolveWebSocketUrl("http://example.com/ws/v1?ticket=abc")).toBe("ws://example.com/ws/v1?ticket=abc");
  });

  it("相対URLを現在origin基準のWebSocket URLへ変換する", () => {
    expect(resolveWebSocketUrl("/ws/v1?ticket=abc")).toBe("ws://localhost:3000/ws/v1?ticket=abc");
  });

  it("wss URLはそのまま返す", () => {
    expect(resolveWebSocketUrl("wss://example.com/ws/v1?ticket=abc")).toBe("wss://example.com/ws/v1?ticket=abc");
  });
});

describe("parseRoomSnapshotUpdatedMessage", () => {
  it("room.snapshot.updated reason=game.startedをparseする", () => {
    expect(parseRoomSnapshotUpdatedMessage(JSON.stringify({
      type: "room.snapshot.updated",
      roomId: "ABCD12",
      reason: "game.started",
      occurredAt: "2026-05-17T00:00:00.000Z"
    }))).toEqual({
      type: "room.snapshot.updated",
      roomId: "ABCD12",
      reason: "game.started",
      occurredAt: "2026-05-17T00:00:00.000Z"
    });
  });

  it("hint.submittedやround.resultもsnapshot更新通知としてparseする", () => {
    expect(parseRoomSnapshotUpdatedMessage(JSON.stringify({
      type: "room.snapshot.updated",
      roomId: "ABCD12",
      reason: "hint.submitted",
      occurredAt: "2026-05-17T00:00:00.000Z"
    }))?.reason).toBe("hint.submitted");
    expect(parseRoomSnapshotUpdatedMessage(JSON.stringify({
      type: "room.snapshot.updated",
      roomId: "ABCD12",
      reason: "round.result",
      occurredAt: "2026-05-17T00:00:00.000Z"
    }))?.reason).toBe("round.result");
  });

  it("player.joined理由のroom.snapshot.updatedをparseする", () => {
    expect(parseRoomSnapshotUpdatedMessage(JSON.stringify({
      type: "room.snapshot.updated",
      roomId: "ABCD12",
      reason: "player.joined",
      occurredAt: "2026-05-17T00:00:00.000Z"
    }))).toEqual({
      type: "room.snapshot.updated",
      roomId: "ABCD12",
      reason: "player.joined",
      occurredAt: "2026-05-17T00:00:00.000Z"
    });
  });

  it("JSONではないdataはnullを返す", () => {
    expect(parseRoomSnapshotUpdatedMessage("not json")).toBeNull();
  });

  it("typeが違うmessageはnullを返す", () => {
    expect(parseRoomSnapshotUpdatedMessage(JSON.stringify({
      type: "game.started",
      roomId: "ABCD12",
      reason: "game.started"
    }))).toBeNull();
  });

  it("roomIdがないmessageはnullを返す", () => {
    expect(parseRoomSnapshotUpdatedMessage(JSON.stringify({
      type: "room.snapshot.updated",
      reason: "game.started"
    }))).toBeNull();
  });
});
