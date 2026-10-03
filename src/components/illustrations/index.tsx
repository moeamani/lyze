import { useId } from "react";
import { cn } from "@/lib/utils";

type Props = { className?: string };

/**
 * Small, friendly spot illustrations. They use token colors only (currentColor + CSS vars),
 * so they adapt to light/dark mode automatically. Purely decorative → aria-hidden.
 */

/**
 * Lyze's mascot: a small, softly lit 3D agent — a rounded head with a glass visor and an antenna.
 * Shading comes from gradients on token colors, so it reads as 3D in light and dark mode.
 */
export function Mascot({ className, mood = "happy" }: Props & { mood?: "happy" | "curious" | "sleepy" }) {
  const id = useId().replace(/:/g, "");
  const g = (name: string) => `${name}-${id}`;
  const eye = "oklch(0.86 0.12 285)";
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={cn("size-24", className)}>
      <defs>
        <radialGradient id={g("shadow")} cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: "var(--foreground)", stopOpacity: 0.18 }} />
          <stop offset="1" style={{ stopColor: "var(--foreground)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={g("shell")} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" style={{ stopColor: "color-mix(in oklab, var(--card) 70%, white)" }} />
          <stop offset="0.55" style={{ stopColor: "color-mix(in oklab, var(--accent-soft) 80%, var(--card))" }} />
          <stop offset="1" style={{ stopColor: "color-mix(in oklab, var(--primary) 30%, var(--accent-soft))" }} />
        </linearGradient>
        <linearGradient id={g("shade")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "var(--primary)", stopOpacity: 0.22 }} />
        </linearGradient>
        <linearGradient id={g("visor")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2745" />
          <stop offset="1" stopColor="#15131f" />
        </linearGradient>
        <radialGradient id={g("orb")} cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" style={{ stopColor: "color-mix(in oklab, var(--primary) 55%, white)" }} />
          <stop offset="1" style={{ stopColor: "var(--primary)" }} />
        </radialGradient>
        <filter id={g("glow")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      <ellipse cx="60" cy="106" rx="30" ry="6" fill={`url(#${g("shadow")})`} />

      <g transform={mood === "curious" ? "rotate(-7 60 64)" : undefined}>
        {/* antenna */}
        <path d="M60 31V20" style={{ stroke: "color-mix(in oklab, var(--primary) 45%, var(--muted-foreground))" }} strokeWidth="3" strokeLinecap="round" />
        <circle cx="60" cy="16" r="8" style={{ fill: "var(--primary)" }} opacity=".14" />
        <circle cx="60" cy="16" r="5" fill={`url(#${g("orb")})`} />

        {/* ears */}
        <rect x="16" y="54" width="9" height="18" rx="4.5" fill={`url(#${g("shell")})`} stroke="var(--primary)" strokeOpacity=".18" />
        <rect x="95" y="54" width="9" height="18" rx="4.5" fill={`url(#${g("shell")})`} stroke="var(--primary)" strokeOpacity=".18" />

        {/* head */}
        <rect x="22" y="30" width="76" height="66" rx="27" fill={`url(#${g("shell")})`} />
        <rect x="22" y="30" width="76" height="66" rx="27" fill={`url(#${g("shade")})`} />
        <rect x="22.75" y="30.75" width="74.5" height="64.5" rx="26.25" fill="none" stroke="var(--primary)" strokeOpacity=".2" strokeWidth="1.5" />
        <ellipse cx="42" cy="40" rx="13" ry="5" fill="white" opacity=".55" transform="rotate(-18 42 40)" />

        {/* visor */}
        <rect x="31" y="47" width="58" height="32" rx="16" fill={`url(#${g("visor")})`} />
        <path d="M38 52.5c6-3 26-3.6 41-1" stroke="white" strokeOpacity=".16" strokeWidth="2.5" strokeLinecap="round" fill="none" />

        {/* eyes */}
        <g fill="none" stroke={eye} strokeWidth="3.4" strokeLinecap="round">
          {mood === "sleepy" ? (
            <>
              <path d="M45 64h9M66 64h9" />
            </>
          ) : mood === "happy" ? (
            <>
              <path d="M45 66q4.5-6 9 0M66 66q4.5-6 9 0" filter={`url(#${g("glow")})`} opacity=".8" />
              <path d="M45 66q4.5-6 9 0M66 66q4.5-6 9 0" />
            </>
          ) : null}
        </g>
        {mood === "curious" && (
          <g fill={eye}>
            <rect x="46" y="57" width="7" height="12" rx="3.5" filter={`url(#${g("glow")})`} opacity=".8" />
            <rect x="46" y="57" width="7" height="12" rx="3.5" />
            <rect x="67" y="58.5" width="7" height="9" rx="3.5" filter={`url(#${g("glow")})`} opacity=".8" />
            <rect x="67" y="58.5" width="7" height="9" rx="3.5" />
          </g>
        )}
      </g>
    </svg>
  );
}

export function FoldersIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden className={cn("h-28 w-auto", className)}>
      <ellipse cx="80" cy="108" rx="52" ry="6" fill="var(--muted)" />
      <rect x="34" y="34" width="84" height="60" rx="12" fill="var(--card)" stroke="var(--border)" strokeWidth="2" transform="rotate(-8 76 64)" />
      <path d="M42 40h22l6 7h40a8 8 0 0 1 8 8v37a8 8 0 0 1-8 8H42a8 8 0 0 1-8-8V48a8 8 0 0 1 8-8Z" fill="var(--accent-soft)" stroke="var(--primary)" strokeOpacity=".35" strokeWidth="2" />
      <rect x="48" y="66" width="36" height="5" rx="2.5" fill="var(--primary)" opacity=".45" />
      <rect x="48" y="77" width="24" height="5" rx="2.5" fill="var(--primary)" opacity=".25" />
      <path d="M128 26l2.4 6 6 2.4-6 2.4-2.4 6-2.4-6-6-2.4 6-2.4 2.4-6Z" fill="var(--chart-3)" />
      <circle cx="30" cy="30" r="4" fill="var(--chart-2)" opacity=".7" />
    </svg>
  );
}

