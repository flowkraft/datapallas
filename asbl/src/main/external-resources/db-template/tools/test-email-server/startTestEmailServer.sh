#!/bin/sh
# Starts the test email server (MailHog: SMTP on 1025, web UI on 8025) - the twin of startTestEmailServer.bat.
# Windows runs the bundled MailHog executable; on Linux and macOS MailHog runs as a Docker container,
# described by internal/docker-compose.yml, the same way every other container DataPallas starts is.
# Its inbox lives in memory, so every start after a stop begins with an empty inbox, as on Windows.
# DATAPALLAS_TEST_EMAIL_SERVER_CONTAINER names the container (default: mailhog - the DataPallas Server
# bundle's own service has that name, so there this starts the bundle's MailHog).

NAME="${DATAPALLAS_TEST_EMAIL_SERVER_CONTAINER:-mailhog}"
export DATAPALLAS_TEST_EMAIL_SERVER_CONTAINER="$NAME"
INTERNAL="$(cd "$(dirname "$0")" && pwd)/internal"

# A container of that name already here is this tool's MailHog from an earlier start, or the one the
# DataPallas Server bundle declares in its own docker-compose.yml. Either way it is the test email server
# this installation is meant to use: start it again rather than let a second compose project fight it for
# the name and the two ports.
docker start "$NAME" > /dev/null 2>&1 && exit 0

# Nothing to reuse, so bring it up from this tool's own compose file. It joins the shared 'datapallas'
# network, so a DataPallas Server that itself runs in Docker reaches it by container name
# (ContainerAddresses re-addresses localhost:1025/8025 to mailhog:1025/8025 only for containers on that
# network); the published ports keep it reachable at localhost for an installation that runs on the host.
if ! docker compose -f "$INTERNAL/docker-compose.yml" up -d; then
    echo "ERROR - could not start the test email server (MailHog)." >&2
    exit 1
fi
