# Copyright 2026 GambitGuessr contributors
# Distributed under the terms of the GNU General Public License v2

EAPI=8

inherit desktop xdg

DESCRIPTION="Learn chess openings by guessing them, plus mate-in-one puzzles (5 languages)"
HOMEPAGE="https://github.com/nokkiee/gambitguessr"
SRC_URI="https://github.com/nokkiee/gambitguessr/releases/download/v${PV}/gambitguessr-${PV}.tar.gz"
S="${WORKDIR}/gambitguessr-${PV}"

LICENSE="GPL-3+ Apache-2.0 BSD BSD-2 CC0-1.0 GPL-2+ LGPL-2.1 MIT OFL-1.1"
SLOT="0"
KEYWORDS="~amd64"
IUSE="suid"
RESTRICT="mirror strip test"

RDEPEND="
	app-accessibility/at-spi2-core:2
	dev-libs/expat
	dev-libs/glib:2
	dev-libs/nspr
	dev-libs/nss
	media-libs/alsa-lib
	media-libs/mesa[gbm(+)]
	net-print/cups
	sys-apps/dbus
	x11-libs/cairo
	x11-libs/gtk+:3[X]
	x11-libs/libdrm
	x11-libs/libX11
	x11-libs/libxcb
	x11-libs/libXcomposite
	x11-libs/libXdamage
	x11-libs/libXext
	x11-libs/libXfixes
	x11-libs/libxkbcommon
	x11-libs/libXrandr
	x11-libs/pango
	x11-misc/xdg-utils
"

QA_PREBUILT="opt/gambitguessr/*"

src_install() {
	insinto /opt/gambitguessr
	doins -r .
	fperms +x /opt/gambitguessr/{gambitguessr,chrome_crashpad_handler,chrome-sandbox}
	# Only needed on kernels without unprivileged user namespaces.
	use suid && fperms 4711 /opt/gambitguessr/chrome-sandbox
	dosym -r /opt/gambitguessr/gambitguessr /usr/bin/gambitguessr
	domenu gambitguessr.desktop
	newicon -s 512 gambitguessr.png gambitguessr.png
}

pkg_postinst() {
	xdg_pkg_postinst
	if ! use suid; then
		local clone=/proc/sys/kernel/unprivileged_userns_clone max=/proc/sys/user/max_user_namespaces
		if [[ -r ${clone} && $(<"${clone}") == 0 ]] || [[ -r ${max} && $(<"${max}") == 0 ]]; then
			ewarn "Unprivileged user namespaces are disabled on this system, so GambitGuessr's"
			ewarn "sandbox can't start. Re-emerge with USE=suid to fix this."
		fi
	fi
}
