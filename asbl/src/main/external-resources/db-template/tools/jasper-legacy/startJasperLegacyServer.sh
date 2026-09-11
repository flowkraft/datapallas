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

INTERNAL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/internal"
export JASPER_LEGACY_PORT="${JASPER_LEGACY_PORT:-9095}"

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
