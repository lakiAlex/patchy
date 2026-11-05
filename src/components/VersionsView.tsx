import { useState } from "react";
import type { Cycle } from "../lib/feeds";
import { Icon } from "./icons";

const COLLAPSED_KEY = "patchy.versions.collapsed";

const today = () => new Date().toISOString().slice(0, 10);

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000);
}

function supportState(c: Cycle): { cls: string; label: string } {
  const now = today();
  const eolPassed = c.eol === true || (typeof c.eol === "string" && c.eol < now);
  if (eolPassed) return { cls: "eol", label: "End of life" };
  const activeEnded = c.support === false || (typeof c.support === "string" && c.support < now);
  if (activeEnded) return { cls: "security", label: "Security fixes only" };
  return { cls: "active", label: "Supported" };
}

const dateText = (d: string | boolean | null) => (typeof d === "string" ? d : d === false ? "Not set" : d === true ? "Ended" : "-");

/** Latest versions and support dates for each product, from endoflife.date. */
export function VersionsView({ cycles }: { cycles: Cycle[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (label: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  const byProduct = new Map<string, Cycle[]>();
  for (const c of cycles) byProduct.set(c.label, [...(byProduct.get(c.label) ?? []), c]);

  return (
    <div className="versions">
      {[...byProduct.entries()].map(([label, list]) => (
        <section key={label} className={`versions-product${collapsed.has(label) ? " collapsed" : ""}`}>
          <button type="button" className="versions-head" aria-expanded={!collapsed.has(label)} onClick={() => toggle(label)}>
            <span className="chevron">
              <Icon name="chevron" size={14} />
            </span>
            <h2>{label}</h2>
            <span className="versions-summary">
              {list.filter((c) => supportState(c).cls !== "eol").length} supported
              {list.some((c) => c.tracked && supportState(c).cls === "eol") && <span className="support-pill eol">Tracked version is end of life</span>}
            </span>
          </button>
          {!collapsed.has(label) && (
          <table className="versions-table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>Version</th>
                <th style={{ width: "22%" }}>Latest</th>
                <th style={{ width: "16%" }}>Released</th>
                <th style={{ width: "20%" }}>Status</th>
                <th>Security fixes until</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const state = supportState(c);
                const fresh = c.latestDate && daysSince(c.latestDate) <= 14;
                return (
                  <tr key={c.cycle} className={c.tracked ? "tracked" : undefined}>
                    <td>
                      {c.cycle}
                      {c.lts && " LTS"}
                    </td>
                    <td className="mono">{c.latest}</td>
                    <td className="mono">
                      {c.latestDate || "-"}
                      {fresh && <span className="fresh">new</span>}
                    </td>
                    <td>
                      <span className={`support-pill ${state.cls}`}>{state.label}</span>
                    </td>
                    <td className="mono">{dateText(c.eol)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </section>
      ))}
    </div>
  );
}
