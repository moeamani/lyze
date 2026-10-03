"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2Icon, ExternalLinkIcon, KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { checkAiKeyAction, removeAiKeyAction, saveAiSettingsAction } from "@/server/actions/settings";
import { AI_PROVIDERS, AI_PROVIDER_IDS, type AiProviderId } from "@/lib/ai-providers";

type Status = { configured: boolean; source: "workspace" | "server" | null; provider: AiProviderId; hint: string | null; model: string; baseUrl: string | null };

/** Pick an AI provider (several have free tiers), paste its key, choose a model. The key never comes back to the browser. */
export function AiSettingsForm({ scope, status, canManage }: { scope: { workspaceId: string; slug: string }; status: Status; canManage: boolean }) {
  const t = useTranslations("aiSettings");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = useState<AiProviderId>(status.provider);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(status.model);
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? AI_PROVIDERS[status.provider].baseUrl ?? "");
  const info = AI_PROVIDERS[provider];
  const saved = status.source === "workspace" && status.provider === provider;
  const keyRequired = info.needsKey === true && !saved;

  const choose = (p: AiProviderId) => {
    setProvider(p);
    // A model from another provider would never work: switch to this provider's first suggestion.
    setModel(p === status.provider ? status.model : (AI_PROVIDERS[p].models[0] ?? ""));
    setBaseUrl(p === status.provider && status.baseUrl ? status.baseUrl : (AI_PROVIDERS[p].baseUrl ?? ""));
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-4">
        <KeyRoundIcon className="mt-0.5 size-5 shrink-0 text-section-coding" aria-hidden />
        <div className="min-w-0 flex-1 basis-56 text-sm">
          <p className="font-medium">
            {status.source === "workspace"
              ? t("statusWorkspace", { provider: AI_PROVIDERS[status.provider].label, hint: status.hint ?? "" })
              : status.source === "server"
                ? t("statusServer")
                : t("statusNone")}
          </p>
          <p className="text-pretty text-muted-foreground">{t("statusHint")}</p>
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
          className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (feedback(await saveAiSettingsAction(scope, { provider, apiKey: key.trim(), model: model.trim(), baseUrl: baseUrl.trim() }), t("saved"))) {
                setKey("");
                router.refresh();
              }
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="ai-provider">{t("provider")}</Label>
            <Select value={provider} onValueChange={(v) => choose(v as AiProviderId)}>
              <SelectTrigger id="ai-provider" className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDER_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    <span className="truncate">{AI_PROVIDERS[id].label}</span>
                    {AI_PROVIDERS[id].free && <span className="ms-auto rounded bg-success/15 px-1.5 text-[0.7rem] font-medium text-success">{t("free")}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-pretty text-muted-foreground">
              {t(`providerHint.${provider}`)}{" "}
              {info.keyUrl && (
                <a href={info.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:underline">
                  {provider === "ollama" ? t("getOllama") : t("getKey")}
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
              )}
            </p>
          </div>

          {info.needsKey !== false && (
            <div className="grid gap-2">
              <Label htmlFor="ai-key">
                {saved ? t("replaceKey") : t("apiKey")}
                {info.needsKey === "optional" && <span className="font-normal text-muted-foreground"> {t("optional")}</span>}
              </Label>
              <Input id="ai-key" type="password" autoComplete="off" spellCheck={false} dir="ltr" placeholder={saved ? `…${status.hint ?? ""}` : ""} value={key} onChange={(e) => setKey(e.target.value)} />
              <p className="text-xs text-muted-foreground">{saved ? t("keepKey") : t("keyHelp")}</p>
            </div>
          )}

          {info.editableUrl && (
            <div className="grid gap-2">
              <Label htmlFor="ai-url">{t("baseUrl")}</Label>
              <Input id="ai-url" dir="ltr" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" />
              <p className="text-xs text-muted-foreground">{t(provider === "ollama" ? "baseUrlOllama" : "baseUrlHint")}</p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="ai-model">{t("model")}</Label>
            <Input id="ai-model" dir="ltr" list="ai-model-options" className="w-full sm:w-80" value={model} onChange={(e) => setModel(e.target.value)} />
            <datalist id="ai-model-options">
              {info.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">{t("modelHint")}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || !model.trim() || (keyRequired && !key.trim()) || (info.editableUrl && !baseUrl.trim())}>
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
