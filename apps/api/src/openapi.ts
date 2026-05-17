export type OpenApiSchema = {
  type?: string;
  format?: string;
  enum?: readonly string[];
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: readonly string[];
  nullable?: boolean;
  additionalProperties?: boolean | OpenApiSchema;
  oneOf?: readonly OpenApiSchema[];
  $ref?: string;
};

export type OpenApiOperation = {
  tags: string[];
  summary: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: "header" | "path" | "query";
    required?: boolean;
    description?: string;
    schema: OpenApiSchema;
  }>;
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: OpenApiSchema }>;
  };
  responses: Record<string, {
    description: string;
    content?: Record<string, { schema: OpenApiSchema }>;
  }>;
};

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, Partial<Record<"get" | "post", OpenApiOperation>>>;
  components: {
    securitySchemes: Record<string, {
      type: string;
      description: string;
    }>;
    schemas: Record<string, OpenApiSchema>;
  };
};

const jsonContent = (schema: OpenApiSchema) => ({
  "application/json": { schema }
});

const ref = (name: string): OpenApiSchema => ({ $ref: `#/components/schemas/${name}` });

const roomIdParameter = {
  name: "roomId",
  in: "path" as const,
  required: true,
  description: "6 桁のルーム ID",
  schema: { type: "string" }
};

const roundNoParameter = {
  name: "roundNo",
  in: "path" as const,
  required: true,
  description: "1 始まりのラウンド番号",
  schema: { type: "integer" }
};

const guestAuthorizationHeader = {
  name: "Authorization",
  in: "header" as const,
  required: true,
  description: "`Guest <playerToken>` 形式の参加者トークン",
  schema: { type: "string" }
};

const hostAuthorizationHeader = {
  name: "Authorization",
  in: "header" as const,
  required: true,
  description: "`Host <hostToken>` 形式のホストトークン",
  schema: { type: "string" }
};

const errorResponses = {
  "400": {
    description: "入力値が不正",
    content: jsonContent(ref("ApiErrorBody"))
  },
  "401": {
    description: "参加者トークンが不正または不足",
    content: jsonContent(ref("ApiErrorBody"))
  },
  "403": {
    description: "権限不足",
    content: jsonContent(ref("ApiErrorBody"))
  },
  "404": {
    description: "ルームが存在しない",
    content: jsonContent(ref("ApiErrorBody"))
  },
  "409": {
    description: "ルームまたはラウンド状態が操作条件を満たさない",
    content: jsonContent(ref("ApiErrorBody"))
  },
  "500": {
    description: "予期しないサーバーエラー",
    content: jsonContent(ref("ApiErrorBody"))
  }
};

