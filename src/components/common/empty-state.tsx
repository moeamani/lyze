import { cn } from "@/lib/utils";

export function EmptyState({
  illustration,
  title,
  description,
  children,
  className,
}: {
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center animate-in fade-in-0 duration-300",
        className,
      )}
    >
      {illustration}
      <div className="max-w-sm space-y-1.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-balance text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}
