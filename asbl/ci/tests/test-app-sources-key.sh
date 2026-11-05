#!/bin/bash
# The app images' key (app_sources_key in asbl/ci/dp-ci.sh) is the same whoever computes it, whatever their language
# setting. The key hashes the paths an app's images are built from, in sorted order; `sort` follows the caller's locale,
# and under en_US.UTF-8 it ignores underscores, so the AI Hub (_ai-hub, with the build context ../__devcontainer) got
# another key from Jenkins (LANG=en_US.UTF-8) than from a shell under C: 16.6.2's Windows Docker proof read "changed" and
# rebuilt its unchanged images (about 32 min).
# The case runs in a scratch git repository: an app flowkraft/_x whose compose file names the build contexts . and ../__y
# (as the AI Hub's _ai-hub and __devcontainer), and the function and its two settings read from dp-ci.sh. Its key must be
# one key under LC_ALL=C, LC_ALL=C.UTF-8, LC_ALL=en_US.UTF-8 and LANG=en_US.UTF-8 alone (no LC_ variable); a locale this
# machine does not have is skipped, with a note. It fails on the function before the fix (plain `sort -u`).
# Nothing outside the scratch folder is read or written. Takes a second.
# Callers: a person or an agent, after changing app_sources_key.
#   bash asbl/ci/tests/test-app-sources-key.sh
#   DP_CI=<another dp-ci.sh> bash asbl/ci/tests/test-app-sources-key.sh     # the same case on that copy (e.g. an old one)
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
DP_CI="${DP_CI:-asbl/ci/dp-ci.sh}"
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-app-sources-key.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED=1; fi
}

# the function and the two settings it reads, as dp-ci.sh defines them
FUNCTION_TEXT=$(sed -n '/^APPS_IN_REPO=/p; /^APPS_ASSEMBLED_FROM=/p; /^app_sources_key() {/,/^}/p' "$DP_CI")
case "$FUNCTION_TEXT" in
  *"app_sources_key() {"*) ;;
  *) echo "FAIL  setup: no app_sources_key in $DP_CI"; exit 1 ;;
esac
APPS_IN_REPO=$(bash -c "$FUNCTION_TEXT"$'\necho "$APPS_IN_REPO"')

REPO="$SCRATCH/repo"
in_repo() { git -C "$REPO" -c user.name=test -c user.email=test@example.invalid "$@"; }
mkdir -p "$REPO/$APPS_IN_REPO/flowkraft/_x" "$REPO/$APPS_IN_REPO/flowkraft/__y"
printf 'services:\n  web:\n    build:\n      context: .\n  code:\n    build:\n      context: ../__y\n' \
  > "$REPO/$APPS_IN_REPO/flowkraft/_x/docker-compose.yml"
echo 'FROM scratch' > "$REPO/$APPS_IN_REPO/flowkraft/__y/Dockerfile"
in_repo init -q && in_repo add -A && in_repo commit -q -m 'an app with the build contexts . and ../__y'

# key_under <environment...>: the app's key computed by a bash that has only these variables (and PATH, HOME)
key_under() {
  env -i PATH="$PATH" HOME="${HOME:-/root}" "$@" bash -c "$FUNCTION_TEXT"$'\nREPO="$1"; app_sources_key HEAD flowkraft/_x' \
    key_under "$REPO"
}
# has_locale <name>: is that locale installed here (locale -a writes C.utf8 for C.UTF-8)
has_locale() {
  local wanted
  wanted=$(printf '%s' "$1" | sed 's/UTF-8$/utf8/')
  locale -a 2>/dev/null | grep -qix -- "$wanted"
}

echo "---- one key, whatever the caller's language setting ($DP_CI) ----"
REFERENCE=$(key_under LC_ALL=C)
check "LC_ALL=C gives a key" eval '[[ "$REFERENCE" =~ ^[0-9a-f]{40}$ ]]'
for setting in LC_ALL=C.UTF-8 LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8; do
  if ! has_locale "${setting#*=}"; then echo "SKIP  $setting: the locale ${setting#*=} is not installed here"; continue; fi
  key=$(key_under "$setting")
  check "$setting gives the key of LC_ALL=C (${REFERENCE:0:8})" eval '[ "$key" = "$REFERENCE" ] || { echo "      got: $key"; false; }'
done

[ "$FAILED" = 0 ] && { echo "ALL PASS  test-app-sources-key"; exit 0; }
echo "SOME FAILED  test-app-sources-key"; exit 1
