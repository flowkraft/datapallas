#!/bin/sh
# Stops the test email server started by startTestEmailServer.sh - the twin of shutTestEmailServer.bat.
# Stopping empties the inbox (MailHog keeps it in memory). Nothing running is not an error.

NAME="${DATAPALLAS_TEST_EMAIL_SERVER_CONTAINER:-mailhog}"

docker stop "$NAME" > /dev/null 2>&1
exit 0
