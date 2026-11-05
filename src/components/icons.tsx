// Icons: Hugeicons stroke-rounded (MIT, https://hugeicons.com), like Lookout. The
// sidebar's open view gets the bolder stroke.
import {
  Alert02Icon,
  ArrowDown01Icon,
  BandageIcon,
  Cancel01Icon,
  Calendar03Icon,
  CatIcon,
  CheckmarkCircle02Icon,
  ArrowRight01Icon,
  CodeIcon,
  Edit02Icon,
  FireIcon,
  InboxIcon,
  LinkSquare02Icon,
  NotificationSquareIcon,
  PhpIcon,
  Radar01Icon,
  RefreshIcon,
  Search01Icon,
  SecurityWarningIcon,
  ServerStack01Icon,
  Settings01Icon,
  SidebarLeftIcon,
  Tick02Icon,
  WordpressIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const ICONS = {
  logo: BandageIcon,
  feed: Radar01Icon,
  unfixed: SecurityWarningIcon,
  exploited: FireIcon,
  versions: Calendar03Icon,
  edit: Edit02Icon,
  sidebar: SidebarLeftIcon,
  refresh: RefreshIcon,
  search: Search01Icon,
  close: Cancel01Icon,
  link: LinkSquare02Icon,
  inbox: InboxIcon,
  ok: CheckmarkCircle02Icon,
  alert: Alert02Icon,
  chevron: ArrowDown01Icon,
  chevronRight: ArrowRight01Icon,
  bell: NotificationSquareIcon,
  settings: Settings01Icon,
  cat: CatIcon,
  tick: Tick02Icon,
  wordpress: WordpressIcon,
  php: PhpIcon,
  javascript: CodeIcon,
  server: ServerStack01Icon,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, bold = false }: { name: IconName; size?: number; bold?: boolean }) {
  return <HugeiconsIcon icon={ICONS[name]} size={size} strokeWidth={bold ? 2 : 1.6} />;
}
