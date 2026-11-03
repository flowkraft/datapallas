#!/bin/bash
# The label of a release job's build in the Jenkins build list, so the list says what happened without opening the log.
# The step 0, 2 and 3 Jenkinsfiles keep the run's output in release-run.out, pipe it to this script on the host in
# post { always } (a red build is labelled too) and set currentBuild.description to the one line it prints.
#
#   bash asbl/ci/jenkins/release-label.sh < release-run.out
#
# Read from the output's own result lines, the last one deciding:
#   step 0  (release-set-version.sh)  SET_VERSION_RESULT <label>      the label as it is ("<v> set: <commit>", "nothing done: ...")
#   step 2  (release-docker.sh)       DOCKER_RELEASE_RESULT ...
#   step 3  (dp-ci.sh win release)    RELEASE_RESULT ...
#     nothing to release  -> "nothing to release: <v> is the released version"
#     public=PASS         -> "<v> public (rehearsal of <commit>)", or "<v> public: rehearsed first, then copied"
#     public=DRY_RUN      -> "<v> dry run: would copy the rehearsal of <commit>"
#     MODE=public, UPLOAD=no -> "REFUSED: MODE=public needs UPLOAD=yes"
#     proven, UPLOAD=no   -> "<v> proven and kept, nothing uploaded (UPLOAD=no)" (rehearsal=PASS ... upload=no, or stage=SKIPPED)
#     rehearsal passed    -> "<v> rehearsal passed" (rehearsal=PASS, or pack, keep, light, robot and stage PASS)
#   MODE=upload (release-publish.sh upload-kept)  UPLOAD_KEPT PASS|CHECKED|REFUSED|FAIL ...
#     PASS -> "<v> kept files uploaded", CHECKED -> "<v> kept files checked, nothing uploaded", REFUSED -> "upload REFUSED:
#     see the log", FAIL -> "upload FAILED: see the log"
#     refused by the gate -> "REFUSED by the version gate: see the log"
#     anything else       -> "<v> FAILED: see the log"
#   no result line: "<v> prerequisites missing: see the log" after the prerequisites (release-publish.sh preflight),
#   "<v> REFUSED: step 1 not green on <commit>" after the step 1 guard, "REFUSED by the version gate: see
#   the log" after the gate's refusal, "<v> dry run: nothing done" (or
#   "... would rehearse first, then copy") after a dry run that ended well, else "<v> FAILED: see the log" (a run stopped
#   or broken before its verdict).
# <v> is the version the gate let through (RELEASE_VERSION=), or settings.xml's in the gate's own lines.
set -uo pipefail

out=$(tr -d '\r')
last() { printf '%s\n' "$out" | grep -aE "$1" | tail -1; }
v=$(last '^RELEASE_VERSION=[^ ]+ ' | sed 's/^RELEASE_VERSION=\([^ ]*\) .*/\1/')
[ -n "$v" ] || v=$(last 'settings\.xml says [0-9]' | sed 's/.*settings\.xml says \([^ ,]*\).*/\1/')
vp="${v:+$v }"
dry() {  # the label of a dry run that ended well
  if [ -n "$(last 'rehearsing first')" ]; then echo "${vp}dry run: would rehearse first, then copy"; else echo "${vp}dry run: nothing done"; fi
}

line=$(last '^SET_VERSION_RESULT ')
if [ -n "$line" ]; then echo "${line#SET_VERSION_RESULT }"; exit 0; fi

line=$(last '^UPLOAD_KEPT (PASS|CHECKED|REFUSED|FAIL)')
if [ -n "$line" ]; then
  v=$(last '^UPLOAD_KEPT [a-z ]* of [0-9]' | sed 's/.* of \([0-9][^ ]*\) on .*/\1/'); vp="${v:+$v }"
  case "$line" in
    'UPLOAD_KEPT PASS'*) echo "${vp}kept files uploaded" ;;
    'UPLOAD_KEPT CHECKED'*) echo "${vp}kept files checked, nothing uploaded" ;;
    'UPLOAD_KEPT REFUSED'*) echo "${vp}upload REFUSED: see the log" ;;
    *) echo "${vp}upload FAILED: see the log" ;;
  esac
  exit 0
fi

line=$(last '^(DOCKER_)?RELEASE_RESULT ')
c=$(printf '%s' "$line" | sed -n 's/.* commit=\([^ ]*\).*/\1/p')
case "$line" in
  '')
    if [ -n "$(last '^PREREQUISITES MISSING')" ]; then
      echo "${vp}prerequisites missing: see the log"
    elif g=$(last '^REFUSED: step 1 is not green on '); [ -n "$g" ]; then
      echo "${vp}REFUSED: step 1 not green on $(printf '%s' "$g" | sed 's/^REFUSED: step 1 is not green on \([^:]*\):.*/\1/')"
    elif [ -n "$(last '^FAILED: refused by the version gate')" ]; then
      echo "REFUSED by the version gate: see the log"
    elif [ -n "$(last '^DOCKER_RELEASE=SUCCESS .*dry_run=yes')" ]; then
      dry
    else
      echo "${vp}FAILED: see the log"
    fi ;;
  *' nothing to release'*) echo "nothing to release: $v is the released version" ;;
  *' public=PASS'*)
    if [ -n "$(last 'rehearsing first')" ]; then echo "$v public: rehearsed first, then copied"
    else echo "$v public (rehearsal of $c)"; fi ;;
  *' refused by the version gate'*) echo "REFUSED by the version gate: see the log" ;;
  *' public=DRY_RUN'*) echo "$v dry run: would copy the rehearsal of $c" ;;
  *' refused: MODE=public needs UPLOAD=yes'*) echo "REFUSED: MODE=public needs UPLOAD=yes" ;;
  *' rehearsal=PASS '*' upload=no'*|*' stage=SKIPPED '*) echo "$v proven and kept, nothing uploaded (UPLOAD=no)" ;;
  *' dry run:'*) dry ;;
  *' rehearsal=PASS '*|*' pack=PASS keep=PASS server_light=PASS electron_light=PASS robot=PASS stage=PASS'*) echo "$v rehearsal passed" ;;
  *) echo "${vp}FAILED: see the log" ;;
esac
