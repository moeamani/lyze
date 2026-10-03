"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArchiveIcon, ArchiveRestoreIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { deleteProjectAction, setProjectArchivedAction } from "@/server/actions/projects";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { ProjectDialog } from "./project-dialog";

type Project = { id: string; name: string; description: string | null; color: string; archivedAt: Date | null };

export function ProjectActions({ scope, project }: { scope: { workspaceId: string; slug: string }; project: Project }) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const archived = !!project.archivedAt;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={tc("moreActions")}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <PencilIcon />
            {tc("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onSelect={() =>
              startTransition(async () => {
                feedback(await setProjectArchivedAction(scope, project.id, !archived), archived ? t("restored") : t("archived"));
              })
            }
          >
            {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {archived ? t("restore") : t("archive")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2Icon />
            {tc("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectDialog scope={scope} project={project} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("deleteTitle", { name: project.name })}
        description={t("deleteBody")}
        confirmLabel={t("deleteConfirm")}
        onConfirm={async () => feedback(await deleteProjectAction(scope, project.id))}
      />
    </>
  );
}
