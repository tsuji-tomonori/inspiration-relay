import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { RoomSnapshot } from "@hirameki-relay/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const apiMocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  fetchSnapshot: vi.fn(),
  fetchWebSocketTicket: vi.fn(),
  joinRoom: vi.fn(),
  nextRound: vi.fn(),
  skipAnswer: vi.fn(),
  startGame: vi.fn(),
  submitAnswer: vi.fn(),
  submitHint: vi.fn()
}));

vi.mock("./api", () => apiMocks);

const storageKey = "hirameki-relay-session";

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readonly close = vi.fn(() => {
    this.dispatch("close", new Event("close"));
  });

  private readonly listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open(): void {
    this.dispatch("open", new Event("open"));
  }

  message(data: string): void {
    this.dispatch("message", new MessageEvent("message", { data }));
  }
}

describe("App WebSocket synchronization", () => {
  beforeEach(() => {
    sessionStorage.clear();
    MockWebSocket.instances = [];
    vi.clearAllMocks();
    vi.stubGlobal("WebSocket", MockWebSocket);
    sessionStorage.setItem(storageKey, JSON.stringify({
      roomId: "ABCD12",
      playerId: "p2",
      playerToken: "player-token"
    }));
    apiMocks.fetchWebSocketTicket.mockResolvedValue({
      ticket: "ticket",
      expiresIn: 30,
      wsUrl: "/ws/v1?ticket=ticket"
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("room.snapshot.updated reason=game.startedを受信するとsnapshotを再取得する", async () => {
    apiMocks.fetchSnapshot
      .mockResolvedValueOnce(lobbySnapshot())
      .mockResolvedValueOnce(lobbySnapshot())
      .mockResolvedValueOnce(hintSubmittingSnapshot());

    render(<App />);

    await screen.findByText("みんながそろうのを待っています");
    const socket = await waitForSocket();

    socket.open();
    await waitFor(() => expect(apiMocks.fetchSnapshot).toHaveBeenCalledTimes(2));

    socket.message(JSON.stringify({
      type: "room.snapshot.updated",
      roomId: "ABCD12",
      reason: "game.started",
      occurredAt: "2026-05-17T00:00:00.000Z"
    }));

    await waitFor(() => expect(apiMocks.fetchSnapshot).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("お題: パンケーキ")).toBeInTheDocument();
  });

  it("別roomIdのroom.snapshot.updatedは無視する", async () => {
    apiMocks.fetchSnapshot
      .mockResolvedValueOnce(lobbySnapshot())
      .mockResolvedValueOnce(lobbySnapshot());

    render(<App />);

    await screen.findByText("みんながそろうのを待っています");
    const socket = await waitForSocket();

    socket.open();
    await waitFor(() => expect(apiMocks.fetchSnapshot).toHaveBeenCalledTimes(2));

    socket.message(JSON.stringify({
      type: "room.snapshot.updated",
      roomId: "OTHER1",
      reason: "game.started",
      occurredAt: "2026-05-17T00:00:00.000Z"
    }));

    expect(apiMocks.fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.getByText("みんながそろうのを待っています")).toBeInTheDocument();
  });

  it("非ホストもgame.started通知後にLobbyからHintScreenへ遷移する", async () => {
    apiMocks.fetchSnapshot
      .mockResolvedValueOnce(lobbySnapshot())
      .mockResolvedValueOnce(lobbySnapshot())
      .mockResolvedValueOnce(hintSubmittingSnapshot());

    render(<App />);

    expect(await screen.findByRole("button", { name: "ゲーム開始" })).toBeDisabled();
    const socket = await waitForSocket();

    socket.open();
    await waitFor(() => expect(apiMocks.fetchSnapshot).toHaveBeenCalledTimes(2));

    socket.message(JSON.stringify({
      type: "room.snapshot.updated",
      roomId: "ABCD12",
      reason: "game.started",
      occurredAt: "2026-05-17T00:00:00.000Z"
    }));

    expect(await screen.findByText("お題: パンケーキ")).toBeInTheDocument();
    expect(screen.queryByText("みんながそろうのを待っています")).not.toBeInTheDocument();
  });
});

async function waitForSocket(): Promise<MockWebSocket> {
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
  return MockWebSocket.instances[0]!;
}

function lobbySnapshot(): RoomSnapshot {
  return {
    roomId: "ABCD12",
    status: "LOBBY",
    hostPlayerId: "p1",
    settings: {
      maxPlayers: 6,
      hintSeconds: 30,
      answerSeconds: 15,
      roundMode: "ONE_ANSWERER_PER_PLAYER"
    },
    currentRoundNo: 0,
    players: players(),
    round: null,
    hints: [],
    submittedHintPlayerIds: [],
    viewerPlayerId: "p2",
    viewerRole: "hinter",
    permissions: {
      canStartGame: false,
      canGoNextRound: false,
      canSubmitAnswer: false,
      canSubmitHint: false
    }
  };
}

function hintSubmittingSnapshot(): RoomSnapshot {
  return {
    ...lobbySnapshot(),
    status: "IN_GAME",
    currentRoundNo: 1,
    round: {
      roundNo: 1,
      status: "HINT_SUBMITTING",
      answererPlayerId: "p1",
      topicId: "food_pancake_001",
      topicDisplay: "パンケーキ",
      deadlineAt: "2026-05-17T00:00:30.000Z",
      revealedHintCount: 0,
      winningHintPlayerId: null,
      result: null
    },
    viewerRole: "hinter",
    permissions: {
      canStartGame: false,
      canGoNextRound: false,
      canSubmitAnswer: false,
      canSubmitHint: true
    }
  };
}

function players(): RoomSnapshot["players"] {
  return [
    player("p1", "ホスト", true, "2026-05-17T00:00:00.000Z"),
    player("p2", "ゲスト1", false, "2026-05-17T00:00:01.000Z"),
    player("p3", "ゲスト2", false, "2026-05-17T00:00:02.000Z")
  ];
}

function player(playerId: string, nickname: string, isHost: boolean, joinedAt: string): RoomSnapshot["players"][number] {
  return {
    playerId,
    nickname,
    avatarId: "rabbit",
    score: 0,
    correctCount: 0,
    assistCount: 0,
    isHost,
    joinedAt,
    lastSeenAt: joinedAt
  };
}
