# Making the README GIF

`docs/demo.gif` is the animated screenshot at the top of the README. It is recorded from Patchy's real frontend in headless Chrome, with the same public feeds the app uses, so it shows the data of the day it was recorded.

## Record it

```sh
pnpm install
pnpm exec playwright-core install chromium   # once, if ~/Library/Caches/ms-playwright has no Chromium
python3 -m pip install --user Pillow         # once
scripts/demo-gif/run.sh                       # writes docs/demo.gif
```

Stop `pnpm tauri dev` first: the script needs port 1440. To try changes without touching the README, give it another file: `scripts/demo-gif/run.sh /tmp/test.gif`. The first load fetches about 75 feeds, so a run takes a minute or two.

Then update the image's alt text in `README.md` so it describes what the new GIF shows.

## How it works

The files are in `scripts/demo-gif/`:

| File | What it does |
| --- | --- |
| `run.sh` | Starts the Vite dev server, runs the recorder, stops the server and builds the GIF. |
| `record.cjs` | Opens Patchy in headless Chrome through Playwright with a fake Tauri backend, clicks through a short tour and saves a PNG for each frame, with how long it shows. |
| `make-gif.py` | Copied from Lookout. Rounds the window corners, draws the close, minimize and zoom buttons (the page has none), puts all frames on one palette and writes the GIF. |

The fake backend is the `mock` function in `record.cjs`. The page calls one command, `fetch_json`; the mock passes it to Node, which fetches the URL from the same host list as `ALLOWED_HOSTS` in `src-tauri/src/lib.rs`. The page cannot fetch those hosts itself because of CORS.

The bell only fills from refreshes after the first one, so the mock puts four real advisories in `patchy.notices` before the page loads.

The cat button calls meme-api.com from the page. The recorder answers that with `page.route`: the JSON points at a PNG the recorder made from `memeHtml()`.

The tour is the list of steps at the end of `record.cjs`. `shot(ms)` saves a frame that stays on screen for `ms` milliseconds. `rest()` moves the pointer away so no hover state or tooltip ends up in a frame.

## What the GIF shows

- Latest with the stat cards, and an expanded critical or high row.
- A product picked in the stack panel, and the High+ filter.
- No fix yet and Exploited.
- The panel hidden and shown by clicking the open view's icon.
- Versions and support.
- The bell with new items, and Settings.
- The cat button with a meme. The meme is made by `memeHtml()` in `record.cjs` from two Hugeicons faces, and the recorder answers meme-api.com with it, so no Reddit image ends up in the GIF.

Dark mode only. Keep it under about 30 seconds and 3 MB.

## When the app changes

- **A new Tauri command** that the page calls needs an answer in `handlers` in `record.cjs`. The recorder prints page errors and stops when there are any.
- **A renamed button or class** breaks the tour step that clicks it. The steps find elements by `aria-label` and class names like `.bell-button`, `.stack-row` and `.vuln-row`.
- **A new feed host** goes in `ALLOWED` in `record.cjs` as well as in `lib.rs`.

Look at a few frames before using it. This prints the frame count and saves frame 5 as a PNG:

```sh
python3 -E -c "from PIL import Image; im = Image.open('docs/demo.gif'); print(im.n_frames); im.seek(5); im.convert('RGB').save('/tmp/frame.png')"
```

## The title image

`docs/title-dark.png` and `docs/title-light.png` are the app icon and the name, as in Lookout's README. `node scripts/make-title.cjs` renders both from `src-tauri/icons/AppIcon.icon/Assets/background.png`.
