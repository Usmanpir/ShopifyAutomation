/** Typed application errors. Services throw these; the API layer maps them to HTTP responses. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: string = "bad_request",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(`${what} not found`, 404, "not_found");
export const forbidden = (message = "You don't have permission to do that") => new AppError(message, 403, "forbidden");
export const unauthorized = () => new AppError("Please sign in to continue", 401, "unauthorized");
export const conflict = (message: string) => new AppError(message, 409, "conflict");
export const badRequest = (message: string, details?: unknown) => new AppError(message, 400, "bad_request", details);
export const tooManyRequests = (retryAfter: number) =>
  new AppError("Too many requests. Please slow down.", 429, "rate_limited", { retryAfter });
