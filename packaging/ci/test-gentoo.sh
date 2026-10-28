#!/usr/bin/env bash
# Installs the ebuild from a local overlay, with Gentoo's official binary packages for
# the dependencies (so GTK and friends don't have to compile).
set -euxo pipefail
emerge-webrsync -q
eselect profile set default/linux/amd64/23.0/desktop
command -v getuto >/dev/null || emerge -q app-portage/getuto
getuto
cat >> /etc/portage/make.conf <<'CONF'
FEATURES="${FEATURES} getbinpkg binpkg-request-signature"
EMERGE_DEFAULT_OPTS="--jobs=4 --load-average=4 --quiet-build=y --usepkg --binpkg-respect-use=y"
ACCEPT_LICENSE="*"
CONF
mkdir -p /etc/portage/package.accept_keywords /etc/portage/repos.conf /var/db/repos/local/{metadata,profiles}
echo 'games-board/gambitguessr-bin ~amd64' > /etc/portage/package.accept_keywords/gambitguessr
echo local > /var/db/repos/local/profiles/repo_name
printf 'masters = gentoo\nthin-manifests = true\n' > /var/db/repos/local/metadata/layout.conf
printf '[local]\nlocation = /var/db/repos/local\n' > /etc/portage/repos.conf/local.conf
cp -r packaging/gentoo/games-board /var/db/repos/local/
ver=$(ls dist/gambitguessr-*.tar.gz | sed -E 's/.*gambitguessr-(.*)\.tar\.gz/\1/')
cp dist/gambitguessr-"$ver".tar.gz /var/cache/distfiles/
ebuild_file=/var/db/repos/local/games-board/gambitguessr-bin/gambitguessr-bin-"$ver".ebuild
ebuild "$ebuild_file" manifest
emerge --autounmask=y --autounmask-write=y --autounmask-continue=y games-board/gambitguessr-bin x11-misc/xvfb-run x11-apps/xauth
set +x
bash packaging/ci/smoke.sh "Gentoo ebuild (gambitguessr-bin)" gambitguessr
