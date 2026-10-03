"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BellIcon, CheckCheckIcon, ClipboardListIcon, FileAudioIcon, PenLineIcon, ShieldCheckIcon, TriangleAlertIcon, UserPlusIcon, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SectionIcon, type Section } from "@/components/common/section-icon";
import { RelativeTime } from "@/components/common/relative-time";
import { inboxAction, markReadAction } from "@/server/actions/notifications";
import { cn } from "@/lib/utils";

type Item = { id: string; kind: string; data: Record<string, string | number>; href: string | null; readAt: Date | null; createdAt: Date; workspaceName: string | null };

const LOOK: Record<string, { icon: LucideIcon; section: Section }> = {
  responses: { icon: ClipboardListIcon, section: "forms" },
  transcript: { icon: FileAudioIcon, section: "interviews" },
  transcriptFailed: { icon: TriangleAlertIcon, section: "writeup" },
  consent: { icon: ShieldCheckIcon, section: "people" },
  memberJoined: { icon: UserPlusIcon, section: "activity" },
  writeup: { icon: PenLineIcon, section: "writeup" },
};

/** The inbox: new responses, finished transcripts, signed consent, new members. Polls once a minute. */
export function NotificationBell({ className }: { className?: string }) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const result = await inboxAction().catch(() => null);
    if (result?.ok) {
      setItems(result.data.items);
      setUnread(result.data.unread);
    }
  }, []);

  useEffect(() => {
    // Polling an external source: the inbox lives on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const open = async (item: Item) => {
    if (!item.readAt) {
      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, readAt: new Date() } : x)));
      setUnread((n) => Math.max(0, n - 1));
      await markReadAction([item.id]);
    }
    if (item.href) router.push(item.href);
  };

  const label = unread ? t("labelUnread", { count: unread }) : t("label");
  return (
    <DropdownMenu onOpenChange={(o) => o && void load()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("relative grid size-9 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40", className)}
        >
          <BellIcon className="size-4.5" />
          {unread > 0 && (
            <span className="absolute end-1 top-1 grid min-w-4 place-items-center rounded-full bg-section-writeup px-1 text-[0.625rem] leading-4 font-semibold text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{t("title")}</p>
          <button
            type="button"
            disabled={!unread}
            onClick={async () => {
              setItems((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? new Date() })));
              setUnread(0);
              await markReadAction();
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <CheckCheckIcon className="size-3.5" aria-hidden /> {t("markAll")}
          </button>
        </div>
        <div className="max-h-[min(28rem,70dvh)] overflow-y-auto p-1">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            items.map((item) => {
              const look = LOOK[item.kind] ?? LOOK.writeup!;
              const known = item.kind in LOOK;
              return (
                <DropdownMenuItem key={item.id} onSelect={() => void open(item)} className="items-start gap-2.5 rounded-md px-2 py-2">
                  <SectionIcon section={look.section} icon={look.icon} size="sm" className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm text-pretty", !item.readAt && "font-medium")}>
                      {known ? t(`kinds.${item.kind as "responses"}`, { count: Number(item.data.count ?? 1), study: String(item.data.study ?? ""), session: String(item.data.session ?? ""), code: String(item.data.code ?? ""), name: String(item.data.name ?? "") }) : item.kind}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.workspaceName && `${item.workspaceName} · `}
                      <RelativeTime date={item.createdAt} />
                    </span>
                  </span>
                  {!item.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-section-writeup" aria-label={t("unread")} />}
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
