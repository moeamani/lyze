import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/common/page-header";

export default function Loading() {
  return (
    <PageContainer aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.5rem]" />
        ))}
      </div>
    </PageContainer>
  );
}
