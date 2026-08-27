/**
 * Compatibility name for callers that have not moved to the lifecycle name.
 * New orchestration code should import createTelegramLifecycle directly.
 */
export { createTelegramLifecycle as createTelegramIntegration } from "./lifecycle";
export type { TelegramLifecycle as TelegramIntegration, TelegramLifecycleOptions } from "./lifecycle";
