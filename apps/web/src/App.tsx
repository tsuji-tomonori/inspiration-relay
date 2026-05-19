import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { displayPoints } from "@hirameki-relay/game-core";
import { avatarIds, type AvatarId, type Player, type RoomSnapshot } from "@hirameki-relay/shared";
import { createRoom, fetchSnapshot, fetchWebSocketTicket, joinRoom, nextRound, skipAnswer, startGame, submitAnswer, submitHint, type SessionTokens } from "./api";
import { assets } from "./assets";
import { parseRoomSnapshotUpdatedMessage, resolveWebSocketUrl } from "./websocket";

type ModalMode = "create" | "join" | null;

const storageKey = "hirameki-relay-session";

interface StoredSession {
  roomId: string;
  playerId: string;
  playerToken: string;
  hostToken?: string;
}

export function App() {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [session, setSession] = useState<StoredSession | null>(() => readSession());
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshSnapshot = useCallback(async (activeSession: StoredSession) => {
    const nextSnapshot = await fetchSnapshot(activeSession.roomId, activeSession);
    setSnapshot(nextSnapshot);
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    refreshSnapshot(session).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "ルームの復帰に失敗しました");
      clearSession();
      setSession(null);
    });
  }, [refreshSnapshot, session?.roomId, session?.playerToken]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let retryCount = 0;
    let reconnectTimer: number | undefined;

    const scheduleReconnect = () => {
      if (cancelled) {
        return;
      }
      const delay = Math.min(1000 * 2 ** retryCount, 10000);
      retryCount += 1;
      reconnectTimer = window.setTimeout(() => {
        void connect();
      }, delay);
    };

    const connect = async () => {
      try {
        const ticket = await fetchWebSocketTicket(session.roomId, session.playerToken);
        if (cancelled) {
          return;
        }
        socket = new WebSocket(resolveWebSocketUrl(ticket.wsUrl));
        socket.addEventListener("open", () => {
          retryCount = 0;
          refreshSnapshot(session).catch((caught: unknown) => {
            setError(caught instanceof Error ? caught.message : "ルーム状態の更新に失敗しました");
          });
        });
        socket.addEventListener("message", (event) => {
          const message = parseRoomSnapshotUpdatedMessage(event.data);
          if (!message || message.roomId !== session.roomId) {
            return;
          }
          refreshSnapshot(session).catch((caught: unknown) => {
            setError(caught instanceof Error ? caught.message : "ルーム状態の更新に失敗しました");
          });
        });
        socket.addEventListener("close", () => {
          scheduleReconnect();
        });
        socket.addEventListener("error", () => {
          socket?.close();
        });
      } catch {
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [refreshSnapshot, session?.roomId, session?.playerToken]);

  const sortedPlayers = useMemo(() => [...(snapshot?.players ?? [])].sort((a, b) => b.score - a.score), [snapshot?.players]);

  async function run(action: () => Promise<RoomSnapshot | StoredSession | void>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result && "players" in result) {
        setSnapshot(result);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  function leaveLocalRoom() {
    clearSession();
    setSession(null);
    setSnapshot(null);
    setError(null);
  }

  return (
    <main className="app">
      <div className="sparkle-layer" aria-hidden="true" />
      <header className="topbar">
        <img src={assets.logo} alt="ひらめきリレー" className="topbar-logo" />
        <div className="topbar-actions">
          {snapshot ? <RoomBadge roomId={snapshot.roomId} /> : null}
          {snapshot ? <button className="small-button" onClick={leaveLocalRoom}>トップへ</button> : null}
        </div>
      </header>

      {error ? <p className="error-banner" role="alert">{error}</p> : null}

      {!snapshot ? (
        <HomeScreen onCreate={() => setModalMode("create")} onJoin={() => setModalMode("join")} />
      ) : (
        <RoomScreen
          snapshot={snapshot}
          session={session}
          sortedPlayers={sortedPlayers}
          busy={busy}
          onStart={() => session?.hostToken ? run(() => startGame(snapshot.roomId, session.hostToken!)) : setError("ホスト権限がありません")}
          onSubmitHint={(hint) => session ? run(() => submitHint(snapshot.roomId, snapshot.round!.roundNo, session.playerToken, hint)) : undefined}
          onSubmitAnswer={(answer) => session ? run(() => submitAnswer(snapshot.roomId, snapshot.round!.roundNo, session.playerToken, answer)) : undefined}
          onSkip={() => session ? run(() => skipAnswer(snapshot.roomId, snapshot.round!.roundNo, session.playerToken)) : undefined}
          onNext={() => session?.hostToken ? run(() => nextRound(snapshot.roomId, session.hostToken!)) : setError("ホスト権限がありません")}
        />
      )}

      {modalMode ? (
        <EntryModal
          mode={modalMode}
          busy={busy}
          onClose={() => setModalMode(null)}
          onSubmit={(input) => run(async () => {
            const response = modalMode === "create"
              ? await createRoom({ nickname: input.nickname, avatarId: input.avatarId })
              : await joinRoom(input.roomId, { nickname: input.nickname, avatarId: input.avatarId });
            const nextSession: StoredSession = {
              roomId: response.roomId,
              playerId: response.playerId,
              playerToken: response.playerToken,
              hostToken: response.hostToken
            };
            saveSession(nextSession);
            setSession(nextSession);
            setSnapshot(response.snapshot);
            setModalMode(null);
            return nextSession;
          })}
        />
      ) : null}
    </main>
  );
}

function HomeScreen({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <section className="home">
      <div className="home-card">
        <img src={assets.bunting} alt="" className="bunting" aria-hidden="true" />
        <img src={assets.logo} alt="" className="hero-logo" aria-hidden="true" />
        <p className="tagline">みんなでつなぐ、ひらめきと言葉のバトン</p>
        <img src={assets.characters} alt="ゲームに登場するキャラクター" className="character-strip" />
        <div className="primary-actions" aria-label="ルーム操作">
          <button className="image-action create" onClick={onCreate}>
            <img src={assets.createButton} alt="" aria-hidden="true" />
            <span>ルームを作る</span>
          </button>
          <button className="image-action join" onClick={onJoin}>
            <img src={assets.joinButton} alt="" aria-hidden="true" />
            <span>参加する</span>
          </button>
        </div>
        <div className="info-tabs" aria-label="補助情報">
          <button type="button">あそびかた</button>
          <button type="button">設定</button>
        </div>
      </div>
    </section>
  );
}

function EntryModal({ mode, busy, onClose, onSubmit }: {
  mode: "create" | "join";
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { roomId: string; nickname: string; avatarId: AvatarId }) => void;
}) {
  const [roomId, setRoomId] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatarId, setAvatarId] = useState<AvatarId>("rabbit");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ roomId: roomId.trim().toUpperCase(), nickname, avatarId });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="entry-modal" onSubmit={handleSubmit} aria-label={mode === "create" ? "ルームを作る" : "ルームに参加する"}>
        <button className="close-button" type="button" onClick={onClose} aria-label="閉じる">x</button>
        <h1>{mode === "create" ? "ルームを作る" : "参加する"}</h1>
        {mode === "join" ? (
          <label>
            ルームID
            <input value={roomId} onChange={(event) => setRoomId(event.target.value)} maxLength={6} required />
          </label>
        ) : null}
        <label>
          ニックネーム
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={10} required />
        </label>
        <fieldset>
          <legend>キャラクター</legend>
          <div className="avatar-picker">
            {avatarIds.map((id) => (
              <label key={id} className={avatarId === id ? "selected" : ""}>
                <input type="radio" name="avatar" value={id} checked={avatarId === id} onChange={() => setAvatarId(id)} />
                <img src={assets.avatars[id]} alt={avatarLabel(id)} />
              </label>
            ))}
          </div>
        </fieldset>
        <button className="submit-button" disabled={busy}>{busy ? "通信中..." : "決定"}</button>
      </form>
    </div>
  );
}

