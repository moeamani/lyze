"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2Icon, ExternalLinkIcon, KeyRoundIcon, Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { checkAiKeyAction, removeAiKeyAction, saveAiSettingsAction } from "@/server/actions/settings";
import { AI_PROVIDERS, AI_PROVIDER_IDS, type AiProviderId } from "@/lib/ai-providers";

type Status = { lyze: boolean; own: { provider: AiProviderId; hint: string | null; model: string; baseUrl: string | null } | null };

/** Ana works without a key; owners can add their own provider and key as a second choice. The key never comes back to the browser. */
export function AiSettingsForm({ scope, status, canManage }: { scope: { workspaceId: string; slug: string }; status: Status; canManage: boolean }) {
  const t = useTranslations("aiSettings");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const own = status.own;
  const initial: AiProviderId = own?.provider ?? "gemini";
  const [provider, setProvider] = useState<AiProviderId>(initial);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(own?.model ?? AI_PROVIDERS[initial].models[0] ?? "");
  const [baseUrl, setBaseUrl] = useState(own?.baseUrl ?? AI_PROVIDERS[initial].baseUrl ?? "");
  const info = AI_PROVIDERS[provider];
  const saved = !!own && own.provider === provider;
  const keyRequired = info.needsKey === true && !saved;

  const choose = (p: AiProviderId) => {
    setProvider(p);
    // A model from another provider would never work: switch to this provider's first suggestion.
    setModel(p === own?.provider ? own.model : (AI_PROVIDERS[p].models[0] ?? ""));
    setBaseUrl(p === own?.provider && own.baseUrl ? own.baseUrl : (AI_PROVIDERS[p].baseUrl ?? ""));
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
        <SparklesIcon className="mt-0.5 size-5 shrink-0 text-section-coding" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">{status.lyze ? t("lyzeOn") : t("lyzeOff")}</p>
          <p className="text-pretty text-muted-foreground">{status.lyze ? t("lyzeOnHint") : t("lyzeOffHint")}</p>
        </div>
      </div>

      <div className="grid gap-1">
        <h2 className="text-base font-semibold">{t("ownTitle")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("ownHint")}</p>
      </div>

      <div className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-4">
        <KeyRoundIcon className="mt-0.5 size-5 shrink-0 text-section-writeup" aria-hidden />
        <div className="min-w-0 flex-1 basis-56 text-sm">
          <p className="font-medium">{own ? t("statusWorkspace", { provider: AI_PROVIDERS[own.provider].label, hint: own.hint ?? "" }) : t("statusNone")}</p>
          <p className="text-pretty text-muted-foreground">{t("statusHint")}</p>
        </div>
        {own && canManage && (
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
              <Input id="ai-key" type="password" autoComplete="off" spellCheck={false} dir="ltr" placeholder={saved ? `…${own?.hint ?? ""}` : ""} value={key} onChange={(e) => setKey(e.target.value)} />
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
            {own && (
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
