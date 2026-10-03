"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "next-intl";

const subscribe = () => () => {};

/** True after hydration. The server renders UTC; the browser then shows the viewer's own time zone. */
export function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

const PRESETS = {
  dateTime: { dateStyle: "medium", timeStyle: "short" },
  date: { dateStyle: "medium" },
  time: { timeStyle: "short" },
  weekdayTime: { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/** A date in the viewer's time zone (scheduled sessions must show local time, not the server's). */
export function LocalTime({ date, preset = "dateTime", className }: { date: Date | string; preset?: keyof typeof PRESETS; className?: string }) {
  const locale = useLocale();
  const client = useIsClient();
  const value = typeof date === "string" ? new Date(date) : date;
  const opts: Intl.DateTimeFormatOptions = client ? PRESETS[preset] : { ...PRESETS[preset], timeZone: "UTC" };
  return (
    <time dateTime={value.toISOString()} className={className}>
      {new Intl.DateTimeFormat(locale, opts).format(value)}
    </time>
  );
}

/** `yyyy-MM-ddTHH:mm` in local time, for <input type="datetime-local">. */
export function toLocalInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
