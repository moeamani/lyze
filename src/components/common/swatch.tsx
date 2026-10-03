import { cn } from "@/lib/utils";
import type { ProjectColor } from "@/lib/studies";

const SWATCH: Record<ProjectColor, string> = {
  violet: "bg-swatch-violet",
  sky: "bg-swatch-sky",
  emerald: "bg-swatch-emerald",
  amber: "bg-swatch-amber",
  rose: "bg-swatch-rose",
  slate: "bg-swatch-slate",
};

export function swatchClass(color: string): string {
  return SWATCH[color as ProjectColor] ?? SWATCH.violet;
}

export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", swatchClass(color), className)} />;
}
