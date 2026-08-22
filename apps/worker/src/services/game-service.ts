import type { GameStateResponse } from "@fishing/shared";
import type { Env } from "../env";
import { GameRepository } from "../persistence/game-repository";

export async function getGameState(env: Env, playerId: string): Promise<GameStateResponse> {
  return new GameRepository(env.DB).getState(playerId);
}
