"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectDialog } from "./project-dialog";

/** "New project" button. Also opens automatically for `?new=1` (used by the palette and sidebar). */
export function NewProjectButton({
  scope,
  variant = "default",
}: {
  scope: { workspaceId: string; slug: string };
  variant?: "default" | "outline" | "soft";
}) {
  const t = useTranslations("projects");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const fromUrl = params.get("new") === "1";

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && fromUrl) router.replace(pathname, { scroll: false });
  };

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon />
        {t("new")}
      </Button>
      <ProjectDialog scope={scope} open={open || fromUrl} onOpenChange={onOpenChange} />
    </>
  );
}
