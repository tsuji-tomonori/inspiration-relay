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

export async function connectHandler(event: WebSocketEvent): Promise<{ statusCode: number; body?: string }> {
  const ticket = event.queryStringParameters?.ticket;
  if (!ticket) {
    return { statusCode: 401, body: "ticket is required" };
  }
  return { statusCode: 200 };
}

export async function disconnectHandler(_event: WebSocketEvent): Promise<{ statusCode: number }> {
  return { statusCode: 200 };
}

export async function messageHandler(event: WebSocketEvent): Promise<{ statusCode: number; body?: string }> {
  if (!event.body) {
    return { statusCode: 400, body: "body is required" };
  }
  return { statusCode: 200 };
}
