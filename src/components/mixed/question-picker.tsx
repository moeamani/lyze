"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

type Q = { studyId: string; studyName: string; questionId: string; title: string };

/** Pick the closed survey question to cross with the codes; kept in the URL. */
export function QuestionPicker({ questions, value, label }: { questions: Q[]; value: string | null; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const studies = [...new Set(questions.map((q) => q.studyName))];
  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => {
        const next = new URLSearchParams(params.toString());
        next.set("q", v);
        router.push(`${pathname}?${next}`, { scroll: false });
      }}
    >
      <SelectTrigger className="w-full sm:w-96" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {studies.map((s) => (
          <SelectGroup key={s}>
            <SelectLabel>{s}</SelectLabel>
            {questions
              .filter((q) => q.studyName === s)
              .map((q) => (
                <SelectItem key={`${q.studyId}:${q.questionId}`} value={`${q.studyId}:${q.questionId}`}>
                  {q.title}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
