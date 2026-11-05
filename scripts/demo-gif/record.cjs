// Records the frames of the README GIF (docs/demo.gif). Patchy's frontend runs
// from the Vite dev server in headless Chrome with a fake Tauri backend. The
// backend's one command, fetch_json, is answered from Node with a real request
// to the same public feeds the app uses, so the GIF shows current data.
//
//   node scripts/demo-gif/record.cjs <frames folder>
//
// Needs the Vite dev server on port 1440 (scripts/demo-gif/run.sh starts it)
// and Chromium from Playwright's cache (pnpm exec playwright-core install chromium).
// Writes PNG frames and frames.json (each frame's file and how long it shows).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright-core");

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/demo-gif/record.cjs <frames folder>");
  process.exit(1);
}

/** The newest Chromium in Playwright's cache. */
function findChromium() {
  const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().reverse() : [];
  for (const dir of dirs) {
    const inner = fs.readdirSync(path.join(base, dir)).find((d) => d.startsWith("chrome-mac"));
    if (!inner) continue;
    const app = fs.readdirSync(path.join(base, dir, inner)).find((d) => d.endsWith(".app"));
    if (app) return path.join(base, dir, inner, app, "Contents/MacOS", app.replace(".app", ""));
  }
  return null;
}

/** The same host list as ALLOWED_HOSTS in src-tauri/src/lib.rs. */
const ALLOWED = ["www.wpvulnerability.net", "api.osv.dev", "ubuntu.com", "www.cisa.gov", "endoflife.date", "nodejs.org", "api.wordpress.org"];

/** fetch_json in Node: the page cannot fetch these hosts itself (CORS). */
async function fetchJson(url, body) {
  if (!ALLOWED.includes(new URL(url).hostname)) throw new Error(`Host not allowed: ${url}`);
  const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body } : undefined);
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return { data: await res.json(), fetched_at: Math.floor(Date.now() / 1000) - 120, cached: false };
}

