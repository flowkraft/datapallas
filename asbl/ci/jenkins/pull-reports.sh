#!/bin/bash
# Stream the report files of a CI run as a tar.gz on stdout. A Jenkinsfile runs it on the host over SSH and unpacks
# the stream into the build's workspace, because the CI runs on the host and a Jenkins build only has its workspace:
#
#   ssh "$DP_HOST" "cd $DP_REPO && set -f && bash asbl/ci/jenkins/pull-reports.sh <path-or-glob>..." | tar xzf - -C reports
#
# A path is one of:
#   - relative to the repository root (where this is run), globs allowed: bkend/*/target/surefire-reports
#     (the quoting above, `set -f`, hands the globs to this script unexpanded). Keeps its folders in the archive.
#   - absolute: packed flat, under its own name (reports/<name>), e.g. a file of the log folder.
#   - @run/<suffix>: the file `<newest run log without .log><suffix>` of the log folder, e.g. @run/-playwright.xml
#     is <ts>-e2e-<sha>-playwright.xml next to the newest run's log (`latest.log`, or $CI_LOG_LINK). Packed flat.
# A path that does not exist is skipped: a red run may not have produced every report. Nothing found = an empty
# archive. This script never fails and never fails a build: reports are shown, not enforced. Messages go to stderr,
# which Jenkins shows in the console.
set -u
shopt -s nullglob

LOG_LINK="${CI_LOG_LINK:-/var/kraft-internalsystems/logs/datapallas-ci/latest.log}"

[ "$#" -gt 0 ] || { echo "pull-reports: no path given, nothing to pull" >&2; printf '' | gzip -c; exit 0; }

args=()
found=()
for pattern in "$@"; do
  case "$pattern" in
    @run/*)
      latest=$(readlink -f "$LOG_LINK" 2>/dev/null || true)
      if [ -z "$latest" ] || [ ! -e "$latest" ]; then echo "pull-reports: no run log at $LOG_LINK, skipping $pattern" >&2; continue; fi
      pattern="${latest%.log}${pattern#@run/}" ;;
  esac
  matched=0
  for m in $pattern; do
    [ -e "$m" ] || continue
    case "$m" in
      /*) args+=(-C "$(dirname "$m")" "$(basename "$m")") ;;
      *)  args+=(-C "$PWD" "$m") ;;
    esac
    found+=("$m"); matched=1
  done
  [ "$matched" -eq 1 ] || echo "pull-reports: not found: $pattern" >&2
done

if [ "${#found[@]}" -eq 0 ]; then
  printf '' | gzip -c
  exit 0
fi

echo "pull-reports: pulling ${#found[@]} path(s): ${found[*]}" >&2
tar -czf - "${args[@]}" 2>/dev/null || true
exit 0
