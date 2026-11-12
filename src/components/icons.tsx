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

// Hugeicons bandage, drawn like the app icon (src-tauri/icons/make-icon.py): a thick raised band with a
// side face and a fold along the diagonal. Colors come from the --brand-* variables in styles.css.
const BRAND_PATHS = [
    "M11.0251 19.7993L19.7993 11.0249C21.0551 9.7691 21.6829 9.14122 21.8901 8.40682C22.0366 7.88753 22.0366 7.33783 21.8901 6.81854C21.6829 6.08415 21.055 5.45629 19.7992 4.20057C18.5435 2.94488 17.9156 2.31704 17.1813 2.10987C16.662 1.96337 16.1123 1.96338 15.593 2.10988C14.8586 2.31707 14.2308 2.94493 12.9751 4.20063L4.20071 12.975C2.94494 14.2307 2.31705 14.8586 2.10987 15.593C1.96338 16.1123 1.96338 16.662 2.10987 17.1812C2.31705 17.9156 2.94494 18.5435 4.20071 19.7993C5.45649 21.0551 6.08438 21.683 6.81881 21.8901C7.33808 22.0366 7.88774 22.0366 8.407 21.8901C9.14143 21.6829 9.76932 21.055 11.0251 19.7993Z",
    "M13 5L19 11M5 13L11 19",
    "M14.5 11.875V12M14.25 12C14.25 12.1381 14.3619 12.25 14.5 12.25C14.6381 12.25 14.75 12.1381 14.75 12C14.75 11.8619 14.6381 11.75 14.5 11.75C14.3619 11.75 14.25 11.8619 14.25 12Z",
    "M12 9.375V9.5M11.75 9.5C11.75 9.63807 11.8619 9.75 12 9.75C12.1381 9.75 12.25 9.63807 12.25 9.5C12.25 9.36193 12.1381 9.25 12 9.25C11.8619 9.25 11.75 9.36193 11.75 9.5Z",
    "M9.5 11.875V12M9.25 12C9.25 12.1381 9.36193 12.25 9.5 12.25C9.63807 12.25 9.75 12.1381 9.75 12C9.75 11.8619 9.63807 11.75 9.5 11.75C9.36193 11.75 9.25 11.8619 9.25 12Z",
    "M12 14.375V14.5M11.75 14.5C11.75 14.6381 11.8619 14.75 12 14.75C12.1381 14.75 12.25 14.6381 12.25 14.5C12.25 14.3619 12.1381 14.25 12 14.25C11.8619 14.25 11.75 14.3619 11.75 14.5Z",
];

export function BrandMark({ size = 17 }: { size?: number }) {
  const band = { stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const glyph = (props: SVGProps<SVGGElement>) => (
    <g {...band} {...props}>
      {BRAND_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="-0.5 -0.5 25 25" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="brand-mark-top" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0" stopColor="var(--brand-top-1)" />
          <stop offset="1" stopColor="var(--brand-top-2)" />
        </linearGradient>
        <clipPath id="brand-mark-fold">
          <path d="M24.5 -0.5V24.5H-0.5z" />
        </clipPath>
      </defs>
      {glyph({ color: "var(--brand-side)", transform: "translate(0.35 0.7)" })}
      {glyph({ stroke: "url(#brand-mark-top)" })}
      {glyph({ color: "var(--brand-fold)", clipPath: "url(#brand-mark-fold)" })}
    </svg>
  );
}
