import {
  AlignLeftIcon,
  ArrowDownUpIcon,
  CalendarIcon,
  ChevronDownSquareIcon,
  CircleDotIcon,
  Grid3x3Icon,
  HashIcon,
  MicIcon,
  PaperclipIcon,
  SlidersHorizontalIcon,
  SquareCheckIcon,
  StarIcon,
  TextCursorInputIcon,
  ThumbsUpIcon,
  GaugeIcon,
  RowsIcon,
  type LucideProps,
} from "lucide-react";
import type { QuestionType } from "@/lib/forms/schema";

const ICONS: Record<QuestionType, React.ComponentType<LucideProps>> = {
  short_text: TextCursorInputIcon,
  long_text: AlignLeftIcon,
  single_choice: CircleDotIcon,
  multiple_choice: SquareCheckIcon,
  dropdown: ChevronDownSquareIcon,
  rating: StarIcon,
  likert: RowsIcon,
  nps: GaugeIcon,
  slider: SlidersHorizontalIcon,
  number: HashIcon,
  date: CalendarIcon,
  ranking: ArrowDownUpIcon,
  matrix: Grid3x3Icon,
  yes_no: ThumbsUpIcon,
  file_upload: PaperclipIcon,
  media: MicIcon,
};

export function QuestionTypeIcon({ type, ...props }: { type: QuestionType } & LucideProps) {
  const Icon = ICONS[type];
  return <Icon aria-hidden {...props} />;
}
