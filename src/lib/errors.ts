export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export const unauthorized = () => new AppError(401, "Sign in required", "unauthorized");
export const forbidden = (msg = "You do not have access to this resource") =>
  new AppError(403, msg, "forbidden");
export const notFound = (what = "Resource") => new AppError(404, `${what} not found`, "not_found");
export const badRequest = (msg: string) => new AppError(400, msg, "bad_request");
export const conflict = (msg: string) => new AppError(409, msg, "conflict");
