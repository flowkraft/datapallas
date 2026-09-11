#!/usr/bin/env bash
# Stops the JasperReports 6 REST service. jr.sh keeps working without it.
set -uo pipefail

INTERNAL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/internal"

echo "Stopping the JasperReports 6 renderer ..."
exec docker compose -f "$INTERNAL/docker-compose.yml" down
