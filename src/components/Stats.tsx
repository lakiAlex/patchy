import { Icon, type IconName } from "./icons";

export interface Tile {
  key: string;
  label: string;
  hint: string;
  value: number;
  /** A CSS color, such as var(--sev-critical). */
  tone: string;
  icon: IconName;
  /** Counts per day, oldest first, for the bars. */
  series: number[];
  active: boolean;
  onClick: () => void;
}

function Bars({ series }: { series: number[] }) {
  const max = Math.max(1, ...series);
  return (
    <span className="stat-bars" aria-hidden>
      {series.map((n, i) => (
        <span key={i} className={n ? undefined : "empty"} style={{ height: `${n ? Math.max(14, (n / max) * 100) : 8}%` }} />
      ))}
    </span>
  );
}

/** The row of counts at the top of the list views. Each one is also a filter. */
export function Stats({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="stats">
      {tiles.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`stat${t.active ? " active" : ""}${t.value ? "" : " zero"}`}
          style={{ ["--tone" as string]: t.tone }}
          onClick={t.onClick}
        >
          <span className="stat-top">
            <span className="stat-icon">
              <Icon name={t.icon} size={15} bold />
            </span>
            <span className="stat-label">{t.label}</span>
          </span>
          <span className="stat-bottom">
            <span className="stat-number">
              <span className="stat-value">{t.value}</span>
              <span className="stat-hint">{t.hint}</span>
            </span>
            <Bars series={t.series} />
          </span>
        </button>
      ))}
    </div>
  );
}
