// Fetches the feeds and turns them into one list of vulnerabilities.
//
// Sources, all free and without an API key:
// - WPVulnerability.net: WordPress core, plugins and themes, PHP, nginx, MySQL and
//   MariaDB. It merges Wordfence, Patchstack and CVE records and marks unfixed ones.
// - OSV.dev: npm and Composer packages (GitHub advisories and others).
// - Ubuntu Security Notices: updates for the watched packages on each release.
// - nodejs.org: Node.js security releases.
// - CISA KEV: vulnerabilities known to be exploited in the wild.
// - endoflife.date: latest versions and support dates.
import { invoke } from "@tauri-apps/api/core";
import { compareVersions, meets } from "./version";
import type { Group, Stack } from "./watch";

export type Severity = "critical" | "high" | "medium" | "low" | "none";
/** unfixed: no fixed version exists. fixed: a fixed version exists. */
export type Status = "unfixed" | "fixed";

export interface Link {
  label: string;
  url: string;
}

export interface Vuln {
  key: string;
  id: string;
  title: string;
  description: string;
  severity: Severity;
  score: number | null;
  /** YYYY-MM-DD, or "" when unknown. */
  published: string;
  productId: string;
  product: string;
  group: Group;
  source: string;
  status: Status;
  fixedIn: string | null;
  affects: string | null;
  cves: string[];
  exploited: boolean;
  /** OSV malware record: some published versions were malicious. */
  malware?: boolean;
  /** Set for CISA KEV entries: the date CISA wants it fixed by. */
  dueDate: string | null;
  links: Link[];
}

export interface Product {
  id: string;
  label: string;
  group: Group;
}

export interface Cycle {
  product: string;
  label: string;
  cycle: string;
  latest: string;
  latestDate: string;
  /** End of active support (bug fixes), or null when the product has no such date. */
  support: string | boolean | null;
  /** End of security fixes. */
  eol: string | boolean;
  lts: boolean;
  tracked: boolean;
}

export interface FeedError {
  source: string;
  message: string;
}

export interface Snapshot {
  vulns: Vuln[];
  products: Product[];
  cycles: Cycle[];
  errors: FeedError[];
  /** Unix seconds of the oldest data in the snapshot. */
  fetchedAt: number;
}

interface Fetched<T> {
  data: T;
  fetched_at: number;
  cached: boolean;
}

const HOUR = 3600;

async function getJson<T>(url: string, ttl: number, force: boolean, body?: unknown): Promise<Fetched<T>> {
  return invoke<Fetched<T>>("fetch_json", { url, body: body === undefined ? null : JSON.stringify(body), ttlSecs: ttl, force });
}

