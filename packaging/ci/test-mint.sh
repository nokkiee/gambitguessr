#!/usr/bin/env bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ./dist/gambitguessr_*_amd64.deb xvfb xauth fuse3 >/dev/null
apt-get remove -y -qq 'libfuse2*' >/dev/null 2>&1 || true
set +x
bash packaging/ci/smoke.sh ".deb package" gambitguessr
bash packaging/ci/appimage.sh
