// App settings, kept in localStorage like Lookout's.

export type NoticeLevel = "exploited" | "high" | "medium" | "all";
export type Range = "7" | "30" | "90" | "365" | "all";

export interface Settings {
  /** Minutes between automatic refreshes. 0 turns them off. */
  refreshMinutes: number;
  /** Which new items go to the bell and to Mac notifications. */
  noticeLevel: NoticeLevel;
  /** Only items published within this many days become notices, so adding a plugin does not flood the bell with its history. */
  noticeMaxAgeDays: number;
  macNotifications: boolean;
  /** Ubuntu notices for watched packages; off hides the USN rows. */
  showUbuntu: boolean;
  /** CISA KEV rows for the stack that no other feed listed. */
  showKevExtra: boolean;
  /** Node.js security releases. */
  showNodeReleases: boolean;
  /** Pages of 20 Ubuntu notices fetched per release. */
  ubuntuPages: number;
  defaultRange: Range;
  uiFont: "system" | "geist";
  memes: boolean;
  /** Sends an anonymous event to Aptabase when the app starts. */
  usageStats: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  refreshMinutes: 10,
  noticeLevel: "high",
  noticeMaxAgeDays: 30,
  macNotifications: true,
  showUbuntu: true,
  showKevExtra: true,
  showNodeReleases: true,
  ubuntuPages: 5,
  defaultRange: "30",
  uiFont: "system",
  memes: true,
  usageStats: true,
};

const KEY = "patchy.settings";

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export const uiFontCss = (font: Settings["uiFont"]) =>
  font === "geist" ? '"Geist Variable", -apple-system, sans-serif' : '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif';
