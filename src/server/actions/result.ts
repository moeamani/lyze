import { ZodError } from "zod";
import { isAppError, type AppErrorCode } from "@/server/services/errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: AppErrorCode | "unknown"; fieldErrors?: Record<string, string> };

/**
 * Run an action body and turn expected failures into a serializable result.
 * Redirects (thrown by `redirect()`) are re-thrown so Next can handle them.
 */
export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.code };
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: "invalid", fieldErrors };
    }
    if (isNextControlFlow(error)) throw error;
    console.error(error);
    return { ok: false, error: "unknown" };
  }
}

function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}
