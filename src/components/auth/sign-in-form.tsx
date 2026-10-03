"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, Loader2Icon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInWithEmail, signInWithGoogle, signInWithPassword, signUpWithPasswordAction, type PasswordState, type SignInState } from "@/server/actions/auth";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {label}
      {!pending && <ArrowRightIcon className="rtl:rotate-180" />}
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1.1 2.5-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.4-.4-2s.1-1.4.4-2V7.1H2A11 11 0 0 0 1 12c0 1.8.4 3.4 1.2 4.9L5.7 14Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10C6.6 7.4 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

function PasswordForm({ mode, callbackUrl }: { mode: "signIn" | "signUp"; callbackUrl: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<PasswordState, FormData>(mode === "signIn" ? signInWithPassword : signUpWithPasswordAction, { status: "idle" });
  const error = state.status === "error" ? t(`passwordErrors.${state.error ?? "unknown"}`) : null;
  const id = (f: string) => `${mode}-${f}`;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {mode === "signUp" && (
        <div className="grid gap-2">
          <Label htmlFor={id("name")}>
            {t("nameLabel")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
          </Label>
          <Input id={id("name")} name="name" autoComplete="name" defaultValue={state.name} maxLength={80} />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor={id("username")}>{t("usernameLabel")}</Label>
        <Input
          id={id("username")}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          required
          minLength={3}
          maxLength={32}
          defaultValue={state.username}
          aria-invalid={!!error}
          aria-describedby={mode === "signUp" ? id("username-hint") : undefined}
        />
        {mode === "signUp" && (
          <p id={id("username-hint")} className="text-xs text-muted-foreground">
            {t("usernameHint")}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("password")}>{t("passwordLabel")}</Label>
        <Input
          id={id("password")}
          name="password"
          type="password"
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          dir="ltr"
          required
          minLength={mode === "signUp" ? 8 : 1}
          aria-invalid={!!error}
          aria-describedby={error ? id("error") : undefined}
        />
        {mode === "signUp" && <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>}
      </div>
      {error && (
        <p id={id("error")} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <SubmitButton label={mode === "signIn" ? t("signIn") : t("createAccount")} />
    </form>
  );
}

function EmailForm({ callbackUrl, authError }: { callbackUrl: string; authError?: boolean }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<SignInState, FormData>(signInWithEmail, { status: "idle" });
  const error = state.status === "error" ? t(state.error === "email" ? "invalidEmail" : "genericError") : authError ? t("genericError") : null;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="grid gap-2">
        <Label htmlFor="email">{t("emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("emailPlaceholder")}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "email-error" : undefined}
        />
        {error && (
          <p id="email-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <SubmitButton label={t("sendLink")} />
    </form>
  );
}

export function SignInForm({
  callbackUrl,
  googleEnabled,
  emailEnabled,
  authError,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  emailEnabled: boolean;
  authError?: boolean;
}) {
  const t = useTranslations("auth");
  return (
    <div className="grid gap-5">
      <Tabs defaultValue="signIn" className="gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="signIn">{t("signIn")}</TabsTrigger>
          <TabsTrigger value="signUp">{t("createAccount")}</TabsTrigger>
        </TabsList>
        <TabsContent value="signIn">
          <PasswordForm mode="signIn" callbackUrl={callbackUrl} />
        </TabsContent>
        <TabsContent value="signUp">
          <PasswordForm mode="signUp" callbackUrl={callbackUrl} />
        </TabsContent>
      </Tabs>
      {authError && !emailEnabled && (
        <p role="alert" className="text-sm text-destructive">
          {t("genericError")}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2">
        {emailEnabled ? (
          <EmailForm callbackUrl={callbackUrl} authError={authError} />
        ) : (
          <Button type="button" variant="outline" size="lg" className="w-full" disabled aria-describedby="email-soon">
            <MailIcon />
            {t("emailOption")}
            <span id="email-soon" className="ms-1 rounded bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
              {t("comingSoon")}
            </span>
          </Button>
        )}
        {googleEnabled && (
          <form action={signInWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <Button type="submit" variant="outline" size="lg" className="w-full">
              <GoogleIcon />
              {t("google")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
