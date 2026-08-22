export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message: string): ApiError {
  return new ApiError(400, "BAD_REQUEST", message);
}

export function unauthorized(message = "Authentication is required."): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "This operation is not available."): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function conflict(message: string): ApiError {
  return new ApiError(409, "CONFLICT", message);
}

export function notFound(message = "The requested resource was not found."): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function tooManyRequests(retryAfterSeconds: number): ApiError {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return new ApiError(429, "RATE_LIMITED", `Too many requests. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`);
}
