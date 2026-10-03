"use client";

import { useFormatter, useNow } from "next-intl";

/** Localized "3 minutes ago". Refreshes every minute. */
export function RelativeTime({ date }: { date: Date | string }) {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const value = typeof date === "string" ? new Date(date) : date;
  return (
    <time dateTime={value.toISOString()} title={format.dateTime(value, { dateStyle: "medium", timeStyle: "short" })}>
      {format.relativeTime(value, now)}
    </time>
  );
}
