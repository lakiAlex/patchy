// Icons: Hugeicons stroke-rounded (MIT, https://hugeicons.com), like Lookout. The
// sidebar's open view gets the bolder stroke.
import type { SVGProps } from "react";
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

// The bandage from the app icon (src-tauri/icons/make-icon.py): a strip with rounded ends, a pad in the middle
// and breathing holes, lying on the diagonal. Colors come from the --brand-* variables in styles.css.
const BRAND_HOLES = [
  [-9, -1.6], [-9, 1.6], [-6.8, -1.6], [-6.8, 1.6],
  [6.8, -1.6], [6.8, 1.6], [9, -1.6], [9, 1.6],
];

export function BrandMark({ size = 17 }: { size?: number }) {
  const strip = (props: SVGProps<SVGRectElement>) => <rect x="1" y="8" width="22" height="8" rx="4" {...props} />;
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="brand-mark-top" gradientUnits="userSpaceOnUse" x1="0" y1="8" x2="0" y2="16">
          <stop offset="0" stopColor="var(--brand-top-1)" />
          <stop offset="1" stopColor="var(--brand-top-2)" />
        </linearGradient>
      </defs>
      <g transform="rotate(-40 12 12)">
        {strip({ fill: "var(--brand-side)", transform: "translate(0.3 0.6)" })}
        {strip({ fill: "url(#brand-mark-top)" })}
        <rect x="8" y="8.9" width="8" height="6.2" rx="1" fill="var(--brand-pad)" />
        {BRAND_HOLES.map(([x, y]) => (
          <circle key={`${x},${y}`} cx={12 + x} cy={12 + y} r="0.45" fill="var(--brand-hole)" />
        ))}
      </g>
    </svg>
  );
}
