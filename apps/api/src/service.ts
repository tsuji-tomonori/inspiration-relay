import { isCorrectAnswer, nextAnswerer, scorePlayers, sortHintsForReveal, validateHint, validateNickname } from "@hirameki-relay/game-core";
import { avatarIds, type AvatarId, type Hint, type PublicHint, type RoomSnapshot, type SessionResponse, type Topic } from "@hirameki-relay/shared";
import { MemoryRealtimeRepository, NoopRoomEventBroadcaster, ttlFromNow, type RealtimeRepository, type RoomEventBroadcaster, type RoomUpdateReason } from "./realtime";
import { hashToken, makeInitialRoom, makePlayer, randomToken, type RoomRepository, type RoomState, type StoredPlayer } from "./store";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export class GameService {
  constructor(
    private readonly repository: RoomRepository,
    private readonly realtimeRepository: RealtimeRepository = new MemoryRealtimeRepository(),
    private readonly roomEventBroadcaster: RoomEventBroadcaster = new NoopRoomEventBroadcaster()
  ) {}

  async createRoom(input: { nickname: string; avatarId: string }): Promise<SessionResponse> {
    const nickname = normalizeNickname(input.nickname);
    const avatarId = parseAvatarId(input.avatarId);
    const validation = validateNickname(nickname);
    if (!validation.ok) {
      throw new ApiError(validation.code ?? "INVALID_NICKNAME", validation.message ?? "ニックネームが不正です", 400);
    }

    const { state, playerToken, hostToken } = makeInitialRoom(nickname, avatarId);
    await this.repository.saveRoomState(state);

    return {
      roomId: state.room.roomId,
      playerId: state.room.hostPlayerId,
      playerToken,
      hostToken,
      snapshot: buildSnapshot(state, state.room.hostPlayerId)
    };
  }

  async joinRoom(roomId: string, input: { nickname: string; avatarId: string }): Promise<SessionResponse> {
    const state = await this.load(roomId);
    if (state.room.status !== "LOBBY") {
      throw new ApiError("INVALID_ROOM_STATUS", "参加待ち以外のルームには参加できません", 409);
    }
    if (state.players.length >= state.room.settings.maxPlayers) {
      throw new ApiError("ROOM_FULL", "ルームが満室です", 409);
    }

    const nickname = normalizeNickname(input.nickname);
    const validation = validateNickname(nickname);
    if (!validation.ok) {
      throw new ApiError(validation.code ?? "INVALID_NICKNAME", validation.message ?? "ニックネームが不正です", 400);
    }

    const { player, playerToken } = makePlayer(nickname, parseAvatarId(input.avatarId));
    state.players.push(player);
    touch(state);
    await this.repository.saveRoomState(state);
    await this.notifyRoomUpdated(state.room.roomId, "player.joined");

    return {
      roomId: state.room.roomId,
      playerId: player.playerId,
      playerToken,
      snapshot: buildSnapshot(state, player.playerId)
    };
  }

  async snapshot(roomId: string, playerToken?: string): Promise<RoomSnapshot> {
    const state = await this.load(roomId);
    const player = playerToken ? requirePlayer(state, playerToken) : null;
    return buildSnapshot(state, player?.playerId);
  }

  async wsTicket(roomId: string, playerToken: string): Promise<{ ticket: string; expiresIn: number; wsUrl: string }> {
    const player = await this.authorizePlayer(roomId, playerToken);
    const ticket = randomToken();
    const expiresIn = 60;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    await this.realtimeRepository.saveTicket({
      ticketHash: hashToken(ticket),
      roomId: roomId.toUpperCase(),
      playerId: player.playerId,
      expiresAt,
      ttl: ttlFromNow(expiresIn)
    });
    return {
      ticket,
      expiresIn,
      wsUrl: buildWsUrl(ticket)
    };
  }

  async startGame(roomId: string, hostToken: string): Promise<RoomSnapshot> {
    const state = await this.load(roomId);
    requireHost(state, hostToken);
    if (state.players.length < 3) {
      throw new ApiError("INVALID_ROOM_STATUS", "3人以上で開始できます", 409);
    }
    if (state.room.status !== "LOBBY") {
      throw new ApiError("INVALID_ROOM_STATUS", "このルームは開始できません", 409);
    }

    startRound(state);
    touch(state);
    await this.repository.saveRoomState(state);
    await this.notifyRoomUpdated(state.room.roomId, "game.started");
    return buildSnapshot(state, state.room.hostPlayerId);
  }

  async submitHint(roomId: string, roundNo: number, playerToken: string, hintInput: string): Promise<RoomSnapshot> {
    const state = await this.load(roomId);
    const player = requirePlayer(state, playerToken);
    const round = requireRound(state, roundNo, "HINT_SUBMITTING");
    if (player.playerId === round.answererPlayerId) {
      throw new ApiError("ANSWERER_CANNOT_HINT", "回答者はヒントを投稿できません", 403);
    }
    if (state.hints.some((hint) => hint.roundNo === roundNo && hint.playerId === player.playerId)) {
      throw new ApiError("ALREADY_SUBMITTED", "すでにヒントを投稿済みです", 409);
    }

    const topic = currentTopic(round);
    const existingHints = state.hints.filter((hint) => hint.roundNo === roundNo);
    const validation = validateHint(hintInput, topic, existingHints);
    if (!validation.ok) {
      throw new ApiError(validation.code ?? "INVALID_HINT", validation.message ?? "ヒントが不正です", 400);
    }

    const hint = hintInput.trim().normalize("NFKC");
    state.hints.push({
      hintId: `${roundNo}-${player.playerId}`,
      roundNo,
      playerId: player.playerId,
      hint,
      length: [...hint].length,
      submittedAt: new Date().toISOString(),
      sequence: state.hints.length + 1
    });

    const expectedHints = state.players.length - 1;
    if (state.hints.filter((item) => item.roundNo === roundNo).length >= expectedHints) {
      round.status = "ANSWERING";
      round.revealedHintCount = Math.min(1, expectedHints);
      round.deadlineAt = futureIso(state.room.settings.answerSeconds);
    }
    const reason: RoomUpdateReason = round.status === "ANSWERING" ? "answering.started" : "hint.submitted";
    touch(state);
    await this.repository.saveRoomState(state);
    await this.notifyRoomUpdated(state.room.roomId, reason);
    return buildSnapshot(state, player.playerId);
  }

  async submitAnswer(roomId: string, roundNo: number, playerToken: string, answer: string): Promise<RoomSnapshot> {
    const state = await this.load(roomId);
    const player = requirePlayer(state, playerToken);
    const round = requireRound(state, roundNo, "ANSWERING");
    if (player.playerId !== round.answererPlayerId) {
      throw new ApiError("NOT_ANSWERER", "回答者だけが回答できます", 403);
    }

    const sortedHints = sortHintsForReveal(state.hints.filter((hint) => hint.roundNo === roundNo));
    let reason: RoomUpdateReason;
    if (isCorrectAnswer(answer, currentTopic(round))) {
      const winningHint = sortedHints[Math.max(0, round.revealedHintCount - 1)] ?? null;
      round.status = "ROUND_RESULT";
      round.result = "CORRECT";
      round.winningHintPlayerId = winningHint?.playerId ?? null;
      state.players = scorePlayers(state.players, player.playerId, round.winningHintPlayerId).map((scored) => {
        const original = state.players.find((candidate) => candidate.playerId === scored.playerId);
        return { ...original, ...scored } as StoredPlayer;
      });
      reason = "round.result";
    } else if (round.revealedHintCount < sortedHints.length) {
      round.revealedHintCount += 1;
      round.deadlineAt = futureIso(state.room.settings.answerSeconds);
      reason = "hint.revealed";
    } else {
      round.status = "ROUND_RESULT";
      round.result = "INCORRECT";
      reason = "round.result";
    }

    touch(state);
    await this.repository.saveRoomState(state);
    await this.notifyRoomUpdated(state.room.roomId, reason);
    return buildSnapshot(state, player.playerId);
  }

  async skipAnswer(roomId: string, roundNo: number, playerToken: string): Promise<RoomSnapshot> {
    const state = await this.load(roomId);
    const player = requirePlayer(state, playerToken);
    const round = requireRound(state, roundNo, "ANSWERING");
    if (player.playerId !== round.answererPlayerId) {
      throw new ApiError("NOT_ANSWERER", "回答者だけがスキップできます", 403);
    }

    const sortedHints = sortHintsForReveal(state.hints.filter((hint) => hint.roundNo === roundNo));
    const reason: RoomUpdateReason = round.revealedHintCount < sortedHints.length ? "hint.revealed" : "round.result";
    if (round.revealedHintCount < sortedHints.length) {
      round.revealedHintCount += 1;
      round.deadlineAt = futureIso(state.room.settings.answerSeconds);
    } else {
      round.status = "ROUND_RESULT";
      round.result = "INCORRECT";
    }

    touch(state);
    await this.repository.saveRoomState(state);
    await this.notifyRoomUpdated(state.room.roomId, reason);
    return buildSnapshot(state, player.playerId);
  }

  async nextRound(roomId: string, hostToken: string): Promise<RoomSnapshot> {
    const state = await this.load(roomId);
    requireHost(state, hostToken);
    if (!state.round || state.round.status !== "ROUND_RESULT") {
      throw new ApiError("INVALID_ROOM_STATUS", "ラウンド結果表示中だけ次へ進めます", 409);
    }
    if (state.room.currentRoundNo >= state.players.length) {
      state.room.status = "GAME_RESULT";
      touch(state);
      await this.repository.saveRoomState(state);
      await this.notifyRoomUpdated(state.room.roomId, "game.result");
      return buildSnapshot(state, state.room.hostPlayerId);
    }

    startRound(state);
    touch(state);
    await this.repository.saveRoomState(state);
    await this.notifyRoomUpdated(state.room.roomId, "round.started");
    return buildSnapshot(state, state.room.hostPlayerId);
  }

  private async authorizePlayer(roomId: string, playerToken: string): Promise<StoredPlayer> {
    const state = await this.load(roomId);
    return requirePlayer(state, playerToken);
  }

  private async load(roomId: string): Promise<RoomState> {
    const state = await this.repository.getRoomState(roomId);
    if (!state) {
      throw new ApiError("ROOM_NOT_FOUND", "ルームが見つかりません", 404);
    }
    return state;
  }

  private async notifyRoomUpdated(roomId: string, reason: RoomUpdateReason): Promise<void> {
    try {
      await this.roomEventBroadcaster.broadcastRoomUpdate(roomId, reason);
    } catch (error) {
      console.error("room update notification failed", { roomId, reason, error });
    }
  }
}

