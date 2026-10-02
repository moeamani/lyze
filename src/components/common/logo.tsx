import { cn } from "@/lib/utils";

export function Logo({ className, showWord = true }: { className?: string; showWord?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" aria-hidden className="size-7 shrink-0">
        <rect width="32" height="32" rx="10" fill="var(--primary)" />
        <path d="M11 9v14h10" stroke="var(--primary-foreground)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="22" cy="10.5" r="2.2" fill="var(--primary-foreground)" />
      </svg>
      {showWord && (
        <span className="text-lg">
          lyze<span className="text-primary">.</span>
        </span>
      )}
    </span>
  );
}
