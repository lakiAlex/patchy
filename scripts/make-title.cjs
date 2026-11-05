// Renders docs/title-dark.png and docs/title-light.png, the README heading:
// the app icon and the name, as in Lookout's README. Uses Chromium from
// Playwright's cache (pnpm exec playwright-core install chromium).
//
//   node scripts/make-title.cjs
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright-core");

const root = path.join(__dirname, "..");
const icon = fs.readFileSync(path.join(root, "src-tauri/icons/source/icon.png")).toString("base64");

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

// GitHub's text colors for its dark and light themes.
const VARIANTS = { dark: "#f0f6fc", light: "#1f2328" };

(async () => {
  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, color] of Object.entries(VARIANTS)) {
    await page.setContent(`<body style="margin:0;background:transparent">
      <div id="t" style="display:inline-flex;align-items:center;gap:28px;padding:4px 4px 4px 0">
        <img src="data:image/png;base64,${icon}" style="width:80px;height:80px;border-radius:18px">
        <span style="font:700 76px/1 -apple-system,'SF Pro Display',sans-serif;letter-spacing:-0.02em;color:${color}">Patchy</span>
      </div></body>`);
    await page.locator("#t").screenshot({ path: path.join(root, `docs/title-${name}.png`), omitBackground: true });
  }
  await browser.close();
  console.log("Wrote docs/title-dark.png and docs/title-light.png");
})();
