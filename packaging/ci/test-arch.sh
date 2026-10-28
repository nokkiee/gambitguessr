#!/usr/bin/env bash
set -euxo pipefail
pacman -Syu --noconfirm --needed xorg-server-xvfb xorg-xauth fuse3 base-devel >/dev/null
pacman -Q fuse2 >/dev/null 2>&1 && pacman -Rdd --noconfirm fuse2 || true
pacman -U --noconfirm dist/gambitguessr-*.pacman
set +x
bash packaging/ci/smoke.sh "pacman package" gambitguessr
bash packaging/ci/appimage.sh

# The AUR recipe: build it with makepkg from the tarball, install, start.
set -x
pacman -R --noconfirm gambitguessr
id builder >/dev/null 2>&1 || useradd -m builder
install -d -o builder /home/builder/aur
install -m 644 -o builder packaging/arch/PKGBUILD packaging/arch/.SRCINFO packaging/arch/*.install dist/gambitguessr-*.tar.gz /home/builder/aur/
su builder -c 'cd ~/aur && makepkg --printsrcinfo | diff - .SRCINFO'
su builder -c 'cd ~/aur && makepkg --noconfirm --skipchecksums'
pacman -U --noconfirm /home/builder/aur/gambitguessr-bin-*.pkg.tar.zst
set +x
bash packaging/ci/smoke.sh "AUR PKGBUILD (gambitguessr-bin)" gambitguessr
