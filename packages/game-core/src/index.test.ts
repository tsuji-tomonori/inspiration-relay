import { describe, expect, it } from "vitest";
import { isCorrectAnswer, normalizeAnswer, scorePlayers, sortHintsForReveal, validateHint } from "./index";
import type { Hint, Player, Topic } from "@hirameki-relay/shared";

const topic: Topic = {
  id: "food_pancake_001",
  category: "food",
  display: "パンケーキ",
  answerKana: "ぱんけーき",
  aliases: ["ほっとけーき"],
  difficulty: 1,
  enabled: true
};

describe("game-core", () => {
  it("normalizes katakana answers to hiragana", () => {
    expect(normalizeAnswer(" パンケーキ ")).toBe("ぱんけーき");
    expect(isCorrectAnswer("ホットケーキ", topic)).toBe(true);
  });

  it("accepts only short hiragana hints and rejects answer words", () => {
    expect(validateHint("あまい", topic, [])).toEqual({ ok: true });
    expect(validateHint("甘い", topic, []).code).toBe("INVALID_HINT");
    expect(validateHint("ぱんけーき", topic, []).code).toBe("INVALID_HINT");
    expect(validateHint("あまい", topic, [{ hint: "あまい" } as Hint]).code).toBe("DUPLICATE_HINT");
  });

  it("sorts hints by length, submitted time, and server sequence", () => {
    const hints = [
      { hintId: "a", roundNo: 1, playerId: "p1", hint: "あさごはん", length: 5, submittedAt: "2026-05-16T00:00:03.000Z", sequence: 3 },
      { hintId: "b", roundNo: 1, playerId: "p2", hint: "やく", length: 2, submittedAt: "2026-05-16T00:00:02.000Z", sequence: 2 },
      { hintId: "c", roundNo: 1, playerId: "p3", hint: "まるい", length: 3, submittedAt: "2026-05-16T00:00:01.000Z", sequence: 1 }
    ];

    expect(sortHintsForReveal(hints).map((hint) => hint.hint)).toEqual(["やく", "まるい", "あさごはん"]);
  });

  it("scores the answerer and the winning hint contributor", () => {
    const players: Player[] = [
      { playerId: "p1", nickname: "さくら", avatarId: "rabbit", score: 0, correctCount: 0, assistCount: 0, isHost: true, joinedAt: "a", lastSeenAt: "a" },
      { playerId: "p2", nickname: "ぺんたろう", avatarId: "penguin", score: 0, correctCount: 0, assistCount: 0, isHost: false, joinedAt: "b", lastSeenAt: "b" }
    ];

    expect(scorePlayers(players, "p1", "p2").map((player) => player.score)).toEqual([1, 1]);
  });
});
