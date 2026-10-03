"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { checkAiKeyAction, removeAiKeyAction, saveAiSettingsAction } from "@/server/actions/settings";

type Status = { configured: boolean; source: "workspace" | "server" | null; hint: string | null; model: string };

/** Add or replace the workspace's Anthropic API key and pick the model. The key never comes back to the browser. */
export function AiSettingsForm({ scope, status, models, canManage }: { scope: { workspaceId: string; slug: string }; status: Status; models: readonly string[]; canManage: boolean }) {
  const t = useTranslations("aiSettings");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState("");
  const [model, setModel] = useState(status.model);

  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
        <KeyRoundIcon className="mt-0.5 size-5 text-section-coding" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">{status.source === "workspace" ? t("statusWorkspace", { hint: status.hint ?? "" }) : status.source === "server" ? t("statusServer") : t("statusNone")}</p>
          <p className="text-muted-foreground">{t("statusHint")}</p>
        </div>
        {status.configured && canManage && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await checkAiKeyAction(scope);
                if (!feedback(r)) return;
                if (r.ok && r.data.ok) toast.success(t("keyWorks"));
                else if (r.ok && !r.data.ok) toast.error(t(`checkResult.${r.data.reason}`));
              })
            }
          >
            <CheckCircle2Icon /> {t("check")}
          </Button>
        )}
      </div>

      {canManage ? (
        <form
          className="grid gap-4 rounded-xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (feedback(await saveAiSettingsAction(scope, { apiKey: key.trim(), model }), t("saved"))) {
                setKey("");
                router.refresh();
              }
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="ai-key">{status.source === "workspace" ? t("replaceKey") : t("apiKey")}</Label>
            <Input id="ai-key" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("keyHelp")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-model">{t("model")}</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="ai-model" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>{t(`models.${m.split("-").slice(0, 2).join("-") as "claude-opus"}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || (!key.trim() && status.source !== "workspace")}>
              {pending && <Loader2Icon className="animate-spin" />}
              {t("save")}
            </Button>
            {status.source === "workspace" && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => startTransition(async () => void (feedback(await removeAiKeyAction(scope), t("removed")) && router.refresh()))}
              >
                <Trash2Icon /> {t("remove")}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{t("ownersOnly")}</p>
      )}
      <p className="text-xs text-pretty text-muted-foreground">{t("placeholderNote")}</p>
    </div>
  );
}
