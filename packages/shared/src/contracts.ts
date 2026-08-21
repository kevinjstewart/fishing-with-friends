export interface PlayerProfile {
  id: string;
  telegramUsername: string | null;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthResponse {
  status: "ok";
  service: "fishing-with-friends-worker";
}

export interface TelegramAuthRequest {
  initData: string;
}

export interface DevAuthRequest {
  displayName?: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  player: PlayerProfile;
}

export interface MeResponse {
  player: PlayerProfile;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
