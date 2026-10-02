"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions/result";

/** Turns a failed ActionResult into a friendly toast. Returns true when the action succeeded. */
export function useActionFeedback() {
  const t = useTranslations("errors");
  return function handle<T>(result: ActionResult<T> | undefined, success?: string): boolean {
    // Actions that redirect on success resolve to undefined.
    if (!result || result.ok) {
      if (success) toast.success(success);
      return true;
    }
    toast.error(t(result.error));
    return false;
  };
}
