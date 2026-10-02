"use client";

import { useTranslations } from "next-intl";
import type { DefaultCopy } from "@/lib/forms/questions";

/** Default text for new questions, in the builder's UI language. */
export function useDefaultCopy(): DefaultCopy {
  const t = useTranslations("builder");
  return {
    question: t("untitledQuestion"),
    option: (n) => t("option", { n }),
    likert: t.raw("likertDefaults") as string[],
    row: (n) => t("row", { n }),
    column: (n) => t("column", { n }),
  };
}