/** Runs the tasks with at most `limit` running at a time. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ---- Helpers ----

function severityFromText(text: string | null | undefined): Severity {
  switch ((text ?? "").toLowerCase()) {
    case "c":
    case "critical":
      return "critical";
    case "h":
    case "high":
      return "high";
    case "m":
    case "medium":
    case "moderate":
      return "medium";
    case "l":
    case "low":
      return "low";
    default:
      return "none";
  }
}

function severityFromScore(score: number | null): Severity {
  if (score === null) return "none";
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  if (score > 0) return "low";
  return "none";
}

const validDate = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) && !d.startsWith("0000") ? d.slice(0, 10) : "");

/** Strips HTML tags and the "[en]" language prefix the feeds put in descriptions. */
function plain(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*\[[a-z-]{2,6}\]\s*/i, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const cveLink = (id: string): Link => ({ label: id, url: `https://www.cve.org/CVERecord?id=${id}` });

// ---- WPVulnerability ----

interface WpvSource {
  id: string;
  name?: string;
  link: string;
  description: string | null;
  date?: string;
}

interface WpvVuln {
  uuid: string;
  name: string;
  description?: string | null;
  operator?: {
    min_version: string | null;
    min_operator: string | null;
    max_version: string | null;
    max_operator: string | null;
    unfixed: string | number;
  } | null;
  source: WpvSource[];
  impact?: {
    cvss?: { score?: string; severity?: string };
    cvss3?: { score?: string; severity?: string };
    ssvc?: { kev?: boolean };
    kev?: unknown;
  } | null;
}

interface WpvResponse {
  error: number;
  message: string | null;
  data: { name?: string; vulnerability: WpvVuln[] | null } | null;
}

function sourceName(link: string): string {
  if (link.includes("wordfence.com")) return "Wordfence";
  if (link.includes("patchstack.com")) return "Patchstack";
  if (link.includes("wpscan.com")) return "WPScan";
  if (link.includes("cve.org") || link.includes("nvd.nist.gov")) return "CVE";
  if (link.includes("jetpack.com")) return "Jetpack";
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/**
 * Turns WPVulnerability entries into Vulns. `latest` is the newest release of the
 * product: an entry is unfixed when it is marked so or still covers that release.
 */
function fromWpv(entries: WpvVuln[], product: Product, latest: string | null, unfixedIds?: Set<string>): Vuln[] {
  return entries.map((v) => {
    const cves = [...new Set(v.source.map((s) => s.id).filter((id) => /^CVE-\d+-\d+$/.test(id)))];
    const dates = v.source.map((s) => validDate(s.date)).filter(Boolean).sort();
    const cvss = v.impact?.cvss3 ?? v.impact?.cvss;
    const score = cvss?.score ? Number(cvss.score) : null;
    const op = v.operator;
    let unfixed = op ? String(op.unfixed) === "1" : false;
    if (!unfixed && op && latest && op.max_version) {
      unfixed = meets(latest, op.max_operator, op.max_version) && meets(latest, op.min_operator, op.min_version);
    }
    if (unfixedIds) unfixed = unfixedIds.has(v.uuid);
    const fixedIn = !unfixed && op?.max_operator === "lt" ? op.max_version : null;
    let affects: string | null = null;
    if (op?.max_version) {
      const lo = op.min_version ? `${op.min_operator === "gt" ? ">" : ">="} ${op.min_version}, ` : "";
      affects = `${lo}${op.max_operator === "lt" ? "<" : "<="} ${op.max_version}`;
    }
    // Some sources name an entry by its ID or by the version ("7.1"); those make poor titles.
    const poor = (t: string | null | undefined) => !t || /^(CVE|EUVD|GHSA|PSID)-[\w-]+$/i.test(t.trim()) || /^[\d.]+$/.test(t.trim());
    const named = v.source.find((s) => !poor(s.name));
    const described = v.source.find((s) => s.description && !s.description.startsWith("<p>WordPress"));
    const firstSentence = (t: string) => {
      const m = t.match(/^(.{20,160}?[.!?])(\s|$)/);
      return m ? m[1] : t.slice(0, 140);
    };
    const title = !poor(named?.name) ? plain(named?.name) : !poor(v.name) ? plain(v.name) : firstSentence(plain(described?.description ?? v.description)) || plain(v.name);
    const severity = severityFromText(cvss?.severity) !== "none" ? severityFromText(cvss?.severity) : severityFromScore(score);
    const links: Link[] = [];
    for (const s of v.source) {
      if (/^CVE-/.test(s.id)) continue;
      const label = sourceName(s.link);
      if (!links.some((l) => l.label === label)) links.push({ label, url: s.link });
    }
    links.unshift(...cves.map(cveLink));
    return {
      key: `wpv:${v.uuid}`,
      id: cves[0] ?? v.name,
      title,
      description: plain(described?.description ?? v.description),
      severity,
      score: Number.isFinite(score) ? score : null,
      published: dates[0] ?? "",
      productId: product.id,
      product: product.label,
      group: product.group,
      source: "WPVulnerability",
      status: unfixed ? "unfixed" : "fixed",
      fixedIn,
      affects,
      cves,
      exploited: Boolean(v.impact?.ssvc?.kev),
      dueDate: null,
      links,
    } satisfies Vuln;
  });
}

async function wpv(path: string, ttl: number, force: boolean): Promise<WpvResponse> {
  const res = await getJson<WpvResponse>(`https://www.wpvulnerability.net/${path}/`, ttl, force);
  if (res.data.error && res.data.error !== 0) throw new Error(res.data.message ?? `WPVulnerability error for ${path}`);
  return res.data;
}

// ---- OSV ----

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  published: string;
  modified: string;
  withdrawn?: string;
  database_specific?: { severity?: string };
  affected?: {
    package: { name: string; ecosystem: string };
    ranges?: { type: string; events: Record<string, string>[] }[];
    versions?: string[];
  }[];
  references?: { type: string; url: string }[];
}

function fromOsv(entries: OsvVuln[], product: Product, packageName: string): Vuln[] {
  return entries
    .filter((v) => !v.withdrawn)
    .map((v) => {
      const affected = (v.affected ?? []).filter((a) => a.package.name === packageName);
      const fixed: string[] = [];
      const intro: string[] = [];
      let open = false;
      for (const a of affected) {
        for (const r of a.ranges ?? []) {
          if (r.type === "GIT") continue;
          const hasFix = r.events.some((e) => e.fixed);
          r.events.forEach((e) => {
            if (e.fixed) fixed.push(e.fixed);
            if (e.introduced && e.introduced !== "0") intro.push(e.introduced);
          });
          if (!hasFix) open = true;
        }
      }
      const cves = (v.aliases ?? []).filter((a) => a.startsWith("CVE-"));
      const links: Link[] = [...cves.map(cveLink)];
      if (v.id.startsWith("GHSA-")) links.push({ label: "GitHub advisory", url: `https://github.com/advisories/${v.id}` });
      links.push({ label: "OSV", url: `https://osv.dev/vulnerability/${v.id}` });
      const advisory = v.references?.find((r) => r.type === "ADVISORY" || r.url.includes("/security/advisories/"));
      if (advisory && !links.some((l) => l.url === advisory.url)) links.push({ label: "Vendor advisory", url: advisory.url });
      const details = plain(v.details?.replace(/[#*`]/g, ""));
      fixed.sort(compareVersions);
      // OSV malware records (MAL-): specific published versions carried malicious code.
      // There is no fixed version; the fix is to avoid those versions.
      if (v.id.startsWith("MAL-")) {
        const bad = affected.flatMap((a) => a.versions ?? []);
        return {
          key: `osv:${v.id}:${packageName}`,
          id: v.id,
          title: plain(v.summary) || `Malicious versions of ${packageName}`,
          description: details,
          severity: "critical",
          score: null,
          published: validDate(v.published),
          productId: product.id,
          product: product.label,
          group: product.group,
          source: "OSV malware",
          status: "fixed",
          fixedIn: null,
          affects: bad.length ? `malicious versions: ${bad.join(", ")}` : "malicious versions",
          cves,
          exploited: false,
          dueDate: null,
          malware: true,
          links,
        } satisfies Vuln;
      }
      return {
        key: `osv:${v.id}:${packageName}`,
        id: cves[0] ?? v.id,
        title: plain(v.summary) || details.slice(0, 140),
        description: details,
        severity: severityFromText(v.database_specific?.severity),
        score: null,
        published: validDate(v.published),
        productId: product.id,
        product: product.label,
        group: product.group,
        source: v.id.startsWith("GHSA-") ? "GitHub" : "OSV",
        status: open || fixed.length === 0 ? "unfixed" : "fixed",
        fixedIn: fixed.length ? fixed.join(", ") : null,
        affects: intro.length ? `from ${[...new Set(intro)].sort(compareVersions).join(", ")}` : null,
        cves,
        exploited: false,
        dueDate: null,
        links,
      } satisfies Vuln;
    });
}

// ---- Ubuntu ----

interface UsnNotice {
  id: string;
  title: string;
  summary: string;
  description: string;
  published: string;
  cves_ids: string[];
  release_packages: Record<string, { name: string; version: string; is_source: boolean }[]>;
}

function packageMatches(name: string, watched: string[]): boolean {
  return watched.some((w) => name === w || (name.startsWith(w) && /^[-\d.]/.test(name.slice(w.length))));
}

// ---- KEV ----

interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
}

/** KEV vendor/product names that belong to the watched stack, by group. */
const KEV_MATCH: { re: RegExp; group: Group; label: string }[] = [
  { re: /wordpress|woocommerce|elementor|wp /i, group: "wordpress", label: "WordPress" },
  { re: /\bphp\b|laravel|symfony|composer/i, group: "php", label: "PHP" },
  { re: /node\.?js|next\.?js|vercel|react|npm|webpack|vite/i, group: "javascript", label: "JavaScript" },
  { re: /linux kernel|ubuntu|canonical|openssh|openssl|nginx|mysql|mariadb|sudo|glibc|polkit|systemd|redis|imagemagick|curl|apache http|exim|bash|xz/i, group: "server", label: "Servers" },
];

// ---- endoflife.date ----

interface EolCycle {
  cycle: string;
  codename?: string;
  latest: string;
  latestReleaseDate?: string;
  releaseDate?: string;
  support?: string | boolean;
  eol: string | boolean;
  lts?: boolean | string;
}

const EOL_PRODUCTS: { slug: string; label: string; tracked: (s: Stack) => string[] }[] = [
  { slug: "wordpress", label: "WordPress", tracked: (s) => s.wpCore },
  { slug: "php", label: "PHP", tracked: (s) => s.php },
  { slug: "nodejs", label: "Node.js", tracked: (s) => s.node },
  { slug: "ubuntu", label: "Ubuntu", tracked: () => [] },
  { slug: "nginx", label: "nginx", tracked: (s) => s.nginx },
  { slug: "mysql", label: "MySQL", tracked: (s) => s.mysql },
  { slug: "mariadb", label: "MariaDB", tracked: (s) => s.mariadb },
  { slug: "laravel", label: "Laravel", tracked: () => [] },
  { slug: "nextjs", label: "Next.js", tracked: () => [] },
];

const UBUNTU_CYCLES: Record<string, string> = {
  noble: "24.04",
  jammy: "22.04",
  focal: "20.04",
  bionic: "18.04",
  resolute: "26.04",
};

// ---- Loading ----

export interface Progress {
  done: number;
  total: number;
}

export interface LoadOptions {
  force: boolean;
  /** Seconds a cached feed copy stays valid: the auto refresh interval, so each refresh fetches again. */
  maxAge: number;
  ubuntuPages: number;
}

export async function loadSnapshot(stack: Stack, opts: LoadOptions, onProgress: (p: Progress) => void): Promise<Snapshot> {
  const { force } = opts;
  const ttl = (base: number) => Math.max(60, Math.min(base, opts.maxAge));
  const wpvTtl = ttl(6 * HOUR);
  const vulns: Vuln[] = [];
  const products: Product[] = [];
  const cycles: Cycle[] = [];
  const errors: FeedError[] = [];
  let oldest = Math.floor(Date.now() / 1000);
  const seen = (f: { fetched_at: number }) => (oldest = Math.min(oldest, f.fetched_at));

  const tasks: (() => Promise<void>)[] = [];
  let done = 0;
  const task = (source: string, run: () => Promise<void>) =>
    tasks.push(async () => {
      try {
        await run();
      } catch (e) {
        errors.push({ source, message: String(e) });
      }
      onProgress({ done: ++done, total: tasks.length });
    });

  // endoflife.date first: other feeds use its latest versions.
  const eol = new Map<string, EolCycle[]>();
  await pool(
    EOL_PRODUCTS.map((p) => async () => {
      try {
        const res = await getJson<EolCycle[]>(`https://endoflife.date/api/${p.slug}.json`, 24 * HOUR, force);
        seen(res);
        eol.set(p.slug, res.data);
      } catch (e) {
        errors.push({ source: `endoflife.date ${p.label}`, message: String(e) });
      }
    }),
    6,
  );
  const latestOf = (slug: string, branch: string) => eol.get(slug)?.find((c) => c.cycle === branch)?.latest ?? null;

  for (const p of EOL_PRODUCTS) {
    const tracked = p.slug === "ubuntu" ? stack.ubuntu.map((u) => UBUNTU_CYCLES[u] ?? u) : p.tracked(stack);
    const today = new Date().toISOString().slice(0, 10);
    for (const c of eol.get(p.slug) ?? []) {
      const isTracked = tracked.includes(c.cycle);
      const alive = c.eol === false || (typeof c.eol === "string" && c.eol >= today);
      if (!isTracked && !alive) continue;
      cycles.push({
        product: p.slug,
        label: p.label,
        cycle: c.codename ? `${c.cycle} ${c.codename}` : c.cycle,
        latest: c.latest,
        latestDate: c.latestReleaseDate ?? c.releaseDate ?? "",
        support: c.support ?? null,
        eol: c.eol,
        lts: Boolean(c.lts),
        tracked: isTracked,
      });
    }
  }

  // WordPress core.
  let wpOffers: string[] = [];
  task("WordPress core", async () => {
    const res = await getJson<{ offers: { version: string }[] }>("https://api.wordpress.org/core/version-check/1.7/", ttl(6 * HOUR), force);
    seen(res);
    wpOffers = res.data.offers.map((o) => o.version);
    const branches = stack.wpCore.map((b) => (b === "latest" ? wpOffers[0].split(".").slice(0, 2).join(".") : b));
    for (const branch of [...new Set(branches)]) {
      const latest = wpOffers.find((v) => v === branch || v.startsWith(`${branch}.`)) ?? `${branch}.0`;
      const product: Product = { id: `wp-core:${branch}`, label: `WordPress ${branch}`, group: "wordpress" };
      products.push(product);
      // The branch's history, and what is still open in its latest release.
      const [history, current] = await Promise.all([wpv(`core/${branch}`, wpvTtl, force), wpv(`core/${latest}`, wpvTtl, force)]);
      const open = new Set((current.data?.vulnerability ?? []).map((v) => v.uuid));
      const list = fromWpv(history.data?.vulnerability ?? [], product, latest, open);
      for (const v of list) if (v.status === "fixed") v.fixedIn = `${branch}.x (latest ${latest})`;
      vulns.push(...list);
    }
  });

  for (const slug of stack.wpPlugins) {
    task(`Plugin ${slug}`, async () => {
      const res = await wpv(`plugin/${slug}`, wpvTtl, force);
      const product: Product = { id: `wp-plugin:${slug}`, label: plain(res.data?.name) || slug, group: "wordpress" };
      products.push(product);
      vulns.push(...fromWpv(res.data?.vulnerability ?? [], product, null));
    });
  }

  for (const slug of stack.wpThemes) {
    task(`Theme ${slug}`, async () => {
      const res = await wpv(`theme/${slug}`, wpvTtl, force);
      const product: Product = { id: `wp-theme:${slug}`, label: `${plain(res.data?.name) || slug} (theme)`, group: "wordpress" };
      products.push(product);
      vulns.push(...fromWpv(res.data?.vulnerability ?? [], product, null));
    });
  }

  // PHP, nginx, MySQL and MariaDB: the branch's history from its first release,
  // compared against the branch's latest release from endoflife.date.
  const runtimes: { kind: string; slug: string; label: string; group: Group; branches: string[] }[] = [
    { kind: "php", slug: "php", label: "PHP", group: "php", branches: stack.php },
    { kind: "nginx", slug: "nginx", label: "nginx", group: "server", branches: stack.nginx },
    { kind: "mysql", slug: "mysql", label: "MySQL", group: "server", branches: stack.mysql },
    { kind: "mariadb", slug: "mariadb", label: "MariaDB", group: "server", branches: stack.mariadb },
  ];
  for (const r of runtimes) {
    for (const branch of r.branches) {
      task(`${r.label} ${branch}`, async () => {
        const product: Product = { id: `${r.kind}:${branch}`, label: `${r.label} ${branch}`, group: r.group };
        products.push(product);
        const res = await wpv(`${r.kind}/${branch}.0`, wpvTtl, force);
        vulns.push(...fromWpv(res.data?.vulnerability ?? [], product, latestOf(r.slug, branch)));
      });
    }
  }

  // npm and Composer packages through OSV.
  const packages: { ecosystem: string; name: string; group: Group }[] = [
    ...stack.npm.map((name) => ({ ecosystem: "npm", name, group: "javascript" as Group })),
    ...stack.composer.map((name) => ({ ecosystem: "Packagist", name, group: "php" as Group })),
  ];
  for (const p of packages) {
    task(`${p.ecosystem} ${p.name}`, async () => {
      const product: Product = { id: `${p.ecosystem}:${p.name}`, label: p.name, group: p.group };
      products.push(product);
      const res = await getJson<{ vulns?: OsvVuln[] }>("https://api.osv.dev/v1/query", ttl(2 * HOUR), force, { package: { name: p.name, ecosystem: p.ecosystem } });
      seen(res);
      vulns.push(...fromOsv(res.data.vulns ?? [], product, p.name));
    });
  }

  // Node.js security releases for the watched majors.
  if (stack.node.length) {
    task("Node.js releases", async () => {
      const res = await getJson<{ version: string; date: string; security: boolean; lts: string | false }[]>("https://nodejs.org/dist/index.json", ttl(6 * HOUR), force);
      seen(res);
      for (const major of stack.node) {
        const product: Product = { id: `node:${major}`, label: `Node.js ${major}`, group: "javascript" };
        products.push(product);
        const releases = res.data.filter((r) => r.security && r.version.startsWith(`v${major}.`));
        for (const r of releases.slice(0, 12)) {
          vulns.push({
            key: `node:${r.version}`,
            id: r.version,
            title: `Node.js ${r.version} security release`,
            description: `Node.js ${r.version}${r.lts ? ` (${r.lts} LTS)` : ""} fixes security issues in the ${major}.x line. Update to ${r.version} or later.`,
            severity: "none",
            score: null,
            published: r.date,
            productId: product.id,
            product: product.label,
            group: "javascript",
            source: "nodejs.org",
            status: "fixed",
            fixedIn: r.version.slice(1),
            affects: `${major}.x before ${r.version.slice(1)}`,
            cves: [],
            exploited: false,
            dueDate: null,
            links: [
              { label: "Release notes", url: `https://github.com/nodejs/node/releases/tag/${r.version}` },
              { label: "Security blog", url: "https://nodejs.org/en/blog/vulnerability" },
            ],
          });
        }
      }
    });
  }

  // Ubuntu Security Notices: pages of 20 per release; five pages are about two to four weeks.
  for (const release of stack.ubuntu) {
    const product: Product = { id: `ubuntu:${release}`, label: `Ubuntu ${UBUNTU_CYCLES[release] ?? ""} ${release}`.replace(/\s+/g, " "), group: "server" };
    products.push(product);
    for (let page = 0; page < opts.ubuntuPages; page++) {
      task(`Ubuntu ${release}`, async () => {
        const res = await getJson<{ notices: UsnNotice[] }>(`https://ubuntu.com/security/notices.json?limit=20&offset=${page * 20}&release=${release}`, ttl(2 * HOUR), force);
        seen(res);
        for (const n of res.data.notices) {
          const pkgs = (n.release_packages[release] ?? []).filter((p) => p.is_source);
          if (!pkgs.some((p) => packageMatches(p.name, stack.ubuntuPackages))) continue;
          vulns.push({
            key: `usn:${n.id}:${release}`,
            id: n.id,
            title: n.title,
            description: plain(n.description) || plain(n.summary),
            severity: "none",
            score: null,
            published: validDate(n.published),
            productId: product.id,
            product: product.label,
            group: "server",
            source: "Ubuntu",
            status: "fixed",
            fixedIn: pkgs.map((p) => `${p.name} ${p.version}`).join(", "),
            affects: pkgs.length > 2 ? `${pkgs.slice(0, 2).map((p) => p.name).join(", ")} and ${pkgs.length - 2} more` : pkgs.map((p) => p.name).join(", "),
            cves: n.cves_ids ?? [],
            exploited: false,
            dueDate: null,
            links: [{ label: n.id, url: `https://ubuntu.com/security/notices/${n.id}` }, ...(n.cves_ids ?? []).slice(0, 6).map(cveLink)],
          });
        }
      });
    }
  }

  await pool(tasks, 6);

  // CISA KEV: mark exploited vulns, and add KEV entries for the stack that no other feed had.
  try {
    const res = await getJson<{ vulnerabilities: KevEntry[] }>("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", Math.max(HOUR, ttl(6 * HOUR)), force);
    seen(res);
    const kev = new Map(res.data.vulnerabilities.map((k) => [k.cveID, k]));
    const covered = new Set<string>();
    for (const v of vulns) {
      for (const c of v.cves) {
        const k = kev.get(c);
        if (k) {
          v.exploited = true;
          v.dueDate = k.dueDate;
          covered.add(c);
        }
      }
    }
    const kevProducts = new Map<Group, Product>();
    for (const k of res.data.vulnerabilities) {
      if (covered.has(k.cveID)) continue;
      const match = KEV_MATCH.find((m) => m.re.test(`${k.vendorProject} ${k.product}`));
      if (!match) continue;
      let product = kevProducts.get(match.group);
      if (!product) {
        product = { id: `kev:${match.group}`, label: `${match.label} (exploited)`, group: match.group };
        kevProducts.set(match.group, product);
        products.push(product);
      }
      vulns.push({
        key: `kev:${k.cveID}`,
        id: k.cveID,
        title: k.vulnerabilityName,
        description: `${k.shortDescription}\n\nRequired action: ${k.requiredAction}${k.knownRansomwareCampaignUse === "Known" ? "\n\nUsed in ransomware campaigns." : ""}`,
        severity: "none",
        score: null,
        published: k.dateAdded,
        productId: product.id,
        product: `${k.vendorProject} ${k.product}`,
        group: match.group,
        source: "CISA KEV",
        status: "fixed",
        fixedIn: null,
        affects: `${k.vendorProject} ${k.product}`,
        cves: [k.cveID],
        exploited: true,
        dueDate: k.dueDate,
        links: [cveLink(k.cveID), { label: "NVD", url: `https://nvd.nist.gov/vuln/detail/${k.cveID}` }, { label: "CISA KEV", url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" }],
      });
    }
  } catch (e) {
    errors.push({ source: "CISA KEV", message: String(e) });
  }

  // The same advisory can come through two products (react and react-dom); keep one per key.
  const unique = [...new Map(vulns.map((v) => [v.key, v])).values()];
  unique.sort((a, b) => (b.published || "0").localeCompare(a.published || "0"));
  products.sort((a, b) => a.label.localeCompare(b.label));
  return { vulns: unique, products, cycles, errors, fetchedAt: oldest };
}

export async function clearCache(): Promise<void> {
  await invoke("clear_cache");
}
