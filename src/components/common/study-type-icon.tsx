import { ClipboardListIcon, EyeIcon, LayersIcon, MessagesSquareIcon, NotebookPenIcon, type LucideProps } from "lucide-react";
import type { StudyType } from "@/lib/studies";

const ICONS: Record<StudyType, React.ComponentType<LucideProps>> = {
  survey: ClipboardListIcon,
  interview: MessagesSquareIcon,
  mixed: LayersIcon,
  observation: EyeIcon,
  diary: NotebookPenIcon,
};

export function StudyTypeIcon({ type, ...props }: { type: StudyType } & LucideProps) {
  const Icon = ICONS[type];
  return <Icon aria-hidden {...props} />;
}
