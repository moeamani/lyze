"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CopyIcon, KeyRoundIcon, Loader2Icon, PlusIcon, Trash2Icon, WebhookIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { RelativeTime } from "@/components/common/relative-time";
import { createApiKeyAction, createWebhookAction, deleteWebhookAction, revokeApiKeyAction } from "@/server/actions/settings";

type Scope = { workspaceId: string; slug: string };
type Key = { id: string; name: string; prefix: string; lastUsedAt: Date | null; createdAt: Date };
type Hook = { id: string; url: string; events: string[]; secret: string; lastStatus: number | null; lastDeliveredAt: Date | null };

export function ApiSettings({ scope, keys, hooks, events, origin, canManage }: { scope: Scope; keys: Key[]; hooks: Hook[]; events: readonly string[]; origin: string; canManage: boolean }) {
  const t = useTranslations("apiSettings");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [chosen, setChosen] = useState<string[]>([events[0]!]);
  const copy = async (text: string) => feedback(await navigator.clipboard?.writeText(text).then(() => ({ ok: true as const, data: null })), t("copied"));

  return (
    <div className="grid grid-cols-1 gap-6">
      <section aria-labelledby="keys-title" className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4">
        <h2 id="keys-title" className="flex items-center gap-2 font-semibold"><KeyRoundIcon className="size-4 text-section-forms" aria-hidden />{t("keys")}</h2>
        <p className="text-sm text-muted-foreground">{t("keysHint")}</p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs" dir="ltr">{`curl -H "Authorization: Bearer lyze_…" ${origin}/api/v1/projects\ncurl -H "Authorization: Bearer lyze_…" "${origin}/api/v1/studies/<studyId>/responses?format=csv"`}</pre>
        {secret && (
          <div role="status" className="grid gap-2 rounded-lg border border-warning/60 bg-warning/10 p-3 text-sm">
            <p className="font-medium">{t("copyNow")}</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={secret} dir="ltr" className="font-mono text-xs" aria-label={t("newKey")} onFocus={(e) => e.target.select()} />
              <Button size="icon-sm" variant="ghost" aria-label={t("copy")} onClick={() => copy(secret)}><CopyIcon /></Button>
            </div>
          </div>
        )}
        <ul className="grid gap-1">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50">
              <span className="font-medium">{k.name}</span>
              <code className="text-xs text-muted-foreground" dir="ltr">{k.prefix}…</code>
              <span className="ms-auto text-xs text-muted-foreground">{k.lastUsedAt ? <>{t("lastUsed")} <RelativeTime date={k.lastUsedAt} /></> : t("neverUsed")}</span>
              {canManage && (
                <Button size="icon-sm" variant="ghost" aria-label={t("revoke", { name: k.name })} disabled={pending} onClick={() => startTransition(async () => void (feedback(await revokeApiKeyAction(scope, k.id), t("revoked")) && router.refresh()))}>
                  <Trash2Icon />
                </Button>
              )}
            </li>
          ))}
          {!keys.length && <li className="text-sm text-muted-foreground">{t("noKeys")}</li>}
        </ul>
        {canManage && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await createApiKeyAction(scope, name);
                if (feedback(r) && r.ok) {
                  setSecret(r.data.secret);
                  setName("");
                  router.refresh();
                }
              });
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("keyName")} aria-label={t("keyName")} className="h-9 w-full sm:w-64" maxLength={60} />
            <Button size="sm" type="submit" disabled={pending || !name.trim()}>{pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}{t("createKey")}</Button>
          </form>
        )}
      </section>

      <section aria-labelledby="hooks-title" className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4">
        <h2 id="hooks-title" className="flex items-center gap-2 font-semibold"><WebhookIcon className="size-4 text-section-mixed" aria-hidden />{t("webhooks")}</h2>
        <p className="text-sm text-muted-foreground">{t("webhooksHint")}</p>
        <ul className="grid gap-2">
          {hooks.map((h) => (
            <li key={h.id} className="grid gap-1 rounded-lg border px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-xs" dir="ltr">{h.url}</code>
                <span className="text-xs text-muted-foreground">{h.lastStatus === null ? t("notYet") : h.lastStatus >= 200 && h.lastStatus < 300 ? t("lastOk", { status: h.lastStatus }) : t("lastFailed", { status: h.lastStatus || "—" })}</span>
                {canManage && (
                  <Button size="icon-sm" variant="ghost" aria-label={t("deleteHook")} disabled={pending} onClick={() => startTransition(async () => void (feedback(await deleteWebhookAction(scope, h.id)) && router.refresh()))}>
                    <Trash2Icon />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{h.events.join(", ")}</p>
              {canManage && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t("signingSecret")} <code dir="ltr">{h.secret.slice(0, 10)}…</code>
                  <Button size="icon-sm" variant="ghost" className="size-6" aria-label={t("copySecret")} onClick={() => copy(h.secret)}><CopyIcon /></Button>
                </p>
              )}
            </li>
          ))}
          {!hooks.length && <li className="text-sm text-muted-foreground">{t("noHooks")}</li>}
        </ul>
        {canManage && (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                if (feedback(await createWebhookAction(scope, { url, events: chosen }), t("hookCreated"))) {
                  setUrl("");
                  router.refresh();
                }
              });
            }}
          >
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/lyze-webhook" aria-label={t("hookUrl")} dir="ltr" className="h-9" />
            <fieldset className="flex flex-wrap gap-3 text-sm">
              <legend className="sr-only">{t("events")}</legend>
              {events.map((ev) => (
                <label key={ev} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={chosen.includes(ev)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, ev] : c.filter((x) => x !== ev)))} className="accent-[var(--primary)]" />
                  <code className="text-xs">{ev}</code>
                </label>
              ))}
            </fieldset>
            <Button size="sm" type="submit" className="w-fit" disabled={pending || !url.trim() || !chosen.length}><PlusIcon />{t("addHook")}</Button>
          </form>
        )}
      </section>
    </div>
  );
}
