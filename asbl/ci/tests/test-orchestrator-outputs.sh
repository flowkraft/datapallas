#!/bin/bash
# What a release orchestrator run leaves in its run folder (asbl/ci/jenkins/release-orchestrator.sh, THE RUN FOLDER):
#   1. result.txt and started.txt of a green dry run, and of a DRY_RUN_RED="build pack" dry run;
#   2. flaky.txt's reader on fixtures/playwright-flaky.json, a real Playwright report (a Windows Docker light set of
#      2026-11-01) trimmed to its suites, titles and each try's status: Playwright counts two flaky tests there, one passed
#      on its retry (listed) and one whose retry was skipped (a failure, not listed);
#   3. memory.log's sampler, with stub docker and ssh commands.
# The dry runs are in 16.6.2's order (RELEASE_STEPS=in-order), whose parts the cases name; the steps together, the
# default, leave the same files: asbl/ci/tests/test-step-independence.sh checks their parts and verdicts.
# Every folder is a scratch one, and docker, ssh and virsh (every VM running at 12 GB) are stubs first on PATH that record each call: nothing is started,
# no live folder is touched, no machines file of this host is read. Takes about 40 seconds (a dry run's part lasts two
# seconds).
# Callers: a person or an agent, from the shell, after changing the orchestrator.
#   bash asbl/ci/tests/test-orchestrator-outputs.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
REPO_ROOT=$PWD
ORCHESTRATOR=asbl/ci/jenkins/release-orchestrator.sh
FIXTURE=asbl/ci/tests/fixtures/playwright-flaky.json
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-orchestrator-outputs.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
same() {  # same <expected> <actual>: equal, or both printed
  [ "$1" = "$2" ] && return 0
  printf '      expected: %s\n      actual:   %s\n' "$1" "$2"; return 1
}

# ---- the stubs ----
STUBS="$SCRATCH/stubs"; mkdir -p "$STUBS"
export STUB_CALLS="$SCRATCH/calls.log"
: > "$STUB_CALLS"
cat > "$STUBS/docker" <<'STUB'
#!/bin/bash
# stub docker: records the call; ps lists two containers of the run and one that is not; stats answers for each name
echo "docker $*" >> "$STUB_CALLS"
case "${1:-}" in
  ps) printf 'dp-ci|\ndocker-server-datapallas-1|%s\nsomeone-elses-container|\n' "$STUB_BUNDLE" ;;
  stats) shift
    for arg in "$@"; do case "$arg" in --*|*'{{'*) ;; *) printf '%s|101.5%%|9.5GiB / 125GiB|7.6%%\n' "$arg" ;; esac; done ;;
esac
STUB
cat > "$STUBS/ssh" <<'STUB'
#!/bin/bash
# stub ssh: records the call; answers as Windows would to the memory script, or fails to connect when STUB_SSH_DOWN=1
echo "ssh $*" | cut -c1-400 >> "$STUB_CALLS"
[ "${STUB_SSH_DOWN:-0}" = 1 ] && { echo "ssh: connect to host vm.invalid port 22: Connection timed out" >&2; exit 255; }
echo "committed=8589934592 commit_peak=12884901888 commit_limit=21474836480 physical_total=17179869184 physical_available=4294967296"
STUB
cat > "$STUBS/virsh" <<'STUB'
#!/bin/bash
# stub virsh: every VM is running, 12 GB defined (a round's VMs: nothing to set, start or shut down)
case "${1:-}" in
  domstate) echo running ;;
  dumpxml)  printf "<domain>\n  <memory unit='KiB'>12582912</memory>\n  <currentMemory unit='KiB'>12582912</currentMemory>\n</domain>\n" ;;
  *)        exit 1 ;;
esac
STUB
chmod +x "$STUBS/docker" "$STUBS/ssh" "$STUBS/virsh"
export PATH="$STUBS:$PATH"
# the Windows VM's settings for dp-ci.sh win ps: made-up ones, and no win-ci.env read
export WIN_CI_CONF="$SCRATCH/no-win-ci.env" WIN_HOST=vm.invalid WIN_USER=ci WIN_SSH_KEY="$SCRATCH/no-key" WIN_KNOWN_HOSTS="$SCRATCH/no-known-hosts"
export STUB_BUNDLE="$REPO_ROOT/frend/reporting/testground/docker-server/DataPallas"
export RELEASE_REHEARSAL_CONF="$SCRATCH/no-release-rehearsal.conf"

