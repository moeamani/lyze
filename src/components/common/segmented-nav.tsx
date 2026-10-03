import Link from "next/link";
import { cn } from "@/lib/utils";

/** Tab-styled navigation between URLs (real links, so it works without JS and is bookmarkable). */
export function SegmentedNav({
  items,
  label,
  className,
}: {
  items: { href: string; label: React.ReactNode; active: boolean }[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex h-10 w-fit max-w-full items-center overflow-x-auto rounded-xl bg-muted p-1", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex h-full items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,box-shadow] outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 [&_svg]:size-4",
            item.active && "bg-card text-foreground shadow-soft",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
