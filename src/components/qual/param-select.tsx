"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** A select that keeps its value in the URL (?param=value), so views can be linked and reloaded. */
export function ParamSelect({ param, value, options, label, className }: { param: string; value: string; options: { value: string; label: string }[]; label: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const next = new URLSearchParams(params.toString());
        next.set(param, v);
        startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
      }}
    >
      <SelectTrigger size="sm" aria-label={label} className={cn("h-8 w-auto min-w-36 max-w-full", pending && "opacity-60", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
