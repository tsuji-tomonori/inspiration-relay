import type { RoomSnapshot, SessionResponse } from "@hirameki-relay/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export interface SessionTokens {
  playerToken: string;
  hostToken?: string;
}

export async function createRoom(input: { nickname: string; avatarId: string }): Promise<SessionResponse> {
  return request("/api/v1/rooms", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function joinRoom(roomId: string, input: { nickname: string; avatarId: string }): Promise<SessionResponse> {
  return request(`/api/v1/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchSnapshot(roomId: string, tokens: SessionTokens): Promise<RoomSnapshot> {
  return request(`/api/v1/rooms/${roomId}/snapshot`, {
    headers: guestHeaders(tokens.playerToken)
  });
}

export async function startGame(roomId: string, hostToken: string): Promise<RoomSnapshot> {
  return request(`/api/v1/rooms/${roomId}/start`, {
    method: "POST",
    headers: hostHeaders(hostToken)
  });
}

export async function submitHint(roomId: string, roundNo: number, playerToken: string, hint: string): Promise<RoomSnapshot> {
  return request(`/api/v1/rooms/${roomId}/rounds/${roundNo}/hints`, {
    method: "POST",
    headers: guestHeaders(playerToken),
    body: JSON.stringify({ hint })
  });
}

export async function submitAnswer(roomId: string, roundNo: number, playerToken: string, answer: string): Promise<RoomSnapshot> {
  return request(`/api/v1/rooms/${roomId}/rounds/${roundNo}/answers`, {
    method: "POST",
    headers: guestHeaders(playerToken),
    body: JSON.stringify({ answer })
  });
}

export async function skipAnswer(roomId: string, roundNo: number, playerToken: string): Promise<RoomSnapshot> {
  return request(`/api/v1/rooms/${roomId}/rounds/${roundNo}/skip`, {
    method: "POST",
    headers: guestHeaders(playerToken)
  });
}

export async function nextRound(roomId: string, hostToken: string): Promise<RoomSnapshot> {
  return request(`/api/v1/rooms/${roomId}/next-round`, {
    method: "POST",
    headers: hostHeaders(hostToken)
  });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? "通信に失敗しました");
  }
  return data as T;
}

function guestHeaders(playerToken: string): HeadersInit {
  return { Authorization: `Guest ${playerToken}` };
}

function hostHeaders(hostToken: string): HeadersInit {
  return { Authorization: `Host ${hostToken}` };
}
