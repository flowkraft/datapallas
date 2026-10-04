#!/bin/bash
# Stream the report files of a CI run as a tar.gz on stdout. A Jenkinsfile runs it on the host over SSH and unpacks
# the stream into the build's workspace, because the CI runs on the host and a Jenkins build only has its workspace:
#
#   ssh "$DP_HOST" "cd $DP_REPO && set -f && bash asbl/ci/jenkins/pull-reports.sh <path-or-glob>..." | tar xzf - -C reports
#
# Paths are relative to the repository root (where it is run) and may hold globs, e.g. bkend/*/target/surefire-reports
# (the quoting above, `set -f`, hands the globs to this script unexpanded). A path that does not exist is skipped: a red
# run may not have produced every report. Nothing found = an empty archive. This script never fails and never
# fails a build: reports are shown, not enforced. Messages go to stderr, which Jenkins shows in the console.
set -u
shopt -s nullglob

[ "$#" -gt 0 ] || { echo "pull-reports: no path given, nothing to pull" >&2; printf '' | gzip -c; exit 0; }

found=()
for pattern in "$@"; do
  matched=0
  for m in $pattern; do
    [ -e "$m" ] && { found+=("$m"); matched=1; }
  done
  [ "$matched" -eq 1 ] || echo "pull-reports: not found: $pattern" >&2
done

if [ "${#found[@]}" -eq 0 ]; then
  printf '' | gzip -c
  exit 0
fi

echo "pull-reports: pulling ${#found[@]} path(s): ${found[*]}" >&2
tar -czf - "${found[@]}" 2>/dev/null || true
exit 0
