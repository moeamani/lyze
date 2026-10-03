import { BookOpenTextIcon, MessagesSquareIcon, NotebookPenIcon, UsersRoundIcon, type LucideProps } from "lucide-react";
import type { SessionKind } from "@/lib/interviews/sessions";

const ICONS: Record<SessionKind, React.ComponentType<LucideProps>> = {
  interview: MessagesSquareIcon,
  focus_group: UsersRoundIcon,
  field_notes: NotebookPenIcon,
  diary: BookOpenTextIcon,
};

/** Shared by server and client components (no "use client", so it isn't a client reference). */
export function SessionKindIcon({ kind, ...props }: { kind: SessionKind } & LucideProps) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden {...props} />;
}
