#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Starts the JasperReports 6 renderer as a REST service.
#
#    POST http://localhost:9095/api/reports/render
#    GET  http://localhost:9095/api/health
#
#  Use this when something else needs to render classic reports over HTTP, or
#  when you are rendering enough of them that a container start per report
#  hurts. For a one-off report, jr.sh is simpler and needs nothing running.
#
#  Optional environment variables:
#    JASPER_LEGACY_PORT      port to listen on          (default 9095)
#    JASPER_LEGACY_REPORTS   folder holding the reports (default ../../config/reports-jasper-legacy)
# ---------------------------------------------------------------------------
set -uo pipefail

# Where this installation is on the machine that runs Docker. On the desktop, and on a Server on the host
# JVM, that is this machine and the answer is empty - nothing below changes. In the DataPallas Docker
# server this script runs inside the container while the daemon is the host's, so a path in here ("/app/db")
# means nothing to it: it would silently create empty folders and the renderer would start blind. The
# container's own mounts say where /app came from, which is the answer in the daemon's own form
# (plan §3 O19, §4 F2n). DATAPALLAS_HOST_DIR overrides it for anyone who mounts things differently.
host_install_dir() {
	[ -f /.dockerenv ] || return 0
	if [ -n "${DATAPALLAS_HOST_DIR:-}" ]; then
		printf '%s' "$DATAPALLAS_HOST_DIR"
		return 0
	fi
	command -v docker >/dev/null 2>&1 || return 0
	docker inspect "$(cat /etc/hostname 2>/dev/null)" \
		--format '{{range .Mounts}}{{.Destination}} {{.Source}}{{"\n"}}{{end}}' 2>/dev/null |
		awk -v here="$1/config" '$1 == here { sub(/\/config$/, "", $2); print $2; exit }'
}

INTERNAL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/internal"
export JASPER_LEGACY_PORT="${JASPER_LEGACY_PORT:-9095}"

# The compose file mounts four folders of this installation with paths relative to itself. That is right
# everywhere except inside the DataPallas Docker server, where the daemon is the host's: there each one is
# named absolutely, as the host has it, so the renderer sees the real reports, templates, databases and
# drivers instead of four empty folders (plan §3 O19). Anything already set by hand is kept.
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST_INSTALL_DIR="$(host_install_dir "$INSTALL_DIR")"
if [ -n "$HOST_INSTALL_DIR" ]; then
	export JASPER_LEGACY_REPORTS="${JASPER_LEGACY_REPORTS:-$HOST_INSTALL_DIR/config/reports-jasper-legacy}"
	export JASPER_LEGACY_TEMPLATES="${JASPER_LEGACY_TEMPLATES:-$HOST_INSTALL_DIR/templates}"
	export JASPER_LEGACY_DB="${JASPER_LEGACY_DB:-$HOST_INSTALL_DIR/db}"
	export JASPER_LEGACY_LIB="${JASPER_LEGACY_LIB:-$HOST_INSTALL_DIR/tools/jasper-legacy/lib}"
	echo "This installation is $HOST_INSTALL_DIR on the host; the renderer mounts its folders from there."
fi

echo "Starting the JasperReports 6 renderer on port $JASPER_LEGACY_PORT ..."
if ! docker compose -f "$INTERNAL/docker-compose.yml" up -d --build api; then
	echo "ERROR - could not start the service. See tools/jasper-legacy/README.md" >&2
	exit 1
fi

cat <<EOF

  REST API   http://localhost:$JASPER_LEGACY_PORT/api/reports/render
  Health     http://localhost:$JASPER_LEGACY_PORT/api/health
  Stop it    ./shutJasperLegacyServer.sh

EOF