# ---- 1. result.txt and started.txt of two dry runs ----
# dry_run <name> [DRY_RUN_RED]: a dry run on scratch folders, in 16.6.2's order; prints its run folder
dry_run() {
  local dir="$SCRATCH/$1"
  mkdir -p "$dir/logs" "$dir/state" "$dir/artifacts"
  env LOG_DIR="$dir/logs" RUN_RECORD_DIR="$dir/runs" RELEASE_STATE_DIR="$dir/state" RELEASE_ARTIFACTS_DIR="$dir/artifacts" \
    ORCH_STARTED_BY=test-orchestrator-outputs DRY_RUN=yes DRY_RUN_RED="${2:-}" RELEASE_STEPS=in-order bash "$ORCHESTRATOR" > "$dir/console.log" 2>&1
  echo "$?" > "$dir/rc"
  ls -1d "$dir"/runs/*release-orchestrator*/ 2>/dev/null | tail -1
}
key() { sed -n "s/^$2=//p" "$1/result.txt"; }
part_why() { awk -F'\t' -v part="$2" '$1 == "part" && $2 == part { print $7 }' "$1/result.txt"; }
parts() { awk -F'\t' '$1 == "part" { printf "%s%s:%s:%s", sep, $2, $3, $4; sep = " " }' "$1/result.txt"; }
# started <run folder>: the started.txt lines as part:kind:name:real|dry-run, sorted (the tracks write them in parallel)
started() { awk -F'\t' '{ print $2 ":" $3 ":" $4 ":" $5 }' "$1/started.txt" | sort | paste -sd' '; }
# full_lane <run folder>: the full lane step 1 ran (a scratch record has none chosen yet: each dry run draws one at random)
full_lane() { awk -F'\t' '$1 == "part" && $2 ~ /^lane1-/ { print substr($2, 7) }' "$1/result.txt"; }
# expected_started <scratch name> <full lane> [<part left out>]: what started.txt must hold for a dry run, in started()'s form
expected_started() {
  local w="$SCRATCH/$1/logs/win-e2e.pid" b="$STUB_BUNDLE" lane1="lane1-$2:container:dp-ci:dry-run"
  [ "$2" = docker-server-full ] && lane1="$lane1 lane1-$2:compose:$b:dry-run"
  printf '%s\n' \
    "step1-build:container:dp-ci:dry-run" \
    "lane2-docker-server-auth:container:dp-ci:dry-run" "lane2-docker-server-auth:compose:$b:dry-run" \
    $lane1 \
    "docker-linux:container:dp-ci:dry-run" "docker-linux:compose:$b:dry-run" "docker-linux:container:dp-ci-one-command:dry-run" \
    "windows-pack:pidfile:$w:dry-run" "windows-pack:vm:windows-vm:dry-run" \
    "docker-windows:pidfile:$w:dry-run" "docker-windows:vm:windows-vm:dry-run" \
    "windows-after-pack:pidfile:$w:dry-run" "windows-after-pack:vm:windows-vm:dry-run" |
    grep -v "^${3:-none}:" | sort | paste -sd' '
}

PIN=$(git rev-parse origin/main)
VERSION=$(git show "$PIN:bkend/reporting/src/main/external-resources/template/config/burst/settings.xml" | grep -m1 -oP '(?<=<version>)[^<]+')

GREEN=$(dry_run green)
check "green dry run: a run folder with result.txt and started.txt" test -s "$GREEN/result.txt" -a -s "$GREEN/started.txt"
FULL=$(full_lane "$GREEN")
check "green dry run: exit 0" same 0 "$(cat "$SCRATCH/green/rc")"
check "green dry run: result=green dry_run=yes execution=1 step1=green" \
  same "green yes 1 green" "$(key "$GREEN" result) $(key "$GREEN" dry_run) $(key "$GREEN" execution) $(key "$GREEN" step1)"
check "green dry run: the pin is origin/main, the version the tree's at the pin, nothing kept" \
  same "$PIN $VERSION " "$(key "$GREEN" pin) $(key "$GREEN" version) $(key "$GREEN" kept)"
check "green dry run: summary= and flaky= name files of the run folder" \
  same "${GREEN%/}/run.log ${GREEN%/}/flaky.txt" "$(key "$GREEN" summary) $(key "$GREEN" flaky)"
check "green dry run: one line per part, each PASS on its machine" same \
  "step1-build:host:PASS lane2-docker-server-auth:host:PASS lane1-$FULL:host:PASS build:host:PASS linux-proof:host:PASS pack:windows-vm:PASS windows-docker-proof:windows-vm:PASS server-light:windows-vm:PASS electron-light:windows-vm:PASS robot:windows-vm:PASS docker-verdict:host:PASS windows-verdict:windows-vm:PASS" \
  "$(parts "$GREEN")"
check "green dry run: no flaky test (a dry run has no reports), and the summary says so" \
  eval '[ ! -s "$GREEN/flaky.txt" ] && grep -q "^FLAKY   none" "$GREEN/run.log"'
check "green dry run: started.txt names what each part starts, every line dry-run" same "$(expected_started green "$FULL")" "$(started "$GREEN")"
check "green dry run: memory.log is a real run's only" test ! -e "$GREEN/memory.log"