export function buildSnapshot(state: RoomState, viewerPlayerId?: string): RoomSnapshot {
  const viewer = viewerPlayerId ? state.players.find((player) => player.playerId === viewerPlayerId) : null;
  const round = state.round;
  const isHost = viewer?.isHost === true;
  const isAnswerer = Boolean(viewer && round?.answererPlayerId === viewer.playerId);
  const hasSubmittedHint = Boolean(viewer && round && state.hints.some((hint) => hint.roundNo === round.roundNo && hint.playerId === viewer.playerId));
  const viewerRole = !viewer ? "unknown" : isAnswerer ? "answerer" : round ? "hinter" : "spectator";
  const sortedHints = round ? sortHintsForReveal(state.hints.filter((hint) => hint.roundNo === round.roundNo)) : [];
  const publicHints: PublicHint[] = sortedHints.map((hint, index) => ({
    playerId: hint.playerId,
    hint: index < (round?.revealedHintCount ?? 0) || round?.status === "ROUND_RESULT" ? hint.hint : "",
    length: hint.length,
    revealed: index < (round?.revealedHintCount ?? 0) || round?.status === "ROUND_RESULT"
  }));

  return {
    roomId: state.room.roomId,
    status: state.room.status,
    hostPlayerId: state.room.hostPlayerId,
    settings: state.room.settings,
    currentRoundNo: state.room.currentRoundNo,
    players: state.players.map(({ tokenHash: _tokenHash, ...player }) => player),
    round: round
      ? {
          ...round,
          topicDisplay: viewerRole === "answerer" && round.status !== "ROUND_RESULT" ? undefined : round.topicDisplay,
          answerKana: undefined,
          aliases: undefined
        }
      : null,
    hints: publicHints,
    submittedHintPlayerIds: sortedHints.map((hint) => hint.playerId),
    viewerPlayerId,
    viewerRole,
    permissions: {
      canStartGame: isHost && state.room.status === "LOBBY" && state.players.length >= 3,
      canGoNextRound: isHost && round?.status === "ROUND_RESULT",
      canSubmitAnswer: isAnswerer && round?.status === "ANSWERING",
      canSubmitHint: Boolean(viewer && round?.status === "HINT_SUBMITTING" && !isAnswerer && !hasSubmittedHint)
    }
  };
}

