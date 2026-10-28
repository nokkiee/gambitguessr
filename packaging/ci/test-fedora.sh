#!/usr/bin/env bash
set -euxo pipefail
dnf -y -q install ./dist/gambitguessr-*.x86_64.rpm xorg-x11-server-Xvfb xorg-x11-xauth fuse3 util-linux shadow-utils which
rpm -q fuse-libs && dnf -y -q remove fuse-libs || true
set +x
bash packaging/ci/smoke.sh ".rpm package" gambitguessr
bash packaging/ci/appimage.sh
