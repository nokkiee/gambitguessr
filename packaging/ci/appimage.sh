#!/usr/bin/env bash
# The AppImage must start without the old FUSE 2 library (libfuse.so.2), using FUSE 3.
set -euo pipefail
if ldconfig -p | grep -q 'libfuse.so.2'; then echo "libfuse.so.2 is installed; remove it first"; exit 1; fi
install -m 755 dist/GambitGuessr-*.AppImage /tmp/GambitGuessr.AppImage
bash packaging/ci/smoke.sh "AppImage (no libfuse2)" /tmp/GambitGuessr.AppImage
