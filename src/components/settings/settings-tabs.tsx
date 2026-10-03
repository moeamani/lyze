"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SegmentedNav } from "@/components/common/segmented-nav";

export function SettingsTabs({ base }: { base: string }) {
  const t = useTranslations("settingsTabs");
  const path = usePathname();
  const items = [
    { href: base, label: t("general"), active: path === base },
    { href: `${base}/members`, label: t("members"), active: path.startsWith(`${base}/members`) },
    { href: `${base}/ai`, label: t("ai"), active: path.startsWith(`${base}/ai`) },
    { href: `${base}/api`, label: t("api"), active: path.startsWith(`${base}/api`) },
  ];
  return <SegmentedNav label={t("label")} items={items} />;
}
