import type { Hint, Player, Topic } from "@hirameki-relay/shared";

const hiraganaHintPattern = /^[ぁ-ゖー]{2,10}$/;

export interface ValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export function validateNickname(nickname: string): ValidationResult {
  const trimmed = nickname.trim();
  if (trimmed.length < 1 || trimmed.length > 10) {
    return { ok: false, code: "INVALID_NICKNAME", message: "ニックネームは1〜10文字で入力してください" };
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, code: "INVALID_NICKNAME", message: "ニックネームに使用できない文字が含まれています" };
  }
  return { ok: true };
}

export function validateHint(hint: string, topic: Pick<Topic, "answerKana" | "aliases">, existingHints: Pick<Hint, "hint">[]): ValidationResult {
  const normalizedHint = normalizeAnswer(hint);
  if (!hiraganaHintPattern.test(normalizedHint)) {
    return { ok: false, code: "INVALID_HINT", message: "ヒントはひらがなと長音だけで2〜10文字にしてください" };
  }
  const forbidden = [topic.answerKana, ...topic.aliases.map(normalizeAnswer)];
  if (forbidden.includes(normalizedHint)) {
    return { ok: false, code: "INVALID_HINT", message: "お題そのものと同じヒントは使えません" };
  }
  if (existingHints.some((existing) => normalizeAnswer(existing.hint) === normalizedHint)) {
    return { ok: false, code: "DUPLICATE_HINT", message: "同じヒントがすでに投稿されています" };
  }
  return { ok: true };
}

export function normalizeAnswer(input: string): string {
  return input
    .trim()
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .toLowerCase();
}

export function isCorrectAnswer(input: string, topic: Pick<Topic, "answerKana" | "aliases">): boolean {
  const normalized = normalizeAnswer(input);
  return [topic.answerKana, ...topic.aliases.map(normalizeAnswer)].includes(normalized);
}

export function sortHintsForReveal(hints: Hint[]): Hint[] {
  return [...hints].sort((a, b) => {
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    const submittedDiff = a.submittedAt.localeCompare(b.submittedAt);
    if (submittedDiff !== 0) {
      return submittedDiff;
    }
    return a.sequence - b.sequence;
  });
}

export function nextAnswerer(players: Player[], currentRoundNo: number): Player | null {
  if (players.length === 0) {
    return null;
  }
  const sortedPlayers = [...players].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  return sortedPlayers[(currentRoundNo - 1) % sortedPlayers.length] ?? null;
}

export function scorePlayers(players: Player[], answererPlayerId: string, winningHintPlayerId: string | null): Player[] {
  return players.map((player) => {
    if (player.playerId === answererPlayerId) {
      return {
        ...player,
        score: player.score + 1,
        correctCount: player.correctCount + 1
      };
    }
    if (winningHintPlayerId && player.playerId === winningHintPlayerId) {
      return {
        ...player,
        score: player.score + 1,
        assistCount: player.assistCount + 1
      };
    }
    return player;
  });
}

export function displayPoints(score: number): number {
  return score * 100;
}
