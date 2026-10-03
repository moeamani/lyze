"use client";

import { useState } from "react";
import { Mascot } from "@/components/illustrations";

type Labels = {
  name: string;
  nameHint: string;
  sign: string;
  signing: string;
  doneTitle: string;
  doneBody: string;
  tickAll: string;
  nameRequired: string;
  changed: string;
  failed: string;
  statements: string;
};

/** Participant-facing, so it uses native controls only (small bundle, works everywhere). */
export function ConsentForm({ token, version, statements, defaultName, labels }: { token: string; version: number; statements: string[]; defaultName: string; labels: Labels }) {
  const [agreed, setAgreed] = useState<boolean[]>(() => statements.map(() => false));
  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return (
      <div className="grid grid-cols-1 justify-items-center gap-3 rounded-2xl border bg-card p-6 text-center shadow-soft" role="status">
        <Mascot />
        <p className="text-lg font-semibold">{labels.doneTitle}</p>
        <p className="text-sm text-muted-foreground">{labels.doneBody}</p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (agreed.some((a) => !a)) return setError(labels.tickAll);
    if (name.trim().length < 2) return setError(labels.nameRequired);
    setError(null);
    setState("sending");
    const res = await fetch(`/api/consent/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, version, agreed: agreed.map((_, i) => i) }),
    }).catch(() => null);
    if (res?.ok) return setState("done");
    setState("idle");
    setError(res?.status === 409 ? labels.changed : labels.failed);
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-5 rounded-2xl border bg-card p-4 shadow-soft sm:p-6" noValidate>
      <fieldset className="grid grid-cols-1 gap-2">
        <legend className="sr-only">{labels.statements}</legend>
        {statements.map((s, i) => (
          <label key={i} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-accent/50">
            <input
              type="checkbox"
              checked={agreed[i]}
              onChange={(e) => setAgreed((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="text-sm">{s}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-1 gap-2">
        <label htmlFor="consent-name" className="text-sm font-medium">
          {labels.name}
        </label>
        <input
          id="consent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="h-11 rounded-xl border border-input bg-card px-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
          aria-describedby="consent-name-hint"
        />
        <p id="consent-name-hint" className="text-xs text-muted-foreground">
          {labels.nameHint}
        </p>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="h-12 rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-soft transition-[background-color,transform] outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.99] disabled:opacity-60"
      >
        {state === "sending" ? labels.signing : labels.sign}
      </button>
    </form>
  );
}
