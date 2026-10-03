"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, FolderIcon, FolderInputIcon, FolderPlusIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RelativeTime } from "@/components/common/relative-time";
import { swatchClass } from "@/components/common/swatch";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { createGroupAction, deleteGroupAction, moveGroupAction, renameGroupAction, setProjectGroupAction } from "@/server/actions/groups";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/actions/result";

type Scope = { workspaceId: string; slug: string };
type Group = { id: string; name: string };
type Project = { id: string; name: string; description: string | null; color: string; groupId: string | null; updatedAt: Date; studyCount: number };

const COLLAPSE_KEY = "lyze:collapsed-groups";
function readCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Projects in custom groups (folders), Notion-style: collapsible sections, move a project from its menu. */
export function ProjectBoard({ scope, groups, projects, canEdit }: { scope: Scope; groups: Group[]; projects: Project[]; canEdit: boolean }) {
  const t = useTranslations("projects.groups");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<string[]>(() => (typeof window === "undefined" ? [] : readCollapsed()));
  const [naming, setNaming] = useState<{ id: string | null; name: string } | null>(null);
  const [removing, setRemoving] = useState<Group | null>(null);

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const known = new Set(groups.map((g) => g.id));
  const sections = [
    ...groups.map((g) => ({ group: g as Group | null, items: projects.filter((p) => p.groupId === g.id) })),
    { group: null, items: projects.filter((p) => !p.groupId || !known.has(p.groupId)) },
  ].filter((s) => s.group || s.items.length);

  const submitName = () => {
    if (!naming?.name.trim()) return;
    startTransition(async () => {
      const result: ActionResult<unknown> = naming.id ? await renameGroupAction(scope, naming.id, naming.name) : await createGroupAction(scope, naming.name);
      if (feedback(result, naming.id ? t("renamed") : t("created"))) setNaming(null);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      {canEdit && (
        <div className="-mt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setNaming({ id: null, name: "" })}>
            <FolderPlusIcon /> {t("new")}
          </Button>
        </div>
      )}
      {sections.map(({ group, items }, i) => {
        const id = group?.id ?? "ungrouped";
        const open = !collapsed.includes(id);
        const showHeader = groups.length > 0;
        return (
          <section key={id} aria-label={group?.name ?? t("ungrouped")} className="grid grid-cols-1 gap-2">
            {showHeader && (
              <div className="group/head flex items-center gap-1 border-b pb-1">
                <button type="button" onClick={() => toggle(id)} aria-expanded={open} className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-start text-sm font-semibold hover:bg-accent">
                  <ChevronRightIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform rtl:rotate-180", open && "rotate-90 rtl:rotate-90")} aria-hidden />
                  <FolderIcon className={cn("size-4 shrink-0", group ? "text-section-forms" : "text-muted-foreground")} aria-hidden />
                  <span className="truncate">{group?.name ?? t("ungrouped")}</span>
                  <span className="ms-1 text-xs font-normal text-muted-foreground tabular-nums">{items.length}</span>
                </button>
                {group && canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t("actionsFor", { name: group.name })}>
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setNaming({ id: group.id, name: group.name })}>
                        <PencilIcon /> {t("rename")}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={i === 0} onSelect={() => startTransition(async () => void feedback(await moveGroupAction(scope, group.id, "up")))}>
                        <ArrowUpIcon /> {t("moveUp")}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={i >= groups.length - 1} onSelect={() => startTransition(async () => void feedback(await moveGroupAction(scope, group.id, "down")))}>
                        <ArrowDownIcon /> {t("moveDown")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(group)}>
                        <Trash2Icon /> {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
            {open &&
              (items.length ? (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p) => (
                    <li key={p.id} className="relative">
                      <Link
                        href={`/w/${scope.slug}/p/${p.id}`}
                        className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                      >
                        <span className="flex items-center gap-2 pe-8">
                          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", swatchClass(p.color))} />
                          <span className="truncate font-semibold">{p.name}</span>
                        </span>
                        {/* One line, always present, so cards in a row line up. */}
                        <span className="min-h-5 truncate text-sm text-muted-foreground">{p.description}</span>
                        <span className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary">{t("studyCount", { count: p.studyCount })}</Badge>
                          <RelativeTime date={p.updatedAt} />
                        </span>
                      </Link>
                      {canEdit && groups.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="absolute end-2 top-2" aria-label={t("moveProject", { name: p.name })} disabled={pending}>
                              <FolderInputIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{t("moveTo")}</DropdownMenuLabel>
                            {groups.map((g) => (
                              <DropdownMenuItem key={g.id} disabled={p.groupId === g.id} onSelect={() => startTransition(async () => void feedback(await setProjectGroupAction(scope, p.id, g.id), t("moved", { name: g.name })))}>
                                <FolderIcon /> {g.name}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={!p.groupId} onSelect={() => startTransition(async () => void feedback(await setProjectGroupAction(scope, p.id, null)))}>
                              {t("ungroup")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">{t("emptyGroup")}</p>
              ))}
          </section>
        );
      })}

      <Dialog open={!!naming} onOpenChange={(o) => !o && setNaming(null)}>
        <DialogContent closeLabel={tc("close")} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{naming?.id ? t("renameTitle") : t("newTitle")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitName();
            }}
            className="grid gap-4"
          >
            <Input autoFocus aria-label={t("name")} placeholder={t("namePlaceholder")} maxLength={60} value={naming?.name ?? ""} onChange={(e) => setNaming((n) => n && { ...n, name: e.target.value })} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNaming(null)}>{tc("cancel")}</Button>
              <Button type="submit" disabled={pending || !naming?.name.trim()}>{naming?.id ? tc("save") : t("create")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("deleteTitle", { name: removing?.name ?? "" })}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (feedback(await deleteGroupAction(scope, removing!.id))) setRemoving(null);
        }}
      />
    </div>
  );
}