function RoomScreen({ snapshot, session, sortedPlayers, busy, onStart, onSubmitHint, onSubmitAnswer, onSkip, onNext }: {
  snapshot: RoomSnapshot;
  session: StoredSession | null;
  sortedPlayers: Player[];
  busy: boolean;
  onStart: () => void;
  onSubmitHint: (hint: string) => void;
  onSubmitAnswer: (answer: string) => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  return (
    <section className="room-layout">
      <aside className="players-panel panel">
        <div className="section-title">
          <span>プレイヤー</span>
          <strong>{snapshot.players.length} / {snapshot.settings.maxPlayers}</strong>
        </div>
        <ul className="player-list">
          {snapshot.players.map((player, index) => (
            <li key={player.playerId}>
              <span className="number">{index + 1}</span>
              <img src={assets.avatars[player.avatarId]} alt="" aria-hidden="true" />
              <span>{player.nickname}</span>
              {player.isHost ? <b>ホスト</b> : null}
            </li>
          ))}
        </ul>
      </aside>

      <section className="main-panel panel">
        {snapshot.status === "LOBBY" ? (
          <Lobby snapshot={snapshot} busy={busy} onStart={onStart} />
        ) : snapshot.status === "GAME_RESULT" ? (
          <GameResult players={sortedPlayers} />
        ) : snapshot.round?.status === "HINT_SUBMITTING" ? (
          <HintScreen snapshot={snapshot} busy={busy} onSubmitHint={onSubmitHint} />
        ) : snapshot.round?.status === "ANSWERING" ? (
          <AnswerScreen snapshot={snapshot} busy={busy} onSubmitAnswer={onSubmitAnswer} onSkip={onSkip} />
        ) : snapshot.round?.status === "ROUND_RESULT" ? (
          <RoundResult snapshot={snapshot} players={sortedPlayers} busy={busy} onNext={onNext} />
        ) : (
          <p className="empty-state">状態を読み込み中です。</p>
        )}
      </section>

      <aside className="ranking-panel panel">
        <div className="section-title">
          <span>ランキング</span>
        </div>
        <ol className="ranking-list">
          {sortedPlayers.map((player, index) => (
            <li key={player.playerId}>
              {index < 3 ? <img src={assets.medals[(index + 1) as 1 | 2 | 3]} alt={`${index + 1}位`} /> : <span className="plain-rank">{index + 1}</span>}
              <span>{player.nickname}</span>
              <strong>{displayPoints(player.score)} pt</strong>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}

function Lobby({ snapshot, busy, onStart }: { snapshot: RoomSnapshot; busy: boolean; onStart: () => void }) {
  return (
    <div className="lobby">
      <RoomBadge roomId={snapshot.roomId} />
      <img src={assets.pancakes} alt="お題カードの例" className="topic-art" />
      <h1>みんながそろうのを待っています</h1>
      <p>3人以上になったらホストが開始できます。</p>
      <button className="image-action start" disabled={!snapshot.permissions.canStartGame || busy} onClick={onStart}>
        <img src={assets.startButton} alt="" aria-hidden="true" />
        <span>ゲーム開始</span>
      </button>
    </div>
  );
}

function HintScreen({ snapshot, busy, onSubmitHint }: { snapshot: RoomSnapshot; busy: boolean; onSubmitHint: (hint: string) => void }) {
  const [hint, setHint] = useState("");
  const isAnswerer = snapshot.viewerRole === "answerer";

  if (!snapshot.permissions.canSubmitHint) {
    return (
      <div className="waiting-screen">
        <img src={assets.chickFlag} alt="" aria-hidden="true" />
        <h1>{isAnswerer ? "みんながヒントを考えています" : "ほかの人のヒントを待っています"}</h1>
        <p>提出済み {snapshot.submittedHintPlayerIds.length} / {Math.max(0, snapshot.players.length - 1)}</p>
      </div>
    );
  }

  return (
    <form className="hint-screen" onSubmit={(event) => {
      event.preventDefault();
      onSubmitHint(hint);
    }}>
      <p className="round-label">ラウンド {snapshot.currentRoundNo}</p>
      <h1>お題: {snapshot.round?.topicDisplay ?? "未設定"}</h1>
      <label>
        ひらがなヒント
        <input value={hint} onChange={(event) => setHint(event.target.value)} placeholder="あまい" maxLength={10} required />
      </label>
      <p className="hint-rule">{[...hint].length} / 10 文字。ひらがなと長音だけ使えます。</p>
      <button className="submit-button" disabled={busy}>ヒントを送る</button>
    </form>
  );
}

function AnswerScreen({ snapshot, busy, onSubmitAnswer, onSkip }: {
  snapshot: RoomSnapshot;
  busy: boolean;
  onSubmitAnswer: (answer: string) => void;
  onSkip: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const canSubmitAnswer = snapshot.permissions.canSubmitAnswer;

  return (
    <form className="answer-screen" onSubmit={(event) => {
      event.preventDefault();
      onSubmitAnswer(answer);
    }}>
      <h1>{canSubmitAnswer ? "こたえよう" : "回答を待っています"}</h1>
      <HintRail hints={snapshot.hints} />
      {canSubmitAnswer ? (
        <div className="answer-controls">
          <label>
            こたえ
            <input value={answer} onChange={(event) => setAnswer(event.target.value)} required />
          </label>
          <button className="submit-button" disabled={busy}>回答する</button>
          <button className="small-button" type="button" disabled={busy} onClick={onSkip}>わからない</button>
        </div>
      ) : null}
    </form>
  );
}

function RoundResult({ snapshot, players, busy, onNext }: {
  snapshot: RoomSnapshot;
  players: Player[];
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <div className="result-screen">
      <h1>{snapshot.round?.result === "CORRECT" ? "せいかい!" : "ざんねん!"}</h1>
      <p className="answer-word">こたえ: {snapshot.round?.topicDisplay}</p>
      <HintRail hints={snapshot.hints} />
      <RankingPreview players={players} />
      <button className="image-action next" disabled={!snapshot.permissions.canGoNextRound || busy} onClick={onNext}>
        <img src={assets.nextButton} alt="" aria-hidden="true" />
        <span>つぎのラウンドへ</span>
      </button>
    </div>
  );
}

function GameResult({ players }: { players: Player[] }) {
  return (
    <div className="result-screen final">
      <h1>ゲームセット!</h1>
      <RankingPreview players={players} />
    </div>
  );
}

function HintRail({ hints }: { hints: RoomSnapshot["hints"] }) {
  return (
    <ol className="hint-rail">
      {hints.length === 0 ? <li className="empty-state">まだ開示されたヒントはありません。</li> : null}
      {hints.map((hint, index) => (
        <li key={`${hint.playerId}-${index}`} className={hint.revealed ? "revealed" : "hidden"}>
          {hint.revealed ? hint.hint : `${hint.length}文字のヒント`}
        </li>
      ))}
    </ol>
  );
}

function RankingPreview({ players }: { players: Player[] }) {
  return (
    <ol className="score-table">
      {players.map((player, index) => (
        <li key={player.playerId}>
          <span>{index + 1}</span>
          <img src={assets.avatars[player.avatarId]} alt="" aria-hidden="true" />
          <strong>{player.nickname}</strong>
          <b>{displayPoints(player.score)} pt</b>
          <small>正解 {player.correctCount}回 / ヒント {player.assistCount}回</small>
        </li>
      ))}
    </ol>
  );
}

function RoomBadge({ roomId }: { roomId: string }) {
  return (
    <div className="room-badge" aria-label={`ルームID ${roomId}`}>
      <span>ルームID</span>
      <strong>{roomId}</strong>
    </div>
  );
}

function avatarLabel(id: AvatarId): string {
  return {
    ghost: "おばけ",
    rabbit: "うさぎ",
    cat: "ねこ",
    penguin: "ペンギン",
    chick: "ひよこ",
    frog: "かえる"
  }[id];
}

function readSession(): StoredSession | null {
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession): void {
  sessionStorage.setItem(storageKey, JSON.stringify(session));
}

function clearSession(): void {
  sessionStorage.removeItem(storageKey);
}