function requirePlayer(state: RoomState, playerToken: string): StoredPlayer {
  const tokenHash = hashToken(playerToken);
  const player = state.players.find((candidate) => candidate.tokenHash === tokenHash);
  if (!player) {
    throw new ApiError("INVALID_TOKEN", "プレイヤートークンが不正です", 401);
  }
  return player;
}

function requireHost(state: RoomState, hostToken: string): void {
  if (state.room.hostTokenHash !== hashToken(hostToken)) {
    throw new ApiError("HOST_ONLY", "ホストのみ操作できます", 403);
  }
}

function requireRound(state: RoomState, roundNo: number, status: string) {
  if (!state.round || state.round.roundNo !== roundNo) {
    throw new ApiError("INVALID_ROOM_STATUS", "対象ラウンドが見つかりません", 409);
  }
  if (state.round.status !== status) {
    throw new ApiError("INVALID_ROOM_STATUS", "現在の状態では操作できません", 409);
  }
  return state.round;
}

function startRound(state: RoomState): void {
  const roundNo = state.room.currentRoundNo + 1;
  const answerer = nextAnswerer(state.players, roundNo);
  const topic = pickTopic(state.topics, state.room.usedTopicIds);
  if (!answerer || !topic) {
    throw new ApiError("INVALID_ROOM_STATUS", "次のラウンドを開始できません", 409);
  }

  state.room.status = "IN_GAME";
  state.room.currentRoundNo = roundNo;
  state.room.usedTopicIds.push(topic.id);
  state.round = {
    roundNo,
    status: "HINT_SUBMITTING",
    answererPlayerId: answerer.playerId,
    topicId: topic.id,
    topicDisplay: topic.display,
    answerKana: topic.answerKana,
    aliases: topic.aliases,
    deadlineAt: futureIso(state.room.settings.hintSeconds),
    revealedHintCount: 0,
    winningHintPlayerId: null,
    result: null
  };
}

function pickTopic(topics: Topic[], usedTopicIds: string[]): Topic | null {
  return topics.find((topic) => topic.enabled && !usedTopicIds.includes(topic.id)) ?? topics.find((topic) => topic.enabled) ?? null;
}

function currentTopic(round: { answerKana: string; aliases: string[] }): Pick<Topic, "answerKana" | "aliases"> {
  return {
    answerKana: round.answerKana,
    aliases: round.aliases
  };
}

function touch(state: RoomState): void {
  state.room.updatedAt = new Date().toISOString();
}

function futureIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function normalizeNickname(nickname: string): string {
  return nickname.trim().normalize("NFKC");
}

function parseAvatarId(value: string): AvatarId {
  return avatarIds.includes(value as AvatarId) ? (value as AvatarId) : "ghost";
}

function buildWsUrl(ticket: string): string {
  const baseUrl = process.env.WEBSOCKET_URL ?? "/ws/v1";
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}ticket=${encodeURIComponent(ticket)}`;
}
