import { cn } from "@/lib/utils";

type Props = { className?: string };

/**
 * Small, friendly spot illustrations. They use token colors only (currentColor + CSS vars),
 * so they adapt to light/dark mode automatically. Purely decorative → aria-hidden.
 */

/** Lyze's mascot: a soft blob with a little smile. */
export function Mascot({ className, mood = "happy" }: Props & { mood?: "happy" | "curious" | "sleepy" }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={cn("size-24", className)}>
      <ellipse cx="60" cy="104" rx="30" ry="5" fill="var(--muted)" />
      <path
        d="M60 18c22 0 38 15 38 38 0 25-14 42-38 42S22 81 22 56c0-23 16-38 38-38Z"
        fill="var(--accent-soft)"
        stroke="var(--primary)"
        strokeOpacity=".35"
        strokeWidth="2"
      />
      <circle cx="44" cy="62" r="5" fill="var(--chart-4)" opacity=".25" />
      <circle cx="76" cy="62" r="5" fill="var(--chart-4)" opacity=".25" />
      {mood === "sleepy" ? (
        <>
          <path d="M44 53q4 3 8 0M68 53q4 3 8 0" stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M55 66q5 3 10 0" stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="48" cy="52" r="3.5" fill="var(--foreground)" />
          <circle cx="72" cy="52" r="3.5" fill="var(--foreground)" />
          {mood === "curious" ? (
            <circle cx="60" cy="67" r="3.5" fill="none" stroke="var(--foreground)" strokeWidth="2.5" />
          ) : (
            <path d="M52 63q8 8 16 0" stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          )}
        </>
      )}
      <path d="M92 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="var(--primary)" opacity=".7" />
      <path d="M24 30l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2 1.2-3Z" fill="var(--chart-3)" />
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
