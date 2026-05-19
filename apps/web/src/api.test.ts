import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRoom,
  fetchSnapshot,
  fetchWebSocketTicket,
  joinRoom,
  nextRound,
  skipAnswer,
  startGame,
  submitAnswer,
  submitHint
} from "./api";

describe("web api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts room creation and join requests to the spec endpoints", async () => {
    const fetchMock = installFetch({ roomId: "ABCD12", playerId: "p_001", playerToken: "player-token", snapshot: {} });

    await createRoom({ nickname: "さくら", avatarId: "rabbit" });
    expect(lastRequest(fetchMock)).toMatchObject({
      url: "/api/v1/rooms",
      init: {
        method: "POST",
        body: JSON.stringify({ nickname: "さくら", avatarId: "rabbit" })
      }
    });
    expect(headersOf(lastRequest(fetchMock).init)).toMatchObject({ "Content-Type": "application/json" });

    await joinRoom("ABCD12", { nickname: "ぺんたろう", avatarId: "penguin" });
    expect(lastRequest(fetchMock)).toMatchObject({
      url: "/api/v1/rooms/ABCD12/join",
      init: {
        method: "POST",
        body: JSON.stringify({ nickname: "ぺんたろう", avatarId: "penguin" })
      }
    });
  });

  it("sends Guest and Host authorization headers for protected operations", async () => {
    const fetchMock = installFetch({ ticket: "ws-ticket", expiresIn: 60, wsUrl: "wss://example.com/ws/v1?ticket=ws-ticket" });

    await fetchSnapshot("ABCD12", { playerToken: "player-token" });
    expect(lastRequest(fetchMock).url).toBe("/api/v1/rooms/ABCD12/snapshot");
    expect(headersOf(lastRequest(fetchMock).init)).toMatchObject({ Authorization: "Guest player-token" });

    await fetchWebSocketTicket("ABCD12", "player-token");
    expect(lastRequest(fetchMock)).toMatchObject({
      url: "/api/v1/rooms/ABCD12/ws-ticket",
      init: { method: "POST" }
    });
    expect(headersOf(lastRequest(fetchMock).init)).toMatchObject({ Authorization: "Guest player-token" });

    await startGame("ABCD12", "host-token");
    expect(lastRequest(fetchMock)).toMatchObject({
      url: "/api/v1/rooms/ABCD12/start",
      init: { method: "POST" }
    });
    expect(headersOf(lastRequest(fetchMock).init)).toMatchObject({ Authorization: "Host host-token" });

    await nextRound("ABCD12", "host-token");
    expect(lastRequest(fetchMock)).toMatchObject({
      url: "/api/v1/rooms/ABCD12/next-round",
      init: { method: "POST" }
    });
    expect(headersOf(lastRequest(fetchMock).init)).toMatchObject({ Authorization: "Host host-token" });
  });

  it("posts round actions to hint, answer, and skip endpoints", async () => {
    const fetchMock = installFetch({ roomId: "ABCD12", players: [], hints: [], permissions: {} });

    await submitHint("ABCD12", 1, "player-token", "あまい");
    expect(lastRequest(fetchMock)).toMatchObject({
      url: "/api/v1/rooms/ABCD12/rounds/1/hints",
      init: {
        method: "POST",
        body: JSON.stringify({ hint: "あまい" })
      }
    });
    expect(headersOf(lastRequest(fetchMock).init)).toMatchObject({ Authorization: "Guest player-token" });

    await submitAnswer("ABCD12", 1, "answerer-token", "パンケーキ");
    expect(lastRequest(fetchMock)).toMatchObject({
      url: "/api/v1/rooms/ABCD12/rounds/1/answers",
      init: {
        method: "POST",
        body: JSON.stringify({ answer: "パンケーキ" })
      }
    });
    expect(headersOf(lastRequest(fetchMock).init)).toMatchObject({ Authorization: "Guest answerer-token" });

    await skipAnswer("ABCD12", 1, "answerer-token");
    expect(lastRequest(fetchMock)).toMatchObject({
      url: "/api/v1/rooms/ABCD12/rounds/1/skip",
      init: { method: "POST" }
    });
    expect(lastRequest(fetchMock).init.body).toBeUndefined();
    expect(headersOf(lastRequest(fetchMock).init)).toMatchObject({ Authorization: "Guest answerer-token" });
  });

  it("throws the API error message returned by the server", async () => {
    installFetch({ error: { code: "INVALID_HINT", message: "ヒント形式不正" } }, false);

    await expect(submitHint("ABCD12", 1, "player-token", "ABC"))
      .rejects.toThrow("ヒント形式不正");
  });
});

function installFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok,
    json: async () => body
  } as Response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastRequest(fetchMock: ReturnType<typeof installFetch>): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) {
    throw new Error("fetch was not called");
  }
  const [url, init = {}] = call;
  return { url: String(url), init };
}

function headersOf(init: RequestInit): Record<string, string> {
  const headers = init.headers;
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers as Record<string, string>;
}
