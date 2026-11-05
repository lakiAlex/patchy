import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { Moon, Sun } from "lucide-react";
import { clearCache, loadSnapshot, type Progress, type Severity, type Snapshot, type Vuln } from "./lib/feeds";
import { loadSettings, saveSettings, uiFontCss, type NoticeLevel, type Range, type Settings } from "./lib/settings";
import type { Theme } from "./lib/theme";
import { GROUP_LABELS, loadStack, saveStack, type Group, type Stack } from "./lib/watch";
import { Icon, type IconName } from "./components/icons";
import { MemeButton } from "./components/Meme";
import { loadNotices, NoticeBell, saveNotices, toNotice, type Notice } from "./components/Notices";
import { SettingsDialog } from "./components/SettingsDialog";
import { StackDialog } from "./components/StackDialog";
import { Stats, type Tile } from "./components/Stats";
import { VersionsView } from "./components/VersionsView";
import { VulnList } from "./components/VulnList";

type View = "feed" | "unfixed" | "exploited" | "versions";
type MinSeverity = "all" | "medium" | "high" | "critical";
type Selection = { kind: "group"; group: Group } | { kind: "product"; id: string; label: string } | null;

const THEME_KEY = "patchy.theme";
const PANEL_KEY = "patchy.panel";
const SEEN_KEY = "patchy.seen";
const COLLAPSED_KEY = "patchy.stack.collapsed";

const VIEWS: Record<View, { title: string; tip: string; icon: IconName; empty: string }> = {
  feed: { title: "Latest", tip: "Latest", icon: "feed", empty: "Nothing new in this period." },
  unfixed: { title: "No fix yet", tip: "No fix yet", icon: "unfixed", empty: "Every known issue in your stack has a fixed version." },
  exploited: { title: "Exploited in the wild", tip: "Exploited (CISA KEV)", icon: "exploited", empty: "No known exploited vulnerabilities in this period." },
  versions: { title: "Versions and support", tip: "Versions", icon: "versions", empty: "" },
};

const RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
const GROUPS: Group[] = ["wordpress", "php", "javascript", "server"];
const SPARK_DAYS = 14;

function cutoff(days: Range | number): string {
  if (days === "all") return "";
  const d = new Date();
  d.setDate(d.getDate() - Number(days));
  return d.toISOString().slice(0, 10);
}

function ago(unix: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unix));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Counts per day over the last SPARK_DAYS days, oldest first. */
function series(list: Vuln[]): number[] {
  const days: string[] = [];
  for (let i = SPARK_DAYS - 1; i >= 0; i--) days.push(cutoff(i));
  const counts = new Map(days.map((d) => [d, 0]));
  for (const v of list) if (counts.has(v.published)) counts.set(v.published, counts.get(v.published)! + 1);
  return days.map((d) => counts.get(d)!);
}

/** Keys seen in earlier refreshes, to mark and announce new items. */
function takeNewKeys(vulns: Vuln[]): Set<string> {
  let seen: Set<string> | null = null;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) seen = new Set(JSON.parse(raw) as string[]);
  } catch {
    seen = null;
  }
  const keys = vulns.map((v) => v.key);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(keys));
  } catch {
    // Storage full: everything counts as seen next time.
  }
  if (!seen) return new Set();
  return new Set(keys.filter((k) => !seen.has(k)));
}

function loud(v: Vuln, level: NoticeLevel): boolean {
  if (v.exploited) return true;
  if (level === "exploited") return false;
  if (level === "all") return true;
  return RANK[v.severity] >= (level === "high" ? 3 : 2);
}

