export type AppErrorCode = "unauthorized" | "forbidden" | "notFound" | "conflict" | "invalid" | "lastOwner" | "inviteInvalid";

/** Expected, user-facing failure. `code` doubles as an i18n key under `errors`. */
export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
