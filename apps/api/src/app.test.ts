import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { GameService } from "./service";
import { MemoryRoomRepository } from "./store";

describe("api", () => {
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
});