export const openApiDocument: OpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Hirameki Relay API",
    version: "0.1.0",
    description: "ひらめきリレー MVP のルーム作成、参加、進行操作を提供する Hono API。"
  },
  servers: [
    { url: "/api", description: "CloudFront / local proxy under /api" }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["system"],
        summary: "ヘルスチェック",
        responses: {
          "200": {
            description: "API が応答可能",
            content: jsonContent(ref("HealthResponse"))
          }
        }
      }
    },
    "/api/openapi.json": {
      get: {
        tags: ["system"],
        summary: "OpenAPI JSON",
        description: "runtime が公開する OpenAPI document。生成 docs の source of truth。",
        responses: {
          "200": {
            description: "OpenAPI document",
            content: jsonContent({ type: "object", additionalProperties: true })
          }
        }
      }
    },
    "/api/v1/rooms": {
      post: {
        tags: ["rooms"],
        summary: "ルームを作成",
        requestBody: {
          required: true,
          content: jsonContent(ref("JoinRoomRequest"))
        },
        responses: {
          "201": {
            description: "作成されたルームとホストセッション",
            content: jsonContent(ref("SessionResponse"))
          },
          ...errorResponses
        }
      }
    },
    "/api/v1/rooms/{roomId}/join": {
      post: {
        tags: ["rooms"],
        summary: "ルームに参加",
        parameters: [roomIdParameter],
        requestBody: {
          required: true,
          content: jsonContent(ref("JoinRoomRequest"))
        },
        responses: {
          "200": {
            description: "参加者セッション",
            content: jsonContent(ref("SessionResponse"))
          },
          ...errorResponses
        }
      }
    },
    "/api/v1/rooms/{roomId}/snapshot": {
      get: {
        tags: ["rooms"],
        summary: "ルームの公開スナップショットを取得",
        parameters: [roomIdParameter, {
          ...guestAuthorizationHeader,
          required: false,
          description: "任意。指定すると viewerRole と秘匿表示が参加者視点になる。"
        }],
        responses: {
          "200": {
            description: "ルーム状態",
            content: jsonContent(ref("RoomSnapshot"))
          },
          ...errorResponses
        }
      }
    },
    "/api/v1/rooms/{roomId}/ws-ticket": {
      post: {
        tags: ["rooms"],
        summary: "WebSocket 接続用 ticket を発行",
        parameters: [roomIdParameter, guestAuthorizationHeader],
        responses: {
          "201": {
            description: "短時間有効な WebSocket ticket",
            content: jsonContent(ref("WsTicketResponse"))
          },
          ...errorResponses
        }
      }
    },
    "/api/v1/rooms/{roomId}/start": {
      post: {
        tags: ["game"],
        summary: "ゲームを開始",
        parameters: [roomIdParameter, hostAuthorizationHeader],
        responses: {
          "200": {
            description: "開始後のルーム状態",
            content: jsonContent(ref("RoomSnapshot"))
          },
          ...errorResponses
        }
      }
    },
    "/api/v1/rooms/{roomId}/rounds/{roundNo}/hints": {
      post: {
        tags: ["game"],
        summary: "ヒントを投稿",
        parameters: [roomIdParameter, roundNoParameter, guestAuthorizationHeader],
        requestBody: {
          required: true,
          content: jsonContent(ref("SubmitHintRequest"))
        },
        responses: {
          "200": {
            description: "投稿後のルーム状態",
            content: jsonContent(ref("RoomSnapshot"))
          },
          ...errorResponses
        }
      }
    },
    "/api/v1/rooms/{roomId}/rounds/{roundNo}/answers": {
      post: {
        tags: ["game"],
        summary: "回答を送信",
        parameters: [roomIdParameter, roundNoParameter, guestAuthorizationHeader],
        requestBody: {
          required: true,
          content: jsonContent(ref("SubmitAnswerRequest"))
        },
        responses: {
          "200": {
            description: "回答判定後のルーム状態",
            content: jsonContent(ref("RoomSnapshot"))
          },
          ...errorResponses
        }
      }
    },
    "/api/v1/rooms/{roomId}/rounds/{roundNo}/skip": {
      post: {
        tags: ["game"],
        summary: "回答をスキップ",
        parameters: [roomIdParameter, roundNoParameter, guestAuthorizationHeader],
        responses: {
          "200": {
            description: "スキップ後のルーム状態",
            content: jsonContent(ref("RoomSnapshot"))
          },
          ...errorResponses
        }
      }
    },
    "/api/v1/rooms/{roomId}/next-round": {
      post: {
        tags: ["game"],
        summary: "次のラウンドへ進行",
        parameters: [roomIdParameter, hostAuthorizationHeader],
        responses: {
          "200": {
            description: "次ラウンドまたはゲーム結果のルーム状態",
            content: jsonContent(ref("RoomSnapshot"))
          },
          ...errorResponses
        }
      }
    }
  },
  components: {
    securitySchemes: {
      guestToken: {
        type: "apiKey",
        description: "`Authorization: Guest <playerToken>`"
      },
      hostToken: {
        type: "apiKey",
        description: "`Authorization: Host <hostToken>`"
      }
    },
    schemas: {
      HealthResponse: {
        type: "object",
        required: ["ok"],
        properties: {
          ok: { type: "boolean" }
        }
      },
      JoinRoomRequest: {
        type: "object",
        required: ["nickname", "avatarId"],
        properties: {
          nickname: { type: "string" },
          avatarId: {
            type: "string",
            enum: ["ghost", "rabbit", "cat", "penguin", "chick", "frog"]
          }
        }
      },
      SubmitHintRequest: {
        type: "object",
        required: ["hint"],
        properties: {
          hint: { type: "string" }
        }
      },
      SubmitAnswerRequest: {
        type: "object",
        required: ["answer"],
        properties: {
          answer: { type: "string" }
        }
      },
      SessionResponse: {
        type: "object",
        required: ["roomId", "playerId", "playerToken", "snapshot"],
        properties: {
          roomId: { type: "string" },
          playerId: { type: "string" },
          playerToken: { type: "string" },
          hostToken: { type: "string" },
          snapshot: ref("RoomSnapshot")
        }
      },
      RoomSnapshot: {
        type: "object",
        required: ["roomId", "status", "hostPlayerId", "settings", "currentRoundNo", "players", "round", "hints", "submittedHintPlayerIds", "viewerRole", "permissions"],
        properties: {
          roomId: { type: "string" },
          status: { type: "string", enum: ["LOBBY", "IN_GAME", "GAME_RESULT", "CLOSED"] },
          hostPlayerId: { type: "string" },
          settings: ref("RoomSettings"),
          currentRoundNo: { type: "integer" },
          players: { type: "array", items: ref("Player") },
          round: { oneOf: [ref("Round"), { type: "null" }] },
          hints: { type: "array", items: ref("PublicHint") },
          submittedHintPlayerIds: { type: "array", items: { type: "string" } },
          viewerPlayerId: { type: "string" },
          viewerRole: { type: "string", enum: ["answerer", "hinter", "spectator", "unknown"] },
          permissions: ref("RoomPermissions"),
          wsUrl: { type: "string" }
        }
      },
      RoomPermissions: {
        type: "object",
        required: ["canStartGame", "canGoNextRound", "canSubmitAnswer", "canSubmitHint"],
        properties: {
          canStartGame: { type: "boolean" },
          canGoNextRound: { type: "boolean" },
          canSubmitAnswer: { type: "boolean" },
          canSubmitHint: { type: "boolean" }
        }
      },
      RoomSettings: {
        type: "object",
        required: ["maxPlayers", "hintSeconds", "answerSeconds", "roundMode"],
        properties: {
          maxPlayers: { type: "integer" },
          hintSeconds: { type: "integer" },
          answerSeconds: { type: "integer" },
          roundMode: { type: "string", enum: ["ONE_ANSWERER_PER_PLAYER"] }
        }
      },
      Player: {
        type: "object",
        required: ["playerId", "nickname", "avatarId", "score", "correctCount", "assistCount", "isHost", "joinedAt", "lastSeenAt"],
        properties: {
          playerId: { type: "string" },
          nickname: { type: "string" },
          avatarId: { type: "string" },
          score: { type: "integer" },
          correctCount: { type: "integer" },
          assistCount: { type: "integer" },
          isHost: { type: "boolean" },
          joinedAt: { type: "string", format: "date-time" },
          lastSeenAt: { type: "string", format: "date-time" }
        }
      },
      Round: {
        type: "object",
        required: ["roundNo", "status", "answererPlayerId", "topicId", "deadlineAt", "revealedHintCount", "winningHintPlayerId", "result"],
        properties: {
          roundNo: { type: "integer" },
          status: { type: "string", enum: ["PREPARING", "HINT_SUBMITTING", "ANSWERING", "ROUND_RESULT", "SKIPPED"] },
          answererPlayerId: { type: "string" },
          topicId: { type: "string" },
          topicDisplay: { type: "string" },
          deadlineAt: { type: "string", format: "date-time" },
          revealedHintCount: { type: "integer" },
          winningHintPlayerId: { oneOf: [{ type: "string" }, { type: "null" }] },
          result: { oneOf: [{ type: "string", enum: ["CORRECT", "INCORRECT"] }, { type: "null" }] }
        }
      },
      PublicHint: {
        type: "object",
        required: ["playerId", "hint", "length", "revealed"],
        properties: {
          playerId: { type: "string" },
          hint: { type: "string" },
          length: { type: "integer" },
          revealed: { type: "boolean" }
        }
      },
      WsTicketResponse: {
        type: "object",
        required: ["ticket", "expiresIn", "wsUrl"],
        properties: {
          ticket: { type: "string" },
          expiresIn: { type: "integer" },
          wsUrl: { type: "string" }
        }
      },
      ApiErrorBody: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "object", additionalProperties: true }
            }
          }
        }
      }
    }
  }
};
