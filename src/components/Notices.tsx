import { useEffect, useRef, useState } from "react";
import type { Severity, Vuln } from "../lib/feeds";
import { Icon } from "./icons";

/** A new item found by a refresh, kept until cleared. */
export interface Notice {
  key: string;
  id: string;
  title: string;
  product: string;
  severity: Severity;
  exploited: boolean;
  unfixed: boolean;
  source: string;
  /** Unix ms when Patchy found it. */
  at: number;
  read: boolean;
}

const KEY = "patchy.notices";
const MAX = 100;

export function loadNotices(): Notice[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Notice[];
  } catch {
    return [];
  }
}

export function saveNotices(list: Notice[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Storage full: the list lives on until the app quits.
  }
}

export function toNotice(v: Vuln): Notice {
  return {
    key: v.key,
    id: v.id,
    title: v.title,
    product: v.product,
    severity: v.severity,
    exploited: v.exploited,
    unfixed: v.status === "unfixed",
    source: v.source,
    at: Date.now(),
    read: false,
  };
}

function when(at: number): string {
  const m = Math.floor((Date.now() - at) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

const SEV_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", none: "Info" };

/** The bell in the title bar and its panel of new items. */
export function NoticeBell(props: {
  notices: Notice[];
  onOpenNotice: (n: Notice) => void;
  onMarkRead: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [ringing, setRinging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = props.notices.filter((n) => !n.read).length;
  const lastUnread = useRef(unread);

  // A new notice swings the bell.
  useEffect(() => {
    if (unread > lastUnread.current) {
      setRinging(true);
      const t = setTimeout(() => setRinging(false), 950);
      lastUnread.current = unread;
      return () => clearTimeout(t);
    }
    lastUnread.current = unread;
  }, [unread]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    // Opening shows the unread ones highlighted; closing marks them read.
    if (open) props.onMarkRead();
    setOpen(!open);
  };

  return (
    <div className="notices" ref={ref}>
      <button
        type="button"
        className={`bell-button${open ? " open" : ""}${ringing ? " ringing" : ""}`}
        title={unread ? `${unread} new` : "Notifications"}
        aria-label="Notifications"
        onClick={toggle}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && <span className="bell-badge" />}
      </button>
      {open && (
        <div className="notice-panel">
          <div className="notice-head">
            <span className="notice-heading">New {unread > 0 && <span className="notice-count">{unread}</span>}</span>
            <span style={{ display: "flex", gap: 2 }}>
              <button type="button" className="notice-clear" disabled={unread === 0} onClick={props.onMarkRead}>
                <Icon name="tick" size={13} /> Mark read
              </button>
              <button type="button" className="notice-clear" disabled={props.notices.length === 0} onClick={props.onClear}>
                Clear
              </button>
            </span>
          </div>
          <div className="notice-list">
            {props.notices.length === 0 && <div className="notice-empty">Nothing new. Patchy checks the feeds on its own and lists new items here.</div>}
            {props.notices.map((n) => (
              <button
                key={n.key}
                type="button"
                className={`notice-row${n.read ? "" : " unread"}`}
                onClick={() => {
                  props.onOpenNotice(n);
                  props.onMarkRead();
                  setOpen(false);
                }}
              >
                <span className={`notice-sev sev-${n.severity}`} />
                <span className="notice-text">
                  <span className="notice-title">
                    <span className="vuln-id">{n.id}</span> {n.title}
                  </span>
                  <span className="notice-meta">
                    {n.product} · {n.source === "Ubuntu" ? "USN" : SEV_LABEL[n.severity]}
                    {n.exploited && <span className="notice-flag exploited">Exploited</span>}
                    {n.unfixed && <span className="notice-flag unfixed">No fix yet</span>}
                  </span>
                </span>
                <span className="notice-when">{when(n.at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
