// Writes icon.svg: Hugeicons' BandageIcon (MIT) on the same flat #14120b background as
// Lookout's icon, the glyph at 50% of the icon width. Run from the project root:
//   node src-tauri/icons/source/make-icon.mjs
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --force-device-scale-factor=1 \
//     --window-size=1024,1024 --screenshot="$PWD/src-tauri/icons/source/icon.png" "file://$PWD/src-tauri/icons/source/icon.svg"
// (ImageMagick drops the strokes, so Chrome renders it.)
//   pnpm tauri icon src-tauri/icons/source/icon.png   (then delete the android and ios folders it adds)
import { writeFileSync } from "node:fs";
import { BandageIcon } from "@hugeicons/core-free-icons";

const SIZE = 1024;
const GLYPH = 512;
// The glyph spans 2..22 of its 24-unit box.
const scale = GLYPH / 20;
const offset = (SIZE - GLYPH) / 2 - 2 * scale;
const paths = BandageIcon.map(([, a]) => `<path d="${a.d}"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<rect width="${SIZE}" height="${SIZE}" fill="#14120b"/>
<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#ededed" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
</svg>
`;
writeFileSync(new URL("./icon.svg", import.meta.url), svg);