async function macNotify(items: Vuln[]) {
  if (items.length === 0) return;
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (!granted) return;
  const top = items.slice(0, 3);
  for (const v of top) {
    sendNotification({ title: `${v.exploited ? "Exploited: " : ""}${v.product}`, body: `${v.id} ${v.title}` });
  }
  if (items.length > top.length) sendNotification({ title: "Patchy", body: `${items.length - top.length} more new items` });
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  const [themeSwitched, setThemeSwitched] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [stack, setStack] = useState<Stack>(loadStack);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<Notice[]>(loadNotices);
  const [view, setView] = useState<View>("feed");
  const [ranges, setRanges] = useState<Record<View, Range>>(() => ({ feed: settings.defaultRange, unfixed: "all", exploited: "365", versions: "all" }));
  const [minSeverity, setMinSeverity] = useState<MinSeverity>("all");
  const [query, setQuery] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [panel, setPanel] = useState(() => localStorage.getItem(PANEL_KEY) !== "0");
  const [collapsed, setCollapsed] = useState<Set<Group>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as Group[]);
    } catch {
      return new Set();
    }
  });
  const [dialog, setDialog] = useState<"stack" | "settings" | null>(null);
  const [, setTick] = useState(0);
  const loading = useRef(false);
  const latest = useRef({ stack, settings });
  latest.current = { stack, settings };

  // ---- Theme and settings ----

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    void getCurrentWindow().setTheme(theme).catch(() => undefined);
  }, [theme]);

  useEffect(() => document.documentElement.style.setProperty("--font", uiFontCss(settings.uiFont)), [settings.uiFont]);

  const changeSettings = (next: Settings) => {
    saveSettings(next);
    setSettings(next);
  };

  useEffect(() => saveNotices(notices), [notices]);

  // ---- Loading ----

  const refresh = useCallback(async (force: boolean) => {
    if (loading.current) return;
    loading.current = true;
    setProgress({ done: 0, total: 1 });
    try {
      const { stack, settings } = latest.current;
      const maxAge = settings.refreshMinutes > 0 ? settings.refreshMinutes * 60 - 30 : 3600;
      const snap = await loadSnapshot(stack, { force, maxAge, ubuntuPages: settings.ubuntuPages }, setProgress);
      const fresh = takeNewKeys(snap.vulns);
      setNewKeys((old) => new Set([...old, ...fresh]));
      setSnapshot(snap);
      const recent = cutoff(settings.noticeMaxAgeDays);
      const hidden = (v: Vuln) =>
        (!settings.showUbuntu && v.source === "Ubuntu") || (!settings.showNodeReleases && v.source === "nodejs.org") || (!settings.showKevExtra && v.source === "CISA KEV");
      const news = snap.vulns.filter((v) => fresh.has(v.key) && v.published >= recent && !hidden(v) && loud(v, settings.noticeLevel));
      if (news.length) {
        setNotices((old) => {
          const known = new Set(old.map((n) => n.key));
          return [...news.filter((v) => !known.has(v.key)).map(toNotice), ...old].slice(0, 100);
        });
        if (settings.macNotifications) void macNotify(news).catch(() => undefined);
      }
    } finally {
      loading.current = false;
      setProgress(null);
    }
  }, []);

  useEffect(() => void refresh(false), [refresh]);

  useEffect(() => {
    if (settings.refreshMinutes <= 0) return;
    const timer = setInterval(() => void refresh(false), settings.refreshMinutes * 60_000);
    return () => clearInterval(timer);
  }, [refresh, settings.refreshMinutes]);

  // Keeps "updated x min ago" current.
  useEffect(() => {
    const clock = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(clock);
  }, []);

  // ---- Filtering ----

  const vulns = useMemo(
    () =>
      (snapshot?.vulns ?? []).filter(
        (v) =>
          !(!settings.showUbuntu && v.source === "Ubuntu") &&
          !(!settings.showNodeReleases && v.source === "nodejs.org") &&
          !(!settings.showKevExtra && v.source === "CISA KEV"),
      ),
    [snapshot, settings.showUbuntu, settings.showNodeReleases, settings.showKevExtra],
  );
  const range = ranges[view];
  const since = cutoff(range);
  const q = query.trim().toLowerCase();

  /** Everything the view shows before the side panel's selection. */
  const inView = useMemo(
    () =>
      vulns.filter((v) => {
        if (view === "unfixed" && v.status !== "unfixed") return false;
        if (view === "exploited" && !v.exploited) return false;
        if (since && v.published && v.published < since) return false;
        if (since && !v.published && view !== "unfixed") return false;
        if (minSeverity !== "all" && !v.exploited && RANK[v.severity] < RANK[minSeverity]) return false;
        if (q && !`${v.id} ${v.title} ${v.product} ${v.cves.join(" ")} ${v.description}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    [vulns, view, since, minSeverity, q],
  );

  const inSelection = useCallback(
    (v: Vuln) => (!selection ? true : selection.kind === "group" ? v.group === selection.group : v.productId === selection.id),
    [selection],
  );

  const shown = useMemo(() => inView.filter(inSelection), [inView, inSelection]);

  const counts = useMemo(() => {
    const byProduct = new Map<string, { total: number; unfixed: number }>();
    const byGroup = new Map<Group, { total: number; unfixed: number }>();
    for (const v of inView) {
      for (const [map, key] of [
        [byProduct, v.productId],
        [byGroup, v.group],
      ] as [Map<string, { total: number; unfixed: number }>, string][]) {
        const c = map.get(key) ?? { total: 0, unfixed: 0 };
        c.total++;
        if (v.status === "unfixed") c.unfixed++;
        map.set(key, c);
      }
    }
    return { byProduct, byGroup };
  }, [inView]);

  const goto = (next: View, opts?: { range?: Range; severity?: MinSeverity }) => {
    setView(next);
    if (opts?.range) setRanges((r) => ({ ...r, [next]: opts.range! }));
    if (opts?.severity) setMinSeverity(opts.severity);
  };

  const tiles: Tile[] = useMemo(() => {
    const scoped = vulns.filter(inSelection);
    const unfixed = scoped.filter((v) => v.status === "unfixed" && RANK[v.severity] >= 2);
    const exploited = scoped.filter((v) => v.exploited && v.published >= cutoff(365));
    const severe = scoped.filter((v) => RANK[v.severity] >= 3 && v.published >= cutoff(30));
    const week = scoped.filter((v) => v.published >= cutoff(7));
    return [
      {
        key: "unfixed",
        label: "No fix yet",
        hint: "medium and up",
        value: unfixed.length,
        tone: "var(--sev-critical)",
        icon: "unfixed",
        series: series(unfixed),
        active: view === "unfixed",
        onClick: () => goto("unfixed", { severity: "medium" }),
      },
      {
        key: "exploited",
        label: "Exploited",
        hint: "last 12 months",
        value: exploited.length,
        tone: "var(--sev-high)",
        icon: "exploited",
        series: series(exploited),
        active: view === "exploited",
        onClick: () => goto("exploited", { range: "365" }),
      },
      {
        key: "severe",
        label: "Critical and high",
        hint: "last 30 days",
        value: severe.length,
        tone: "var(--sev-medium)",
        icon: "alert",
        series: series(severe),
        active: view === "feed" && minSeverity === "high" && range === "30",
        onClick: () => goto("feed", { range: "30", severity: "high" }),
      },
      {
        key: "week",
        label: "Everything",
        hint: "last 7 days",
        value: week.length,
        tone: "var(--sev-low)",
        icon: "feed",
        series: series(week),
        active: view === "feed" && minSeverity === "all" && range === "7",
        onClick: () => goto("feed", { range: "7", severity: "all" }),
      },
    ];
    // goto only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vulns, inSelection, view, minSeverity, range]);

  const unfixedBadge = tiles[0].value;

  const togglePanel = () => {
    setPanel((p) => {
      localStorage.setItem(PANEL_KEY, p ? "0" : "1");
      return !p;
    });
  };

  const toggleGroup = (group: Group) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });

  const openNotice = (n: Notice) => {
    setView("feed");
    setRanges((r) => ({ ...r, feed: "all" }));
    setMinSeverity("all");
    setSelection(null);
    setQuery(n.id);
    setFocusKey(n.key);
  };

  // ---- Render ----

  const activity = (v: View) => (
    <button
      type="button"
      className={`activity-button${view === v && (panel || v === "versions") ? " active" : ""}`}
      data-tip={VIEWS[v].tip}
      aria-label={VIEWS[v].tip}
      onClick={() => {
        // As in Lookout: the open view's icon closes the panel, any icon opens it again.
        if (view === v) togglePanel();
        else {
          setView(v);
          if (!panel) togglePanel();
        }
      }}
    >
      <Icon name={VIEWS[v].icon} size={20} bold={view === v && (panel || v === "versions")} />
      {v === "unfixed" && unfixedBadge > 0 && <span className="activity-badge">{unfixedBadge > 99 ? "99+" : unfixedBadge}</span>}
    </button>
  );

  const productsByGroup = (group: Group) => (snapshot?.products ?? []).filter((p) => p.group === group);

  return (
    <div className="app" style={{ ["--side-w" as string]: panel && view !== "versions" ? "240px" : "0px" }}>
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-left" data-tauri-drag-region>
          <span className="brand" data-tauri-drag-region>
            <Icon name="logo" size={17} bold />
            <span className="brand-name" data-tauri-drag-region>
              Patchy
            </span>
          </span>
        </div>
        <div className="titlebar-spacer" data-tauri-drag-region />
        <div className="titlebar-actions">
          <span className="titlebar-status">
            {progress
              ? `Checking ${progress.done} of ${progress.total} feeds`
              : snapshot
                ? `Updated ${ago(snapshot.fetchedAt)}${settings.refreshMinutes > 0 ? `, every ${settings.refreshMinutes} min` : ""}`
                : ""}
          </span>
          <button type="button" className="refresh-button" title="Refresh now" aria-label="Refresh now" disabled={Boolean(progress)} onClick={() => void refresh(true)}>
            <span className={progress ? "spin" : undefined} style={{ display: "grid" }}>
              <Icon name="refresh" size={15} />
            </span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            className={`theme-switch ${theme}${themeSwitched ? " switched" : ""}`}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => {
              setThemeSwitched(true);
              setTheme((t) => (t === "dark" ? "light" : "dark"));
            }}
          >
            <span className="theme-thumb" />
            <span className="theme-option sun">
              <Sun size={15} strokeWidth={1.9} />
            </span>
            <span className="theme-option moon">
              <Moon size={12.5} strokeWidth={1.9} />
            </span>
          </button>
          <NoticeBell
            notices={notices}
            onOpenNotice={openNotice}
            onMarkRead={() => setNotices((l) => (l.some((n) => !n.read) ? l.map((n) => ({ ...n, read: true })) : l))}
            onClear={() => setNotices([])}
          />
        </div>
      </header>

      <nav className="activity-bar">
        <div className="activity-group">
          {activity("feed")}
          {activity("unfixed")}
          {activity("exploited")}
        </div>
        <div className="activity-group">{activity("versions")}</div>
        <span className="activity-spacer" />
        <div className="activity-group">
          <button type="button" className="activity-button" data-tip="Edit stack" aria-label="Edit stack" onClick={() => setDialog("stack")}>
            <Icon name="edit" size={20} />
          </button>
          <button
            type="button"
            className={`activity-button${dialog === "settings" ? " active" : ""}`}
            data-tip="Settings"
            aria-label="Settings"
            onClick={() => setDialog("settings")}
          >
            <Icon name="settings" size={20} />
          </button>
        </div>
      </nav>

      <aside className="side-panel">
        {panel && view !== "versions" && (
          <div className="side-panel-body">
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Stack</span>
              </div>
              <div className="stack-list">
                <button type="button" className={`stack-row${selection === null ? " active" : ""}`} onClick={() => setSelection(null)}>
                  <span className="name">Everything</span>
                  <span className="stack-count">{inView.length}</span>
                </button>
                {GROUPS.map((group) => {
                  const products = productsByGroup(group)
                    // Every watched product stays listed; ones with nothing in this view show a dimmed 0.
                    .map((p) => ({ p, c: counts.byProduct.get(p.id) ?? { total: 0, unfixed: 0 } }))
                    .sort((a, b) => b.c.unfixed - a.c.unfixed || b.c.total - a.c.total || a.p.label.localeCompare(b.p.label));
                  const groupCount = counts.byGroup.get(group);
                  const isCollapsed = collapsed.has(group);
                  return (
                    <div key={group} className={`stack-group${isCollapsed ? " collapsed" : ""}`}>
                      <div className="stack-group-head">
                        <button type="button" className="stack-group-toggle" aria-expanded={!isCollapsed} title={isCollapsed ? "Expand" : "Collapse"} onClick={() => toggleGroup(group)}>
                          <Icon name="chevron" size={13} />
                        </button>
                        <button
                          type="button"
                          className={`stack-group-title${selection?.kind === "group" && selection.group === group ? " active" : ""}`}
                          title={`Show all ${GROUP_LABELS[group]}`}
                          onClick={() => setSelection({ kind: "group", group })}
                        >
                          <span className="stack-group-icon">
                            <Icon name={group} size={14} />
                          </span>
                          <span className="name">{GROUP_LABELS[group]}</span>
                          {groupCount && groupCount.unfixed > 0 && view !== "unfixed" ? (
                            <span className="stack-count hot" title={`${groupCount.unfixed} without a fix`}>
                              {groupCount.unfixed}
                            </span>
                          ) : (
                            <span className="stack-count">{groupCount?.total ?? 0}</span>
                          )}
                        </button>
                      </div>
                      {!isCollapsed &&
                        products.map(({ p, c }) => (
                          <button
                            key={p.id}
                            type="button"
                            className={`stack-row child${selection?.kind === "product" && selection.id === p.id ? " active" : ""}${c.total === 0 ? " empty" : ""}`}
                            title={p.label}
                            onClick={() => setSelection({ kind: "product", id: p.id, label: p.label })}
                          >
                            <span className="name">{p.label}</span>
                            {c.unfixed > 0 && view !== "unfixed" ? (
                              <span className="stack-count hot" title={`${c.unfixed} without a fix`}>
                                {c.unfixed}
                              </span>
                            ) : (
                              <span className="stack-count">{c.total}</span>
                            )}
                          </button>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="content">
        <div className="progress">{progress && <span style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />}</div>
        <div className="view-header">
          <h1>{VIEWS[view].title}</h1>
          {view !== "versions" && <span className="count">{shown.length}</span>}
          {selection && view !== "versions" && (
            <span className="filter-chip">
              {selection.kind === "group" ? GROUP_LABELS[selection.group] : selection.label}
              <button type="button" aria-label="Clear filter" onClick={() => setSelection(null)}>
                <Icon name="close" size={11} />
              </button>
            </span>
          )}
        </div>

        {snapshot && snapshot.errors.length > 0 && (
          <details className="errors">
            <summary>
              {snapshot.errors.length} feed{snapshot.errors.length === 1 ? "" : "s"} failed, the rest is shown
            </summary>
            <ul>
              {snapshot.errors.map((e, i) => (
                <li key={i}>
                  {e.source}: {e.message}
                </li>
              ))}
            </ul>
          </details>
        )}

        {view === "versions" ? (
          <VersionsView cycles={snapshot?.cycles ?? []} />
        ) : (
          <>
            <Stats tiles={tiles} />

            <div className="toolbar">
              <label className="search-field">
                <Icon name="search" size={14} />
                <input
                  placeholder="Search CVE, product or text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setFocusKey(null);
                  }}
                  spellCheck={false}
                />
              </label>
              <div className="segmented" role="radiogroup" aria-label="Severity">
                {(["all", "medium", "high", "critical"] as MinSeverity[]).map((s) => (
                  <button key={s} type="button" className={minSeverity === s ? "active" : undefined} onClick={() => setMinSeverity(s)}>
                    {s === "all" ? "All" : s === "medium" ? "Medium+" : s === "high" ? "High+" : "Critical"}
                  </button>
                ))}
              </div>
              <div className="segmented" role="radiogroup" aria-label="Period">
                {(["7", "30", "90", "365", "all"] as Range[]).map((r) => (
                  <button key={r} type="button" className={range === r ? "active" : undefined} onClick={() => setRanges((all) => ({ ...all, [view]: r }))}>
                    {r === "all" ? "All" : r === "365" ? "1y" : `${r}d`}
                  </button>
                ))}
              </div>
            </div>

            {snapshot ? (
              <VulnList
                key={`${view}:${range}:${minSeverity}:${selection ? JSON.stringify(selection) : ""}:${focusKey ?? ""}`}
                vulns={shown}
                newKeys={newKeys}
                focusKey={focusKey}
                emptyText={VIEWS[view].empty}
              />
            ) : (
              <div className="list">
                <div className="list-empty">
                  <span className="spin" style={{ display: "grid" }}>
                    <Icon name="refresh" size={24} />
                  </span>
                  <span>Fetching feeds for the first time</span>
                </div>
              </div>
            )}
          </>
        )}
        {settings.memes && <MemeButton />}
      </main>

      {dialog === "stack" && (
        <StackDialog
          stack={stack}
          onClose={() => setDialog(null)}
          onSave={(next) => {
            saveStack(next);
            setStack(next);
            latest.current = { ...latest.current, stack: next };
            setDialog(null);
            setSelection(null);
            void refresh(false);
          }}
        />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          settings={settings}
          onChange={(next) => {
            const pagesChanged = next.ubuntuPages !== settings.ubuntuPages;
            changeSettings(next);
            latest.current = { ...latest.current, settings: next };
            if (pagesChanged) void refresh(false);
          }}
          onEditStack={() => setDialog("stack")}
          onClearNotices={() => setNotices([])}
          onClearCache={() => void clearCache().then(() => refresh(true))}
          onTestNotification={() =>
            void (async () => {
              let granted = await isPermissionGranted();
              if (!granted) granted = (await requestPermission()) === "granted";
              if (granted) sendNotification({ title: "Patchy", body: "Notifications work. New critical and exploited items show up like this." });
            })()
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