/** An SVG for a Hugeicons icon (MIT), from its [tag, attributes] list. */
function iconSvg(icon, size, color) {
  const attr = (a) =>
    Object.entries(a)
      .filter(([k]) => k !== "key")
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}="${v}"`)
      .join(" ");
  const body = icon.map(([tag, a]) => `<${tag} ${attr(a)}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="color:${color}">${body}</svg>`;
}

/** The meme the cat button shows in the GIF, made here instead of fetched from Reddit. */
function memeHtml() {
  const icons = require("@hugeicons/core-free-icons");
  const row = (icon, color, text, last) => `
    <div style="display:flex;align-items:center;${last ? "" : "border-bottom:3px solid #111;"}">
      <div style="width:250px;height:240px;display:grid;place-items:center;background:${color}22;border-right:3px solid #111">${iconSvg(icon, 170, color)}</div>
      <div style="flex:1;padding:0 34px;font:800 36px/1.18 -apple-system,'Helvetica Neue',sans-serif;color:#111">${text}</div>
    </div>`;
  return `<html><body style="margin:0;background:#fff">
    <div id="meme" style="width:690px;border:3px solid #111;background:#fff">
      ${row(icons.Sad01Icon, "#c2410c", "Updating 40 plugins")}
      ${row(icons.Happy01Icon, "#15803d", "Opening Patchy to see which ones are on fire", true)}
    </div></body></html>`;
}

// The fake backend. Runs in the page before Patchy loads, in place of Tauri.
const mock = () => {
  const listeners = {};
  let n = 1;
  const handlers = {
    fetch_json: ({ url, body }) => window.__fetchJson(url, body),
    clear_cache: () => null,
    "plugin:event|listen": ({ handler }) => {
      listeners[handler] = handler;
      return n++;
    },
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback: (cb) => {
      const id = n++;
      window["_" + id] = cb;
      return id;
    },
    unregisterCallback: () => {},
    convertFileSrc: (p) => p,
    // Plugin commands (window theme, notifications) get a dummy answer.
    invoke: async (cmd, args) => (handlers[cmd] ? handlers[cmd](args || {}) : cmd.startsWith("plugin:") ? n++ : null),
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };

  // Dark mode, and a few items in the bell. They are real advisories; the bell
  // only fills from refreshes after the first one, so the GIF seeds it.
  localStorage.setItem("patchy.theme", "dark");
  const now = Date.now();
  const notice = (key, id, title, product, severity, exploited, unfixed, source, minutes, read) => ({
    key, id, title, product, severity, exploited, unfixed, source, at: now - minutes * 60000, read,
  });
  localStorage.setItem(
    "patchy.notices",
    JSON.stringify([
      notice("n1", "CVE-2026-119977", "WordPress Core is vulnerable to Remote Code Execution in versions 4.7 through 7.1.3", "WordPress 7.1", "high", true, false, "WPVulnerability", 4, false),
      notice("n2", "GHSA-673q-mjm6-r5xr", "Next.js: Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays", "next", "critical", false, false, "GitHub", 38, false),
      notice("n3", "CVE-2026-111578", "PDF Invoices & Packing Slips for WooCommerce 5.16.2 - 5.16.4 - Unauthenticated Stored Cross-Site Scripting", "PDF Invoices & Packing Slips for WooCommerce", "high", false, false, "WPVulnerability", 95, true),
      notice("n4", "USN-8974-1", "PCRE2 vulnerabilities", "Ubuntu 24.04 noble", "none", false, false, "Ubuntu", 180, true),
    ]),
  );
};

(async () => {
  const executablePath = findChromium();
  if (!executablePath) throw new Error("No Chromium in ~/Library/Caches/ms-playwright. Run: pnpm exec playwright-core install chromium");
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 1320, height: 840 }, deviceScaleFactor: 1, colorScheme: "dark" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("__fetchJson", fetchJson);
  // The cat button gets the meme from memeHtml() instead of meme-api.com.
  const memePage = await browser.newPage({ deviceScaleFactor: 1 });
  await memePage.setContent(memeHtml());
  const memePng = await memePage.locator("#meme").screenshot();
  await memePage.close();
  const memeJson = {
    title: "Monday morning priorities",
    url: "https://meme-api.com/demo/meme.png",
    postLink: "https://github.com/lakiAlex/patchy",
    subreddit: "ProgrammerHumor",
    nsfw: false,
    spoiler: false,
  };
  await page.route("https://meme-api.com/**", (route) =>
    route.request().url().endsWith(".png")
      ? route.fulfill({ contentType: "image/png", body: memePng })
      : route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(memeJson) }),
  );
  await page.addInitScript(mock);
  await page.goto("http://localhost:1440/");
  // The first load fetches about 75 feeds.
  await page.waitForFunction(() => document.querySelector(".titlebar-status")?.textContent?.startsWith("Updated"), null, { timeout: 180000 });
  await page.waitForTimeout(800);

  fs.mkdirSync(outDir, { recursive: true });
  const frames = [];
  /** Saves a frame that shows for `ms` milliseconds in the GIF. */
  const shot = async (ms) => {
    const file = path.join(outDir, `f${String(frames.length).padStart(3, "0")}.png`);
    await page.screenshot({ path: file });
    frames.push({ file, ms });
  };
  // Keeps the pointer off buttons, so no hover state or tooltip is captured.
  const rest = () => page.mouse.move(1000, 520);
  const click = async (locator, wait = 450) => {
    await locator.click();
    await rest();
    await page.waitForTimeout(wait);
  };
  const view = (label) => page.locator(`.activity-button[aria-label="${label}"]`);

  await rest();
  // 1. Latest: stat cards and the list.
  await shot(2200);
  // 2. Open a critical or high row.
  await click(page.locator(".vuln-row:has(.sev-critical), .vuln-row:has(.sev-high)").first(), 400);
  await shot(2600);
  // 3. Filter to the product with the most open issues in the stack panel.
  await click(page.locator(".stack-row.child").first());
  await shot(1800);
  await click(page.locator('button[aria-label="Clear filter"]'), 300);
  // 4. Only high and critical.
  await click(page.locator(".toolbar .segmented button", { hasText: "High+" }));
  await shot(1800);
  await click(page.locator(".toolbar .segmented button", { hasText: "All" }).first(), 300);
  // 5. No fix yet.
  await click(view("No fix yet"));
  await shot(2200);
  // 6. Exploited in the wild.
  await click(view("Exploited (CISA KEV)"));
  await shot(2200);
  // 7. Collapse the panel by clicking the open view's icon, then open it again.
  await click(view("Exploited (CISA KEV)"), 450);
  await shot(1200);
  await click(view("Exploited (CISA KEV)"), 450);
  // 8. Versions and support.
  await click(view("Versions"));
  await shot(2400);
  // 9. The bell.
  await click(view("Latest"));
  await click(page.locator(".bell-button"), 500);
  await shot(2600);
  await page.keyboard.press("Escape");
  await rest();
  await page.waitForTimeout(300);
  // 10. Settings.
  await click(page.locator('.activity-button[aria-label="Settings"]'), 500);
  await shot(2600);
  await page.keyboard.press("Escape");
  await rest();
  await page.waitForTimeout(300);
  // 11. The cat button.
  await click(page.locator(".meme-button"), 300);
  await page.waitForSelector(".meme-body img:not(.loading)");
  await page.waitForTimeout(200);
  await shot(3400);
  await page.keyboard.press("Escape");
  await rest();
  await page.waitForTimeout(300);
  await shot(1400);

  fs.writeFileSync(path.join(outDir, "frames.json"), JSON.stringify(frames));
  console.log(frames.length, "frames", errors.length ? "page errors:\n" + errors.join("\n") : "no page errors");
  await browser.close();
  if (errors.length) process.exit(1);
})();
