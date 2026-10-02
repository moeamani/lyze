"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { deleteResponseAction } from "@/server/actions/forms";

export function DeleteResponseButton({ scope, responseId }: { scope: { workspaceId: string; slug: string; projectId: string; studyId: string }; responseId: string }) {
  const t = useTranslations("responses");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2Icon />
        {t("delete")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (feedback(await deleteResponseAction(scope, responseId), t("deleted"))) {
            router.push(`/w/${scope.slug}/p/${scope.projectId}/s/${scope.studyId}/responses`);
          }
        }}
      />
    </>
  );
}
