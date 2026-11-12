<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/title-dark.png">
  <img src="docs/title-light.png" width="176" height="44" alt="Patchy">
</picture>

Patchy is a macOS security dashboard for a web developer's stack: WordPress core, plugins and themes, PHP, Composer and npm packages, Node.js, nginx, MySQL, MariaDB and Ubuntu servers. It lists new CVEs and advisories, what has no fix yet and what is exploited in the wild, and checks the feeds again every 10 minutes.

![Patchy in use: the Latest view with stat cards and an expanded WordPress core CVE, a plugin picked in the stack panel, the High+ filter, the No fix yet and Exploited views, the stack panel hidden and shown again, Versions and support, the notification bell with new items, Settings, and a meme from the cat button](docs/demo.gif)

It is built with [Tauri 2](https://tauri.app): a Rust backend that fetches and caches the feeds, and a React frontend with the same design as Lookout. The app is about 16 MB, 5.6 MB as a download.

## Why Patchy

- **One list for the whole stack.** WordPress plugins, PHP, npm packages and Ubuntu packages in one place, newest first, instead of six security sites.
- **What has no fix yet.** Issues with no fixed version, or still present in the latest release, have their own view.
- **What is exploited.** Every item is checked against CISA's Known Exploited Vulnerabilities catalog.
- **No accounts or keys.** All feeds are free and public.
- **Fast and native.** A real macOS app built in Rust. No Electron and no bundled browser.

## Features

**Views**

- **Latest**: everything for the stack, newest first, grouped by day. Click a row for the description, affected and fixed versions, CVSS score and links to the CVE, the advisory and the vendor.
- **No fix yet**: issues with no fixed version. For WordPress core, PHP, nginx, MySQL and MariaDB, also issues that still affect the latest release of the branch.
- **Exploited**: items in the CISA KEV catalog, with CISA's due date.
- **Versions**: latest versions and support dates for WordPress, PHP, Node.js, Ubuntu, nginx, MySQL, MariaDB, Laravel and Next.js. Tracked versions are in bold and an end-of-life tracked version is marked. Each product collapses.

**Filtering**

- Four stat cards at the top: no fix yet, exploited in the last 12 months, critical and high in the last 30 days, and everything in the last 7 days. Each shows a 14-day bar chart and works as a filter.
- Search by CVE, product or text, severity (All, Medium+, High+, Critical) and period (7 days to all).
- The stack panel lists every watched product by group (WordPress, PHP, JavaScript, Servers) with counts, and the number without a fix in red. Click a group or a product to filter, and the chevron to collapse a group.
- Click the open view's icon to hide the stack panel, as in Lookout.

**Notifications**

- The bell in the top bar lists new items found by a refresh: by default critical, high and exploited items published in the last 30 days. Click one to open it in the list.
- New items can also go to Notification Center.
- Items that are new since the last refresh get a blue dot in the list.

**Stack**

- The pencil in the sidebar edits the watch list: WordPress plugins and themes, WordPress core, PHP branches, Composer and npm packages, Node.js majors, Ubuntu releases and packages, and nginx, MySQL and MariaDB branches.
- The defaults are the plugins used on the most Maksimer sites, PHP 7.4 to 8.5, Laravel and Filament, Next.js and Payload, Node.js 22 and 24, and Ubuntu 24.04 and 22.04.

**Settings**

- The gear in the sidebar: refresh interval (5, 10, 30 or 60 minutes, or off), which new items to notify about and how recent they must be, Mac notifications, the default period, Ubuntu notices, Node.js releases and other exploited CVEs on or off, interface font (SF Pro or Geist), and memes. It also clears the cache and the notifications.
- Light and dark mode in the top bar.
- The cat button in the corner shows a random meme, as in Lookout.

## Data sources

| Source | Covers |
| --- | --- |
| [WPVulnerability.net](https://www.wpvulnerability.net) | WordPress core, plugins and themes, PHP, nginx, MySQL and MariaDB. Merges Wordfence, Patchstack and CVE records and marks unfixed ones. |
| [OSV.dev](https://osv.dev) | npm and Composer packages: GitHub advisories, and malware records for packages that published malicious versions. |
| [Ubuntu Security Notices](https://ubuntu.com/security/notices) | Updates for the watched packages on each watched release. |
| [nodejs.org](https://nodejs.org/dist/index.json) | Node.js security releases. |
| [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Vulnerabilities known to be exploited. |
| [endoflife.date](https://endoflife.date) | Latest versions and support dates. |

The Rust backend fetches only from these hosts. It keeps a copy of each response in `~/Library/Caches/com.laki.patchy/feeds`, so the app opens with the last data and still shows it when offline. A refresh fetches again when the copy is older than the refresh interval; the CISA catalog (1.5 MB) at most once an hour.

Ubuntu backports fixes into older version numbers, so for PHP, nginx, MySQL and MariaDB the No fix yet view compares against the upstream release, not the Ubuntu package.

## Install

With Homebrew:

```sh
brew trust --cask lakialex/tap/patchy
brew install --cask lakialex/tap/patchy
```

Homebrew only loads casks from other taps once they are trusted, which the first line does.

The build runs on Apple Silicon and Intel Macs and needs macOS 11 or later. Homebrew is the only way to install it.

The app is not signed with an Apple Developer certificate or notarized. The cask removes the quarantine flag after install, so macOS opens it without the "cannot be verified" message.

Patchy checks GitHub for new versions. When one is out, an Update button shows in the title bar with what changed, and Update and restart installs it. Versions from before the update button need one `brew upgrade --cask patchy` to get it.

## Usage stats

Patchy sends one anonymous event to [Aptabase](https://aptabase.com) when it starts, to count how many people use it. The event has the app version, macOS version and locale, with no personal data and nothing about your stack. Aptabase uses the IP address to look up the country and does not store it. Turn it off in Settings, Anonymous usage stats. Builds from source send nothing.

## Build from source

```sh
pnpm install
pnpm tauri build
ditto src-tauri/target/release/bundle/macos/Patchy.app /Applications/Patchy.app
```

## Development

```sh
pnpm install
pnpm tauri dev     # port 1440, so it runs next to Lookout (1430)
```

| Path | What it is |
| --- | --- |
| `src-tauri/src/lib.rs` | The `fetch_json` command: host allowlist, disk cache, and the cached copy when a request fails. |
| `src/lib/feeds.ts` | Fetches every feed and turns them into one list of items. |
| `src/lib/watch.ts` | The watch list and its defaults. |
| `src/lib/settings.ts` | Settings and their defaults. |
| `src/App.tsx` | The window: title bar, sidebar, stack panel, filters and dialogs. |
| `src/components/Update.tsx` | The update button and panel, shared with Lookout, Dispatch and Cells. `VITE_FAKE_UPDATE=1 pnpm tauri dev` shows a made-up update. |
| `src/styles-base.css` | Shared with Lookout and Dispatch. |

The app icon is Hugeicons' BandageIcon as a raised white band on a graphite background, built with Icon Composer so the Dock shows it like the other apps. `src-tauri/icons/make-icon.py` and `src-tauri/icons/build-icon.sh` have the steps. The README GIF and title are described in [docs/demo-gif.md](docs/demo-gif.md).

## Third-party software

| Software | Used for | License |
| --- | --- | --- |
| [Tauri](https://tauri.app) | App framework | MIT or Apache-2.0 |
| [React](https://react.dev) | Interface | MIT |
| [Hugeicons](https://hugeicons.com) | Icons | MIT |
| [Lucide](https://lucide.dev) | The light and dark switch | ISC |
| [Geist](https://vercel.com/font) | Interface font option | OFL-1.1 |

## License

MIT
