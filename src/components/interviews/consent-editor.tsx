"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, PlusIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { saveConsentAction } from "@/server/actions/interviews";
import type { ConsentDoc } from "@/lib/interviews/guide";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };

/** The consent form participants sign online (or that researchers read out and record). */
export function ConsentEditor({ scope, initial, version, canEdit }: { scope: Scope; initial: Omit<ConsentDoc, "version">; version: number | null; canEdit: boolean }) {
  const t = useTranslations("consent");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = () =>
    startTransition(async () => {
      const clean = { ...draft, statements: draft.statements.map((s) => s.trim()).filter(Boolean) };
      if (feedback(await saveConsentAction(scope, clean), t("saved"))) {
        setDraft(clean);
        setSaved(clean);
      }
    });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{t("title")}</CardTitle>
            {version ? <Badge variant="soft">{t("version", { version })}</Badge> : <Badge variant="outline">{t("notSaved")}</Badge>}
          </div>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canEdit || pending} className="grid grid-cols-1 min-w-0 gap-5">
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="consent-title">{t("formTitle")}</Label>
              <Input id="consent-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="consent-body">{t("body")}</Label>
              <Textarea id="consent-body" rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <p className="text-xs text-muted-foreground">{t("bodyHint")}</p>
            </div>
            <fieldset className="grid grid-cols-1 min-w-0 gap-2">
              <legend className="mb-2 text-sm font-medium">{t("statements")}</legend>
              <p className="-mt-1 mb-1 text-xs text-muted-foreground">{t("statementsHint")}</p>
              {draft.statements.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="grid grid-cols-1 size-5 shrink-0 place-items-center rounded-md border" aria-hidden />
                  <Input
                    value={s}
                    aria-label={t("statementN", { n: i + 1 })}
                    onChange={(e) => setDraft({ ...draft, statements: draft.statements.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                  <Button variant="ghost" size="icon-sm" aria-label={t("removeStatement", { n: i + 1 })} onClick={() => setDraft({ ...draft, statements: draft.statements.filter((_, j) => j !== i) })}>
                    <XIcon />
                  </Button>
                </div>
              ))}
              {canEdit && draft.statements.length < 20 && (
                <Button variant="ghost" size="sm" className="w-fit" onClick={() => setDraft({ ...draft, statements: [...draft.statements, ""] })}>
                  <PlusIcon />
                  {t("addStatement")}
                </Button>
              )}
            </fieldset>
            {canEdit && (
              <div className="flex flex-wrap items-center justify-end gap-3">
                {version && dirty && <p className="me-auto text-xs text-muted-foreground">{t("newVersionNote")}</p>}
                <Button onClick={save} disabled={pending || (!dirty && !!version) || !draft.title.trim() || !draft.body.trim()}>
                  {pending && <Loader2Icon className="animate-spin" />}
                  {version ? t("save") : t("create")}
                </Button>
              </div>
            )}
          </fieldset>
        </CardContent>
      </Card>
      <Card className="h-fit bg-muted/40 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheckIcon className="size-4 text-success" aria-hidden />
            {t("howTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-1 list-decimal gap-2 ps-5 text-sm text-muted-foreground">
            <li>{t("how1")}</li>
            <li>{t("how2")}</li>
            <li>{t("how3")}</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
