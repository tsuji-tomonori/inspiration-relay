export interface RoomSnapshotUpdatedMessage {
  type: "room.snapshot.updated";
  roomId: string;
  reason: string;
  occurredAt: string;
}

export function resolveWebSocketUrl(wsUrl: string): string {
  const url = new URL(wsUrl, window.location.href);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  return url.toString();
}

export function parseRoomSnapshotUpdatedMessage(data: unknown): RoomSnapshotUpdatedMessage | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(data) as Partial<RoomSnapshotUpdatedMessage>;
    if (parsed.type !== "room.snapshot.updated" || typeof parsed.roomId !== "string") {
      return null;
    }
    return {
      type: "room.snapshot.updated",
      roomId: parsed.roomId,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      occurredAt: typeof parsed.occurredAt === "string" ? parsed.occurredAt : ""
    };
  } catch {
    return null;
  }
}
