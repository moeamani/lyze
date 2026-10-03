"use client";

import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QUESTION_CATEGORIES } from "@/lib/forms/questions";
import type { QuestionType } from "@/lib/forms/schema";
import { QuestionTypeIcon } from "./question-icon";

export function QuestionTypeMenu({
  onPick,
  trigger,
  align = "start",
}: {
  onPick: (type: QuestionType) => void;
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const tt = useTranslations("questionTypes");
  const tc = useTranslations("questionCategories");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64 max-h-[min(70dvh,32rem)]">
        {QUESTION_CATEGORIES.map((cat, i) => (
          <DropdownMenuGroup key={cat.key}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{tc(cat.key)}</DropdownMenuLabel>
            {cat.types.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => onPick(type)}>
                <QuestionTypeIcon type={type} />
                {tt(type)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AddQuestionButton({ onPick, variant = "outline", className }: { onPick: (type: QuestionType) => void; variant?: "outline" | "soft" | "ghost"; className?: string }) {
  const t = useTranslations("builder");
  return (
    <QuestionTypeMenu
      onPick={onPick}
      trigger={
        <Button variant={variant} className={className}>
          <PlusIcon />
          {t("addQuestion")}
        </Button>
      }
    />
  );
}
