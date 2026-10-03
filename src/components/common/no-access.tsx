import { getTranslations } from "next-intl/server";
import { Mascot } from "@/components/illustrations";
import { EmptyState } from "./empty-state";

export async function NoAccess() {
  const t = await getTranslations("errors");
  return (
    <EmptyState illustration={<Mascot mood="curious" />} title={t("noAccessTitle")} description={t("noAccessBody")} />
  );
}
