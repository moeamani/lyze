import "server-only";

/** Cloudflare Turnstile. Captcha is only offered when both keys are configured. */
export function captchaSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY : null;
}

export async function verifyCaptcha(token: string | undefined, ipKey?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ipKey) body.set("idempotency_key", ipKey.slice(0, 36));
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}
