#!/usr/bin/env bash
# Adds GambitGuessr to your application menu when running from source.
# No root needed:  scripts/install-desktop.sh            install
#                  scripts/install-desktop.sh --remove   uninstall
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP="$DATA/applications/gambitguessr.desktop"
ICON_BASE="$DATA/icons/hicolor"

# The app used to be called "Gambit"; drop that launcher so it isn't listed twice.
remove_old_name() {
  rm -f "$DATA/applications/gambit.desktop"
  for s in 16 24 32 48 64 128 256 512; do rm -f "$ICON_BASE/${s}x${s}/apps/gambit.png"; done
}

if [[ "${1:-}" == "--remove" ]]; then
  rm -f "$DESKTOP"
  for s in 16 24 32 48 64 128 256 512; do rm -f "$ICON_BASE/${s}x${s}/apps/gambitguessr.png"; done
  remove_old_name
  command -v update-desktop-database >/dev/null && update-desktop-database "$DATA/applications" || true
  echo "Removed the GambitGuessr launcher."
  exit 0
fi

ELECTRON="$APP_DIR/node_modules/.bin/electron"
[[ -x "$ELECTRON" ]] || { echo "Run 'npm install' in $APP_DIR first." >&2; exit 1; }

remove_old_name
mkdir -p "$DATA/applications"
for s in 16 24 32 48 64 128 256 512; do
  mkdir -p "$ICON_BASE/${s}x${s}/apps"
  cp "$APP_DIR/build/icons/${s}x${s}.png" "$ICON_BASE/${s}x${s}/apps/gambitguessr.png"
done

cat > "$DESKTOP" <<DESKTOP_ENTRY
[Desktop Entry]
Type=Application
Name=GambitGuessr
GenericName=Chess Opening Trainer
Comment=Learn chess openings by naming them and playing their moves
# --no-sandbox: when started by the desktop shell, Chromium falls back to the SUID sandbox helper, which a
# source checkout cannot have set up (it needs root). The .deb package configures the sandbox properly instead.
Exec="$ELECTRON" --no-sandbox "$APP_DIR"
Path=$APP_DIR
Icon=gambitguessr
Terminal=false
Categories=Game;BoardGame;
Keywords=chess;openings;opening;trainer;learn;
StartupWMClass=gambitguessr
DESKTOP_ENTRY

command -v update-desktop-database >/dev/null && update-desktop-database "$DATA/applications" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$ICON_BASE" || true
echo "Installed: $DESKTOP"
echo "GambitGuessr now appears in your application menu."
