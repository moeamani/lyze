import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const SECTIONS = ["forms", "interviews", "coding", "mixed", "writeup", "people", "activity"] as const;
export type Section = (typeof SECTIONS)[number];

/** Static class names per section, so Tailwind sees them. */
export const SECTION_TEXT: Record<Section, string> = {
  forms: "text-section-forms",
  interviews: "text-section-interviews",
  coding: "text-section-coding",
  mixed: "text-section-mixed",
  writeup: "text-section-writeup",
  people: "text-section-people",
  activity: "text-section-activity",
};
const TILE: Record<Section, string> = {
  forms: "bg-section-forms/12 text-section-forms",
  interviews: "bg-section-interviews/14 text-section-interviews",
  coding: "bg-section-coding/12 text-section-coding",
  mixed: "bg-section-mixed/12 text-section-mixed",
  writeup: "bg-section-writeup/12 text-section-writeup",
  people: "bg-section-people/12 text-section-people",
  activity: "bg-section-activity/12 text-section-activity",
};
export const SECTION_BAR: Record<Section, string> = {
  forms: "after:bg-section-forms",
  interviews: "after:bg-section-interviews",
  coding: "after:bg-section-coding",
  mixed: "after:bg-section-mixed",
  writeup: "after:bg-section-writeup",
  people: "after:bg-section-people",
  activity: "after:bg-section-activity",
};

/** A tinted icon tile, like a Notion page icon, that tells you which part of the app you're in. */
export function SectionIcon({ section, icon: Icon, size = "md", className }: { section: Section; icon: LucideIcon; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "sm" && "size-6 rounded-md [&>svg]:size-3.5",
        size === "md" && "size-8 rounded-lg [&>svg]:size-4",
        size === "lg" && "size-11 rounded-xl [&>svg]:size-5.5",
        TILE[section],
        className,
      )}
    >
      <Icon />
    </span>
  );
}

/** Page intro for a section: icon tile, title, one line of help. */
export function SectionIntro({ section, icon, title, description, actions }: { section: Section; icon: LucideIcon; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <SectionIcon section={section} icon={icon} size="lg" />
      <div className="min-w-[min(100%,14rem)] flex-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
