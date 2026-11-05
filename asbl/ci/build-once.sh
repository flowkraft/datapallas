#!/bin/bash
# One Linux build per commit, however many parts ask for it at once (the release steps started together: the first part
# that needs the build runs it, another part that needs the same build waits for it and never builds again).
#
# SOURCED by asbl/ci/dp-ci.sh (build-if-needed, a real run only: a dry one only reads which build there is).
#   build_once <lock file> <is-built command> <build command...>
#     built already (the is-built command succeeds): nothing run, BUILD_ONCE=already, exit 0
#     not built: the lock (a file, flock), waited for while another caller holds it (its build going), then asked again:
#       built meanwhile (by that caller): nothing run, BUILD_ONCE=meanwhile, exit 0
#       still not built: the build command under the lock, BUILD_ONCE=built, its exit code
#   The lock is held only while a caller checks and builds, never by the build's own processes; a build that dies frees
#   it with its caller. The build command's output is the caller's; a wait is said on stdout.
# Tested by asbl/ci/tests/test-step-independence.sh (two callers at once: one build).
build_once() {
  local lock="$1" is_built="$2" fd rc; shift 2
  if $is_built; then BUILD_ONCE=already; return 0; fi
  exec {fd}>>"$lock" || { echo "FAIL  cannot open the build lock $lock"; return 2; }
  if ! flock -n "$fd"; then
    echo "BUILD: another part is building (or checking) now: waiting for it to end (lock $lock)"
    flock "$fd"
  fi
  if $is_built; then BUILD_ONCE=meanwhile; rc=0
  else BUILD_ONCE=built; "$@" {fd}>&-; rc=$?; fi
  exec {fd}>&-
  return "$rc"
}
