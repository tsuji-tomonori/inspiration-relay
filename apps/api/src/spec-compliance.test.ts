import { describe, expect, it } from "vitest";
import type { SessionResponse } from "@hirameki-relay/shared";
import { GameService } from "./service";
import { MemoryRoomRepository } from "./store";

const answerByTopicDisplay: Record<string, string> = {
  パンケーキ: "ホットケーキ",
  ラーメン: "ラーメン",
  ペンギン: "ペンギン",
  かえる: "かえる",
  学校: "学校",
  電車: "電車"
};

interface StartedRoom {
  service: GameService;
  host: SessionResponse;
  player2: SessionResponse;
  player3: SessionResponse;
}

describe("spec compliance: game service", () => {
  it("hides the topic from the answerer, shows it to hinters, and reveals hints by length", async () => {
    const { service, host, player2, player3 } = await arrangeStartedRoom();

    const answererSnapshot = await service.snapshot(host.roomId, host.playerToken);
    expect(answererSnapshot.viewerRole).toBe("answerer");
    expect(answererSnapshot.round?.topicDisplay).toBeUndefined();
    expect(answererSnapshot.permissions.canSubmitHint).toBe(false);

    const hinterSnapshot = await service.snapshot(host.roomId, player2.playerToken);
    expect(hinterSnapshot.viewerRole).toBe("hinter");
    expect(hinterSnapshot.round?.topicDisplay).toBe("パンケーキ");
    expect(hinterSnapshot.permissions.canSubmitHint).toBe(true);

    await service.submitHint(host.roomId, 1, player3.playerToken, "ふわふわ");
    const answeringSnapshot = await service.submitHint(host.roomId, 1, player2.playerToken, "あまい");

    expect(answeringSnapshot.round?.status).toBe("ANSWERING");
    expect(answeringSnapshot.hints).toEqual([
      expect.objectContaining({
        playerId: player2.playerId,
        hint: "あまい",
        length: 3,
        revealed: true
      }),
      expect.objectContaining({
        playerId: player3.playerId,
        hint: "",
        length: 4,
        revealed: false
      })
    ]);
  });

  it("rejects invalid, topic-identical, duplicate, and answerer-submitted hints", async () => {
    const { service, host, player2, player3 } = await arrangeStartedRoom();

    await expect(service.submitHint(host.roomId, 1, player2.playerToken, "あ"))
      .rejects.toMatchObject({ code: "INVALID_HINT" });
    await expect(service.submitHint(host.roomId, 1, player2.playerToken, "パンケーキ"))
      .rejects.toMatchObject({ code: "INVALID_HINT" });
    await expect(service.submitHint(host.roomId, 1, host.playerToken, "あまい"))
      .rejects.toMatchObject({ code: "ANSWERER_CANNOT_HINT" });

    await service.submitHint(host.roomId, 1, player2.playerToken, "あまい");
    await expect(service.submitHint(host.roomId, 1, player3.playerToken, "あまい"))
      .rejects.toMatchObject({ code: "DUPLICATE_HINT" });
  });

  it("scores only the answerer and the currently revealed hint provider on a correct answer", async () => {
    const { service, host, player2, player3 } = await arrangeStartedRoom();

    await service.submitHint(host.roomId, 1, player3.playerToken, "ふわふわ");
    await service.submitHint(host.roomId, 1, player2.playerToken, "あまい");
    const result = await service.submitAnswer(host.roomId, 1, host.playerToken, "ホットケーキ");

    expect(result.round?.status).toBe("ROUND_RESULT");
    expect(result.round?.result).toBe("CORRECT");
    expect(result.round?.topicDisplay).toBe("パンケーキ");
    expect(result.round?.winningHintPlayerId).toBe(player2.playerId);
    expect(playerStats(result, host.playerId)).toMatchObject({ score: 1, correctCount: 1, assistCount: 0 });
    expect(playerStats(result, player2.playerId)).toMatchObject({ score: 1, correctCount: 0, assistCount: 1 });
    expect(playerStats(result, player3.playerId)).toMatchObject({ score: 0, correctCount: 0, assistCount: 0 });

    await expect(service.submitAnswer(host.roomId, 1, host.playerToken, "パンケーキ"))
      .rejects.toMatchObject({ code: "INVALID_ROOM_STATUS" });
  });

  it("finishes the game after every player has been the answerer once", async () => {
    const { service, host, player2, player3 } = await arrangeStartedRoom();

    await completeRound(service, host.roomId, 1, host.playerToken, player2.playerToken, [
      { playerToken: player2.playerToken, hint: "あまい" },
      { playerToken: player3.playerToken, hint: "ふわふわ" }
    ]);

    const round2 = await service.nextRound(host.roomId, host.hostToken ?? "");
    expect(round2.round?.roundNo).toBe(2);
    expect(round2.round?.answererPlayerId).toBe(player2.playerId);

    await completeRound(service, host.roomId, 2, player2.playerToken, host.playerToken, [
      { playerToken: host.playerToken, hint: "しょっぱい" },
      { playerToken: player3.playerToken, hint: "あつい" }
    ]);

    const round3 = await service.nextRound(host.roomId, host.hostToken ?? "");
    expect(round3.round?.roundNo).toBe(3);
    expect(round3.round?.answererPlayerId).toBe(player3.playerId);

    await completeRound(service, host.roomId, 3, player3.playerToken, host.playerToken, [
      { playerToken: host.playerToken, hint: "とり" },
      { playerToken: player2.playerToken, hint: "さむい" }
    ]);

    const final = await service.nextRound(host.roomId, host.hostToken ?? "");
    expect(final.status).toBe("GAME_RESULT");
    expect(final.currentRoundNo).toBe(3);
  });
});

async function arrangeStartedRoom(): Promise<StartedRoom> {
  const service = new GameService(new MemoryRoomRepository());
  const host = await service.createRoom({ nickname: "さくら", avatarId: "rabbit" });
  const player2 = await service.joinRoom(host.roomId, { nickname: "ぺんたろう", avatarId: "penguin" });
  const player3 = await service.joinRoom(host.roomId, { nickname: "ひよこ", avatarId: "chick" });

  await service.startGame(host.roomId, host.hostToken ?? "");
  return { service, host, player2, player3 };
}

async function completeRound(
  service: GameService,
  roomId: string,
  roundNo: number,
  answererToken: string,
  topicViewerToken: string,
  hints: Array<{ playerToken: string; hint: string }>
): Promise<void> {
  for (const hint of hints) {
    await service.submitHint(roomId, roundNo, hint.playerToken, hint.hint);
  }

  const topicSnapshot = await service.snapshot(roomId, topicViewerToken);
  const topicDisplay = topicSnapshot.round?.topicDisplay;
  const answer = topicDisplay ? answerByTopicDisplay[topicDisplay] : undefined;
  if (!answer) {
    throw new Error(`No test answer is registered for topic: ${topicDisplay ?? "unknown"}`);
  }

  await service.submitAnswer(roomId, roundNo, answererToken, answer);
}

function playerStats(snapshot: SessionResponse["snapshot"], playerId: string) {
  const player = snapshot.players.find((candidate) => candidate.playerId === playerId);
  if (!player) {
    throw new Error(`Player not found in snapshot: ${playerId}`);
  }
  return player;
}
