"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

const subscribe = () => () => {};

/** Time-of-day greeting in the viewer's own timezone (the server renders a neutral greeting). */
export function Greeting({ name }: { name: string }) {
  const t = useTranslations("dashboard.greeting");
  const hour = useSyncExternalStore(subscribe, () => new Date().getHours(), () => null);
  if (hour === null) return <>{t("neutral", { name })}</>;
  if (hour < 12) return <>{t("morning", { name })}</>;
  if (hour < 18) return <>{t("afternoon", { name })}</>;
  return <>{t("evening", { name })}</>;
}
