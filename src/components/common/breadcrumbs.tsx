import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

export function Breadcrumbs({ items, label }: { items: { href?: string; label: React.ReactNode }[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRightIcon className="size-3.5 shrink-0 rtl:rotate-180" aria-hidden />}
            {item.href ? (
              <Link href={item.href} className="truncate rounded-md underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
