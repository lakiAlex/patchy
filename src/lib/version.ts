/** Compares dotted versions number by number: "8.3.10" > "8.3.9". Text after the numbers is ignored. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((p) => parseInt(p, 10));
  const pb = b.split(/[.+-]/).map((p) => parseInt(p, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Whether `version` meets an operator from WPVulnerability ("lt", "le", "gt", "ge", "eq"). */
export function meets(version: string, operator: string | null, bound: string | null): boolean {
  if (!operator || !bound) return true;
  const c = compareVersions(version, bound);
  switch (operator) {
    case "lt":
      return c < 0;
    case "le":
      return c <= 0;
    case "gt":
      return c > 0;
    case "ge":
      return c >= 0;
    case "eq":
      return c === 0;
    default:
      return true;
  }
}
