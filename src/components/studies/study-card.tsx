import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StudyTypeIcon } from "@/components/common/study-type-icon";
import { RelativeTime } from "@/components/common/relative-time";
import { Swatch } from "@/components/common/swatch";
import type { StudyStatus, StudyType } from "@/lib/studies";

export function StudyStatusBadge({ status }: { status: StudyStatus }) {
  const t = useTranslations("studyStatus");
  const variant = status === "live" ? "success" : status === "closed" ? "secondary" : "outline";
  return (
    <Badge variant={variant}>
      {status === "live" && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {t(status)}
    </Badge>
  );
}

export function StudyCard({
  href,
  study,
  project,
  responses,
}: {
  href: string;
  responses?: number;
  study: { id: string; name: string; type: StudyType; status: StudyStatus; updatedAt: Date };
  project?: { name: string; color: string };
}) {
  const tt = useTranslations("studyTypes");
  const ts = useTranslations("studies");
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft transition-[box-shadow,transform,border-color] outline-none hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-[3px] focus-visible:ring-ring/40 motion-reduce:hover:translate-y-0"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-soft-foreground">
        <StudyTypeIcon type={study.type} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{study.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {project && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Swatch color={project.color} className="size-2" />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          <span>{tt(`${study.type}.name`)}</span>
          {responses !== undefined && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{ts("responseCount", { count: responses })}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <RelativeTime date={study.updatedAt} />
        </span>
      </span>
      <StudyStatusBadge status={study.status} />
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
    </Link>
  );
}
