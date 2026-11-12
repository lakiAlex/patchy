import { useEffect, useState, type ReactNode } from "react";
import type { NoticeLevel, Range, Settings } from "../lib/settings";

function Segmented<T extends string | number>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {props.options.map(([v, label]) => (
        <button key={String(v)} type="button" className={props.value === v ? "active" : undefined} onClick={() => props.onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Row(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <span className="setting-label">{props.label}</span>
        {props.hint && <span className="hint">{props.hint}</span>}
      </div>
      <div className="setting-control">{props.children}</div>
    </div>
  );
}

function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={props.checked} aria-label={props.label} className={`toggle${props.checked ? " on" : ""}`} onClick={() => props.onChange(!props.checked)}>
      <span />
    </button>
  );
}

export function SettingsDialog(props: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onEditStack: () => void;
  onClearCache: () => void;
  onClearNotices: () => void;
  onTestNotification: () => void;
  onClose: () => void;
}) {
  const [s, setS] = useState(props.settings);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...s, [key]: value };
    setS(next);
    props.onChange(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog settings-dialog" role="dialog" aria-label="Settings">
        <div className="dialog-header">
          <h2>Settings</h2>
        </div>
        <div className="dialog-body">
          <section className="setting-section">
            <h3>Refresh</h3>
            <Row label="Check the feeds every" hint="Patchy fetches all feeds again on this interval">
              <Segmented<number>
                value={s.refreshMinutes}
                options={[
                  [5, "5m"],
                  [10, "10m"],
                  [30, "30m"],
                  [60, "1h"],
                  [0, "Off"],
                ]}
                onChange={(v) => set("refreshMinutes", v)}
              />
            </Row>
            <Row label="Ubuntu history" hint="Pages of 20 notices per release">
              <Segmented<number>
                value={s.ubuntuPages}
                options={[
                  [2, "40"],
                  [5, "100"],
                  [10, "200"],
                ]}
                onChange={(v) => set("ubuntuPages", v)}
              />
            </Row>
          </section>

          <section className="setting-section">
            <h3>Notifications</h3>
            <Row label="Notify about" hint="New items that go to the bell">
              <Segmented<NoticeLevel>
                value={s.noticeLevel}
                options={[
                  ["exploited", "Exploited"],
                  ["high", "High+"],
                  ["medium", "Medium+"],
                  ["all", "All"],
                ]}
                onChange={(v) => set("noticeLevel", v)}
              />
            </Row>
            <Row label="Only if published within" hint="Adding a plugin to the stack does not flood the bell with its history">
              <Segmented<number>
                value={s.noticeMaxAgeDays}
                options={[
                  [7, "7d"],
                  [30, "30d"],
                  [90, "90d"],
                ]}
                onChange={(v) => set("noticeMaxAgeDays", v)}
              />
            </Row>
            <Row label="Mac notifications" hint="Also post new items to Notification Center">
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" className="button small ghost" onClick={props.onTestNotification}>
                  Test
                </button>
                <Toggle label="Mac notifications" checked={s.macNotifications} onChange={(v) => set("macNotifications", v)} />
              </span>
            </Row>
          </section>

          <section className="setting-section">
            <h3>Feed</h3>
            <Row label="Default period for Latest">
              <Segmented<Range>
                value={s.defaultRange}
                options={[
                  ["7", "7d"],
                  ["30", "30d"],
                  ["90", "90d"],
                  ["365", "1y"],
                ]}
                onChange={(v) => set("defaultRange", v)}
              />
            </Row>
            <Row label="Ubuntu security notices">
              <Toggle label="Ubuntu security notices" checked={s.showUbuntu} onChange={(v) => set("showUbuntu", v)} />
            </Row>
            <Row label="Node.js security releases">
              <Toggle label="Node.js security releases" checked={s.showNodeReleases} onChange={(v) => set("showNodeReleases", v)} />
            </Row>
            <Row label="Other exploited CVEs for the stack" hint="CISA KEV entries for WordPress, PHP, Linux and so on that no other feed listed">
              <Toggle label="Other exploited CVEs" checked={s.showKevExtra} onChange={(v) => set("showKevExtra", v)} />
            </Row>
          </section>

          <section className="setting-section">
            <h3>Appearance</h3>
            <Row label="Interface font">
              <Segmented<Settings["uiFont"]>
                value={s.uiFont}
                options={[
                  ["system", "SF Pro"],
                  ["geist", "Geist"],
                ]}
                onChange={(v) => set("uiFont", v)}
              />
            </Row>
            <Row label="Memes" hint="The cat button in the corner">
              <Toggle label="Memes" checked={s.memes} onChange={(v) => set("memes", v)} />
            </Row>
            <Row label="Anonymous usage stats" hint="Counts app starts, with no personal data">
              <Toggle label="Anonymous usage stats" checked={s.usageStats} onChange={(v) => set("usageStats", v)} />
            </Row>
          </section>

          <section className="setting-section">
            <h3>Data</h3>
            <div className="setting-buttons">
              <button type="button" className="button small" onClick={props.onEditStack}>
                Edit stack
              </button>
              <button type="button" className="button small" onClick={props.onClearNotices}>
                Clear notifications
              </button>
              <button type="button" className="button small" onClick={props.onClearCache}>
                Clear cache and refresh
              </button>
            </div>
          </section>
        </div>
        <div className="dialog-footer">
          <span className="hint">Changes apply right away.</span>
          <span className="spacer" />
          <button type="button" className="button primary" onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