RED=$(dry_run red "build pack")
FULL=$(full_lane "$RED")
check "red dry run (DRY_RUN_RED=\"build pack\"): exit 1" same 1 "$(cat "$SCRATCH/red/rc")"
check "red dry run: result=red, step 1 still green" same "red green" "$(key "$RED" result) $(key "$RED" step1)"
check "red dry run: build and pack FAIL, what needs them NOT_RUN (the server light set installs the pack's zip), the Electron light set still PASS" same \
  "step1-build:host:PASS lane2-docker-server-auth:host:PASS lane1-$FULL:host:PASS build:host:FAIL linux-proof:host:NOT_RUN pack:windows-vm:FAIL windows-docker-proof:windows-vm:NOT_RUN server-light:windows-vm:NOT_RUN electron-light:windows-vm:PASS robot:windows-vm:NOT_RUN docker-verdict:host:NOT_RUN windows-verdict:windows-vm:FAIL" \
  "$(parts "$RED")"
check "red dry run: a part that did not pass says why" eval 'part_why "$RED" build | grep -q "build red (DRY_RUN_RED)"'
check "red dry run: started.txt has no line for a part that never started (docker-windows)" \
  same "$(expected_started red "$FULL" docker-windows)" "$(started "$RED")"
check "dry runs: no docker or ssh call" same "" "$(cat "$STUB_CALLS")"

# ---- 2. the flaky reader on a real Playwright report ----
check "fixture: Playwright counts 2 flaky tests in it" \
  same 2 "$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["stats"]["flaky"])' "$FIXTURE")"
FLAKY=$(bash "$ORCHESTRATOR" flaky windows-docker-proof "$FIXTURE")
check "flaky reader: one test, the one that passed on its retry, with its part, file:line and report" same \
  "$(printf 'windows-docker-proof\tCube widgets — the two publishing modes > The same selection, published both ways, answers the same rows\tspecs/areas/cube-modes-parity.spec.ts:167\t%s' "$FIXTURE")" \
  "$FLAKY"
check "flaky reader: the test whose retry was skipped is not flaky (it never passed)" \
  eval '! printf "%s\n" "$FLAKY" | grep -q "21_northwind_sales_dashboard"'
check "flaky reader: an unreadable report is a warning, not a line" \
  eval '[ -z "$(bash "$ORCHESTRATOR" flaky lane1 "$SCRATCH/missing.json" 2>/dev/null)" ]'

# ---- 3. the memory sampler ----
SAMPLE="$SCRATCH/sample"; mkdir -p "$SAMPLE"
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
  2026-11-03T17:00:00Z docker-linux container dp-ci real "the run container" \
  2026-11-03T17:00:00Z docker-linux compose "$STUB_BUNDLE" real "the bundle" \
  2026-11-03T17:00:00Z docker-linux container dp-ci-one-command real "gone by now" \
  2026-11-03T17:00:00Z windows-pack vm windows-vm real "dp-ci.sh win release" \
  2026-11-03T17:00:00Z step1-build container someone-elses-container dry-run "a dry run's line: never sampled" > "$SAMPLE/started.txt"
: > "$STUB_CALLS"
bash "$ORCHESTRATOR" memory-sample "$SAMPLE"
check "sampler: one free -m line of this host" \
  same 1 "$(grep -cP '^[0-9TZ:-]+\thost\tfree -m\ttotal=\d+ used=\d+ .*available=\d+ swap_total=' "$SAMPLE/memory.log")"
check "sampler: docker stats of the run's running containers only (dp-ci, the bundle's), one call" same \
  "$(printf 'host\tcontainer %s\tcpu=101.5%% mem=9.5GiB / 125GiB mem_percent=7.6%%\n' docker-server-datapallas-1 dp-ci | paste -sd' ')" \
  "$(grep -P '\tcontainer ' "$SAMPLE/memory.log" | cut -f2- | sort | paste -sd' ')"
check "sampler: docker stats --no-stream called once" same 1 "$(grep -c '^docker stats --no-stream' "$STUB_CALLS")"
check "sampler: the VM's memory over ssh (dp-ci.sh win ps)" same \
  "$(printf 'windows-vm\tmemory\t')committed=8589934592 commit_peak=12884901888 commit_limit=21474836480 physical_total=17179869184 physical_available=4294967296" \
  "$(grep -P '\twindows-vm\t' "$SAMPLE/memory.log" | cut -f2-)"
check "sampler: ssh ran PowerShell on the VM" eval 'grep -q "^ssh .* ci@vm.invalid powershell -NoProfile -NonInteractive -EncodedCommand" "$STUB_CALLS"'
STUB_SSH_DOWN=1 bash "$ORCHESTRATOR" memory-sample "$SAMPLE"
check "sampler: a VM that does not answer is said, and the sample goes on" same \
  "2 1" "$(grep -c 'free -m' "$SAMPLE/memory.log") $(grep -cP '\twindows-vm\tmemory\tnot answering' "$SAMPLE/memory.log")"

echo
[ "$FAILED_CASES" = 0 ] && { echo "ALL PASS  test-orchestrator-outputs"; exit 0; }
echo "FAILED  $FAILED_CASES case(s)  test-orchestrator-outputs"; exit 1
