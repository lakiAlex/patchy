import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Vuln } from "../lib/feeds";
import { Icon } from "./icons";

const PAGE = 250;

function dayLabel(date: string): string {
  if (!date) return "Date unknown";
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (date === iso(today)) return "Today";
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (date === iso(y)) return "Yesterday";
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const SEVERITY_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low", none: "Info" } as const;

function Severity({ v }: { v: Vuln }) {
  return (
    <span className={`sev sev-${v.severity}`} title={v.score !== null ? `CVSS ${v.score}` : undefined}>
      {v.source === "Ubuntu" ? "USN" : v.source === "nodejs.org" ? "Patch" : v.source === "CISA KEV" ? "KEV" : SEVERITY_LABEL[v.severity]}
      {v.score !== null && <span className="sev-score">{v.score.toFixed(1)}</span>}
    </span>
  );
}

function Row({ v, open, isNew, onToggle }: { v: Vuln; open: boolean; isNew: boolean; onToggle: () => void }) {
  return (
    <div className={`vuln${open ? " open" : ""}`}>
      <button type="button" className="vuln-row" onClick={onToggle} aria-expanded={open}>
        <Severity v={v} />
        <span className="vuln-main">
          <span className="vuln-title">
            <span className="vuln-id">{v.id}</span>
            <span>{v.title}</span>
          </span>
          <span className="vuln-meta">
            {isNew && <span className="new-dot" title="New since the last refresh" />}
            <span className="product">{v.product}</span>
            <span className="sep">·</span>
            <span>{v.source}</span>
            {v.affects && (
              <>
                <span className="sep">·</span>
                <span>{v.affects}</span>
              </>
            )}
          </span>
        </span>
        <span className="vuln-badges">
          {v.exploited && (
            <span className="pill exploited" title={v.dueDate ? `CISA due date ${v.dueDate}` : "Known exploited"}>
              <Icon name="exploited" size={12} bold /> Exploited
            </span>
          )}
          {v.malware ? (
            <span className="pill unfixed" title={v.affects ?? undefined}>
              Malicious versions
            </span>
          ) : v.status === "unfixed" ? (
            <span className="pill unfixed">No fix yet</span>
          ) : v.fixedIn ? (
            <span className="pill fixed" title={`Fixed in ${v.fixedIn}`}>
              {v.source === "Ubuntu" ? "Update out" : `Fixed in ${v.fixedIn.split(", ").length > 2 ? `${v.fixedIn.split(", ")[0]} +${v.fixedIn.split(", ").length - 1}` : v.fixedIn}`}
            </span>
          ) : null}
        </span>
      </button>
      {open && (
        <div className="vuln-detail">
          {v.description && <p className="vuln-desc">{v.description}</p>}
          <dl className="vuln-facts">
            <dt>Product</dt>
            <dd>{v.product}</dd>
            {v.affects && (
              <>
                <dt>Affects</dt>
                <dd>{v.affects}</dd>
              </>
            )}
            <dt>Status</dt>
            <dd>{v.malware ? "Do not install the listed versions" : v.status === "unfixed" ? "No fixed version yet" : v.fixedIn ? `Fixed in ${v.fixedIn}` : "Fixed"}</dd>
            {v.score !== null && (
              <>
                <dt>CVSS</dt>
                <dd>{v.score.toFixed(1)}</dd>
              </>
            )}
            {v.cves.length > 0 && (
              <>
                <dt>CVE</dt>
                <dd>{v.cves.join(", ")}</dd>
              </>
            )}
            {v.dueDate && (
              <>
                <dt>CISA due date</dt>
                <dd>{v.dueDate}</dd>
              </>
            )}
            <dt>Published</dt>
            <dd>{v.published || "Unknown"}</dd>
          </dl>
          <div className="vuln-links">
            {v.links.map((l) => (
              <button key={l.url} type="button" className="button small" onClick={() => void openUrl(l.url)}>
                <Icon name="link" size={14} /> {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function VulnList({ vulns, newKeys, emptyText, focusKey }: { vulns: Vuln[]; newKeys: Set<string>; emptyText: string; focusKey?: string | null }) {
  const [openKey, setOpenKey] = useState<string | null>(focusKey ?? null);
  const [limit, setLimit] = useState(PAGE);
  const listRef = useRef<HTMLDivElement>(null);

  // Opened from a notification: scroll its row into view.
  useEffect(() => {
    if (!focusKey) return;
    listRef.current?.querySelector(".vuln.open")?.scrollIntoView({ block: "center" });
  }, [focusKey]);

  if (vulns.length === 0) {
    return (
      <div className="list">
        <div className="list-empty">
          <Icon name="ok" size={28} />
          <span>{emptyText}</span>
        </div>
      </div>
    );
  }

  const shown = vulns.slice(0, limit);
  const rows: React.ReactNode[] = [];
  let day: string | null = null;
  for (const v of shown) {
    if (v.published !== day) {
      day = v.published;
      rows.push(
        <div key={`day:${day}`} className="list-day">
          {dayLabel(day)}
        </div>,
      );
    }
    rows.push(<Row key={v.key} v={v} open={openKey === v.key} isNew={newKeys.has(v.key)} onToggle={() => setOpenKey((k) => (k === v.key ? null : v.key))} />);
  }

  return (
    <div className="list" ref={listRef}>
      {rows}
      {vulns.length > limit && (
        <div className="show-more">
          <button type="button" className="button small" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, vulns.length - limit)} more of {vulns.length - limit}
          </button>
        </div>
      )}
    </div>
  );
}
