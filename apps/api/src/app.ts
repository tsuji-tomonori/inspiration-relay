import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { openApiDocument } from "./openapi";
import { createRealtimeRepositoryFromEnv, createRoomEventBroadcasterFromEnv } from "./realtime";
import { ApiError, GameService } from "./service";
import { createRoomRepositoryFromEnv } from "./store";

export const repository = createRoomRepositoryFromEnv();
export const realtimeRepository = createRealtimeRepositoryFromEnv();
export const roomEventBroadcaster = createRoomEventBroadcasterFromEnv(realtimeRepository);
export const gameService = new GameService(repository, realtimeRepository, roomEventBroadcaster);

export function createApp(service = gameService): Hono {
  const app = new Hono();

  app.use("*", cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"]
  }));

  app.get("/health", (context) => context.json({ ok: true }));
  app.get("/openapi.json", (context) => context.json(openApiDocument));
  app.get("/api/openapi.json", (context) => context.json(openApiDocument));

  app.post("/api/v1/rooms", async (context) => {
    const body = await context.req.json<{ nickname: string; avatarId: string }>();
    return context.json(await service.createRoom(body), 201);
  });

  app.post("/api/v1/rooms/:roomId/join", async (context) => {
    const body = await context.req.json<{ nickname: string; avatarId: string }>();
    return context.json(await service.joinRoom(context.req.param("roomId"), body), 200);
  });

  app.get("/api/v1/rooms/:roomId/snapshot", async (context) => {
    return context.json(await service.snapshot(context.req.param("roomId"), parseGuestToken(context.req.header("Authorization"))), 200);
  });

  app.post("/api/v1/rooms/:roomId/ws-ticket", async (context) => {
    return context.json(await service.wsTicket(context.req.param("roomId"), requireGuestToken(context.req.header("Authorization"))), 201);
  });

  app.post("/api/v1/rooms/:roomId/start", async (context) => {
    return context.json(await service.startGame(context.req.param("roomId"), requireHostToken(context.req.header("Authorization"))), 200);
  });

  app.post("/api/v1/rooms/:roomId/rounds/:roundNo/hints", async (context) => {
    const body = await context.req.json<{ hint: string }>();
    return context.json(await service.submitHint(
      context.req.param("roomId"),
      Number(context.req.param("roundNo")),
      requireGuestToken(context.req.header("Authorization")),
      body.hint
    ), 200);
  });

  app.post("/api/v1/rooms/:roomId/rounds/:roundNo/answers", async (context) => {
    const body = await context.req.json<{ answer: string }>();
    return context.json(await service.submitAnswer(
      context.req.param("roomId"),
      Number(context.req.param("roundNo")),
      requireGuestToken(context.req.header("Authorization")),
      body.answer
    ), 200);
  });

  app.post("/api/v1/rooms/:roomId/rounds/:roundNo/skip", async (context) => {
    return context.json(await service.skipAnswer(
      context.req.param("roomId"),
      Number(context.req.param("roundNo")),
      requireGuestToken(context.req.header("Authorization"))
    ), 200);
  });

  app.post("/api/v1/rooms/:roomId/next-round", async (context) => {
    return context.json(await service.nextRound(context.req.param("roomId"), requireHostToken(context.req.header("Authorization"))), 200);
  });

  app.onError((error, context) => {
    if (error instanceof ApiError) {
      return context.json({ error: { code: error.code, message: error.message, details: error.details } }, error.status as ContentfulStatusCode);
    }
    console.error(error);
    return context.json({ error: { code: "INTERNAL_ERROR", message: "予期しないエラーが発生しました" } }, 500);
  });

  return app;
}

export const app = createApp();

function parseGuestToken(header: string | undefined): string | undefined {
  return header?.startsWith("Guest ") ? header.slice("Guest ".length) : undefined;
}

function requireGuestToken(header: string | undefined): string {
  const token = parseGuestToken(header);
  if (!token) {
    throw new ApiError("INVALID_TOKEN", "Guest トークンが必要です", 401);
  }
  return token;
}

function requireHostToken(header: string | undefined): string {
  if (!header?.startsWith("Host ")) {
    throw new ApiError("HOST_ONLY", "Host トークンが必要です", 403);
  }
  return header.slice("Host ".length);
}
