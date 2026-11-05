#!/bin/sh
# Rebuilds Assets.car and icon.icns from AppIcon.icon (Icon Composer format), as in Lookout.
# macOS 26 draws a light border around apps that only ship a legacy .icns, so the
# bundle also carries Assets.car, selected by CFBundleIconName in ../Info.plist.
# AppIcon.icon/Assets/background.png is source/icon.png (see source/make-icon.mjs).
# After replacing it, run `pnpm tauri icon src-tauri/icons/source/icon.png` from the project root,
# delete the android and ios folders it adds, then run this script (tauri icon overwrites icon.icns).
set -e
cd "$(dirname "$0")"
out=$(mktemp -d)
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun actool "$PWD/AppIcon.icon" \
  --compile "$out" --app-icon AppIcon --platform macosx --target-device mac \
  --minimum-deployment-target 11.0 --output-partial-info-plist "$out/partial.plist" >/dev/null
cp "$out/Assets.car" Assets.car
cp "$out/AppIcon.icns" icon.icns
rm -r "$out"
echo "Updated Assets.car and icon.icns"
