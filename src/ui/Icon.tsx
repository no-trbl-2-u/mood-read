// Mood Read's icons: Lucide, through lucide-react-native v1.x (design/system/DECISION.md, Iconography; ISC, its
// Feather-derived icons MIT; the notices are on /licenses). No brand icons. Every icon is drawn at a theme size
// with the sticker stroke, coloured from the palette, and is decorative: the control around it carries the label.
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  EllipsisVertical,
  ExternalLink,
  HardDrive,
  Hourglass,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  Wifi,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react-native";

import { colors, icons } from "./theme";

const SET = {
  back: ChevronLeft,
  bookmark: Bookmark,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  download: Download,
  "external-link": ExternalLink,
  "hard-drive": HardDrive,
  hourglass: Hourglass,
  lock: Lock,
  more: EllipsisVertical,
  pause: Pause,
  play: Play,
  plus: Plus,
  "skip-back": RotateCcw,
  "skip-forward": RotateCw,
  settings: Settings,
  wifi: Wifi,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  "triangle-alert": TriangleAlert,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof SET;

export function Icon(props: {
  name: IconName;
  /** `small` inline in text or beside a label, `mark` inside a cover's badge; the full size otherwise. */
  size?: "regular" | "small" | "mark";
  color?: string;
  /** A solid glyph (play and pause on the play button, the playing marks), as the boards draw them. */
  filled?: boolean;
  testID?: string;
}) {
  const Glyph = SET[props.name];
  const color = props.color ?? colors.text;
  const size = props.size === "small" ? icons.small : props.size === "mark" ? icons.mark : icons.size;
  return (
    <Glyph
      testID={props.testID}
      size={size}
      color={color}
      strokeWidth={icons.strokeWidth}
      fill={props.filled ? color : undefined}
      aria-hidden
    />
  );
}
