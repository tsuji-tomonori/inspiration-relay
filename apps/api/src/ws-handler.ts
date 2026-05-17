import { createRealtimeRepositoryFromEnv, ttlFromNow, type RealtimeRepository } from "./realtime";
import { hashToken } from "./store";

export interface WebSocketEvent {
  requestContext: {
    routeKey: "$connect" | "$disconnect" | "$default" | string;
    connectionId: string;
    domainName?: string;
    stage?: string;
  };
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
}

const realtimeRepository = createRealtimeRepositoryFromEnv();

export function createWebSocketHandlers(repository: RealtimeRepository = realtimeRepository) {
  return {
    async connectHandler(event: WebSocketEvent): Promise<{ statusCode: number; body?: string }> {
      const ticket = event.queryStringParameters?.ticket;
      if (!ticket) {
        return { statusCode: 401, body: "ticket is required" };
      }
      const storedTicket = await repository.consumeTicket(hashToken(ticket));
      if (!storedTicket) {
        return { statusCode: 401, body: "ticket is invalid or expired" };
      }
      await repository.saveConnection({
        connectionId: event.requestContext.connectionId,
        roomId: storedTicket.roomId,
        playerId: storedTicket.playerId,
        connectedAt: new Date().toISOString(),
        ttl: ttlFromNow(60 * 60 * 24)
      });
      return { statusCode: 200 };
    },

    async disconnectHandler(event: WebSocketEvent): Promise<{ statusCode: number }> {
      await repository.deleteConnection(event.requestContext.connectionId);
      return { statusCode: 200 };
    },

    async messageHandler(event: WebSocketEvent): Promise<{ statusCode: number; body?: string }> {
      if (!event.body) {
        return { statusCode: 400, body: "body is required" };
      }
      return { statusCode: 200 };
    }
  };
}

export const { connectHandler, disconnectHandler, messageHandler } = createWebSocketHandlers();
