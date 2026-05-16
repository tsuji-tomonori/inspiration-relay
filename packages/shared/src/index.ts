export type RoomStatus = "LOBBY" | "IN_GAME" | "GAME_RESULT" | "CLOSED";
export type RoundStatus = "PREPARING" | "HINT_SUBMITTING" | "ANSWERING" | "ROUND_RESULT" | "SKIPPED";
export type AvatarId = "ghost" | "rabbit" | "cat" | "penguin" | "chick" | "frog";

export interface Topic {
  id: string;
  category: "food" | "animal" | "place" | "item" | "vehicle" | "feeling";
  display: string;
  answerKana: string;
  aliases: string[];
  difficulty: 1 | 2 | 3;
  enabled: boolean;
}

export interface Player {
  playerId: string;
  nickname: string;
  avatarId: AvatarId;
  score: number;
  correctCount: number;
  assistCount: number;
  isHost: boolean;
  joinedAt: string;
  lastSeenAt: string;
}

export interface Hint {
  hintId: string;
  roundNo: number;
  playerId: string;
  hint: string;
  length: number;
  submittedAt: string;
  sequence: number;
}

export interface PublicHint {
  playerId: string;
  hint: string;
  length: number;
  revealed: boolean;
}

export interface Round {
  roundNo: number;
  status: RoundStatus;
  answererPlayerId: string;
  topicId: string;
  topicDisplay?: string;
  answerKana?: string;
  aliases?: string[];
  deadlineAt: string;
  revealedHintCount: number;
  winningHintPlayerId: string | null;
  result: "CORRECT" | "INCORRECT" | null;
}

export interface RoomSettings {
  maxPlayers: number;
  hintSeconds: number;
  answerSeconds: number;
  roundMode: "ONE_ANSWERER_PER_PLAYER";
}

export interface RoomSnapshot {
  roomId: string;
  status: RoomStatus;
  hostPlayerId: string;
  settings: RoomSettings;
  currentRoundNo: number;
  players: Player[];
  round: Round | null;
  hints: PublicHint[];
  submittedHintPlayerIds: string[];
  viewerPlayerId?: string;
  viewerRole: "host" | "answerer" | "hinter" | "spectator" | "unknown";
  wsUrl?: string;
}

export interface SessionResponse {
  roomId: string;
  playerId: string;
  playerToken: string;
  hostToken?: string;
  snapshot: RoomSnapshot;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export const avatarIds: AvatarId[] = ["ghost", "rabbit", "cat", "penguin", "chick", "frog"];

export const defaultRoomSettings: RoomSettings = {
  maxPlayers: 6,
  hintSeconds: 30,
  answerSeconds: 15,
  roundMode: "ONE_ANSWERER_PER_PLAYER"
};

export const initialTopics: Topic[] = [
  { id: "food_pancake_001", category: "food", display: "パンケーキ", answerKana: "ぱんけーき", aliases: ["ほっとけーき"], difficulty: 1, enabled: true },
  { id: "food_ramen_001", category: "food", display: "ラーメン", answerKana: "らーめん", aliases: ["らあめん"], difficulty: 1, enabled: true },
  { id: "animal_penguin_001", category: "animal", display: "ペンギン", answerKana: "ぺんぎん", aliases: [], difficulty: 1, enabled: true },
  { id: "animal_frog_001", category: "animal", display: "かえる", answerKana: "かえる", aliases: ["蛙"], difficulty: 1, enabled: true },
  { id: "place_school_001", category: "place", display: "学校", answerKana: "がっこう", aliases: ["がくこう"], difficulty: 1, enabled: true },
  { id: "vehicle_train_001", category: "vehicle", display: "電車", answerKana: "でんしゃ", aliases: [], difficulty: 1, enabled: true }
];
