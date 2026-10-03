"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Cloudflare Turnstile widget, loaded only on the last page of forms that ask for it. */
export function Captcha({ siteKey, onToken }: { siteKey: string; onToken: (token: string | undefined) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | undefined;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widget = window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken, "expired-callback": () => onToken(undefined) });
    };
    if (window.turnstile) mount();
    else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", mount);
    }
    return () => {
      cancelled = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, onToken]);
  return <div ref={ref} className="mt-8" />;
}