export function ClipboardIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden className={cn("h-28 w-auto", className)}>
      <ellipse cx="80" cy="110" rx="46" ry="6" fill="var(--muted)" />
      <rect x="50" y="18" width="60" height="84" rx="12" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <rect x="64" y="12" width="32" height="12" rx="6" fill="var(--accent-soft)" stroke="var(--primary)" strokeOpacity=".4" strokeWidth="2" />
      <circle cx="64" cy="44" r="4" fill="var(--chart-5)" />
      <rect x="74" y="41" width="24" height="5" rx="2.5" fill="var(--muted-foreground)" opacity=".35" />
      <circle cx="64" cy="60" r="4" fill="var(--chart-1)" />
      <rect x="74" y="57" width="18" height="5" rx="2.5" fill="var(--muted-foreground)" opacity=".35" />
      <circle cx="64" cy="76" r="4" fill="none" stroke="var(--border)" strokeWidth="2" />
      <rect x="74" y="73" width="22" height="5" rx="2.5" fill="var(--muted-foreground)" opacity=".2" />
      <path d="M124 40q8-4 12 4" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity=".5" />
      <path d="M30 70l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="var(--chart-3)" />
    </svg>
  );
}

export function TimelineIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden className={cn("h-28 w-auto", className)}>
      <ellipse cx="80" cy="110" rx="46" ry="6" fill="var(--muted)" />
      <path d="M52 22v76" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" />
      {[30, 56, 82].map((y, i) => (
        <g key={y}>
          <circle cx="52" cy={y} r="7" fill={["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"][i]} />
          <rect x="66" y={y - 9} width={[52, 40, 46][i]} height="18" rx="9" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        </g>
      ))}
      <path d="M128 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="var(--primary)" opacity=".6" />
    </svg>
  );
}

export function PeopleIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden className={cn("h-28 w-auto", className)}>
      <ellipse cx="80" cy="108" rx="52" ry="6" fill="var(--muted)" />
      <circle cx="58" cy="48" r="14" fill="var(--accent-soft)" stroke="var(--primary)" strokeOpacity=".35" strokeWidth="2" />
      <path d="M34 98c2-16 12-26 24-26s22 10 24 26Z" fill="var(--accent-soft)" stroke="var(--primary)" strokeOpacity=".35" strokeWidth="2" />
      <circle cx="102" cy="52" r="12" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <path d="M82 98c2-13 10-21 20-21s18 8 20 21Z" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <path d="M124 26v10M119 31h10" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChartIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden className={cn("h-28 w-auto", className)}>
      <ellipse cx="80" cy="110" rx="50" ry="6" fill="var(--muted)" />
      <rect x="36" y="20" width="88" height="80" rx="14" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <rect x="52" y="62" width="10" height="26" rx="3" fill="var(--series-1)" opacity=".85" />
      <rect x="68" y="48" width="10" height="40" rx="3" fill="var(--series-1)" opacity=".85" />
      <rect x="84" y="56" width="10" height="32" rx="3" fill="var(--series-1)" opacity=".85" />
      <rect x="100" y="36" width="10" height="52" rx="3" fill="var(--series-1)" opacity=".85" />
      <path d="M50 44q14-12 26-4t32-14" stroke="var(--series-2)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M132 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="var(--chart-3, var(--primary))" opacity=".7" />
    </svg>
  );
}
