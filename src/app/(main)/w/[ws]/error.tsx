"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/common/page-header";
import { Mascot } from "@/components/illustrations";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  useEffect(() => console.error(error), [error]);
  return (
    <PageContainer>
      <EmptyState illustration={<Mascot mood="curious" />} title={t("pageTitle")} description={t("pageBody")}>
        <Button onClick={reset} variant="outline">
          <RotateCcwIcon />
          {t("retry")}
        </Button>
      </EmptyState>
    </PageContainer>
  );
}
