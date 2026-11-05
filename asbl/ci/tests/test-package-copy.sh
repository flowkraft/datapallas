#!/bin/bash
# One e2e package per pin, from the pack (asbl/ci/dp-ci.sh: win_package_ready, win_package_pull, win_package_put,
# win_package_from_pack, win_package_archive_by_hand), against two stub VMs. The cases:
#   1. package-ready: no log, an earlier pack's log (written before this pack's start on the VM's clock, the line in it),
#      this pack's log before the line: WAIT; the line and every check: YES; a check not met: NO; a check a pack cannot
#      change (the commit, the modules' lock) not met: NO at once, before the line; no start time: NO;
#   2. package-pull on VM a: waits for the line (it comes after a few looks), then the archive here with its record (the
#      VM's sha256, its file count, the pin) and nothing left on the VM; an earlier pack's log and the pack's part ended:
#      no copy, <archive>.none says the pack ended before its NoExeAssembler finished; no record of the modules' npm ci:
#      no copy, said at the first look; a copy red (the archive brought here is not the VM's): no copy, no archive left
#      here;
#   3. package on VM b: its stamp the pin's already: nothing copied; the record there: the old package and stamp removed
#      first, the archive put and unpacked (the same files), the stamp written last; <archive>.none, the pull ended with no
#      record, a copy red on the VM (sha256): the VM prepares its own (pack-prepare-for-e2e.bat), no stamp of the copy;
#   4. package-archive by hand: refused when the VM's stamp is not its checkout's commit.
# The stubs (ssh, scp: python3, first on PATH) keep each VM's checkout, stamp, package folder and pack log in a scratch
# folder; PowerShell scripts are decoded and answered as the VM would. Nothing reaches a VM or this host's folders. About
# half a minute.
# Callers: a person or an agent, from the shell, after changing how a round's VMs take the pack's e2e package.
#   bash asbl/ci/tests/test-package-copy.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-package-copy.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
has() {  # has <text> <output>: the output holds the text, else it is printed
  grep -qF -- "$1" <<< "$2" && return 0
  echo "      no \"$1\" in:"; printf '%s\n' "$2" | tail -8 | sed 's/^/        /'; return 1
}
same() {  # same <expected> <actual>
  [ "$1" = "$2" ] && return 0
  printf '      expected: %s\n      actual:   %s\n' "$1" "$2"; return 1
}

# ---- the stubs: ssh and scp answer as two Windows VMs, a (the pack's) and b ----
export STUB="$SCRATCH/stub"; mkdir -p "$STUB/bin"
cat > "$STUB/bin/ssh" <<'EOF'
#!/usr/bin/env python3
# stub ssh: the VM named by the host (vm-<name>.invalid), its state in $STUB/vm-<name>/: head, short, dirty, lockrec
# (ok, missing, other), packlog_ticks, line_after (the look from which the pack log holds the line; none = never),
# now_ticks; fs/pkg = asbl\target\package, fs/tmp = C:\dp-ci\tmp. Every call that changes the VM is logged in $STUB/calls
import base64, hashlib, os, re, shutil, subprocess, sys
STUB = os.environ["STUB"]
args = sys.argv[1:]
at = next(i for i, a in enumerate(args) if a.endswith(".invalid") and "@" in a)
vm = args[at].split("@", 1)[1].split(".")[0][len("vm-"):]
V = os.path.join(STUB, "vm-" + vm)
PKG, TMP = os.path.join(V, "fs", "pkg"), os.path.join(V, "fs", "tmp")
os.makedirs(PKG, exist_ok=True); os.makedirs(TMP, exist_ok=True)
words = args[at + 1:]
def rd(name, default=""):
    try:
        return open(os.path.join(V, name)).read().strip()
    except OSError:
        return default
def log(text):
    with open(os.path.join(STUB, "calls"), "a") as f:
        f.write(vm + " " + text + "\n")
def files(path):
    return sum(len(f) for _, _, f in os.walk(path))
def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()
script = None
if "-EncodedCommand" in words:
    script = base64.b64decode(words[words.index("-EncodedCommand") + 1]).decode("utf-16-le")
elif "-File" in words:
    script = open(os.path.join(TMP, re.split(r"[\\/]", words[words.index("-File") + 1])[-1]), encoding="utf-8").read()
if script is not None:
    if "UtcNow.Ticks" in script:
        print(rd("now_ticks", "5000")); sys.exit(0)
    if "LastWriteTimeUtc" in script:   # win_package_ready: its checks answered in the script's order, as PowerShell runs it
        looks = int(rd("looks", "0")) + 1
        open(os.path.join(V, "looks"), "w").write(str(looks))
        since = int(re.search(r"\[long\]'(\d+)'", script).group(1))
        pin = re.search(r"rev-parse HEAD\) -ne '([0-9a-f]+)'", script).group(1)
        after = rd("line_after", "none")
        answers = {
            "head": lambda: rd("head") != pin and "NO the checkout is no longer on the commit the pack packed",
            "lock": lambda: {"missing": "NO no record of the npm ci that installed the rb-webcomponents modules",
                             "other": "NO the rb-webcomponents modules come from another package-lock.json"}.get(rd("lockrec", "ok")),
            "dirty": lambda: rd("dirty") and "NO the pack left tracked files changed",
            "package": lambda: not os.path.isdir(os.path.join(PKG, "verified-db-noexe", "DataPallas")) and
                               "NO the pack left no verified-db-noexe in asbl\\target\\package",
            "log": lambda: not rd("packlog_ticks") and "WAIT this pack has written no asbl\\pack-datapallas.log yet",
            "old": lambda: int(rd("packlog_ticks")) < since and
                           "WAIT asbl\\pack-datapallas.log is an earlier pack's (written before this pack started)",
            "line": lambda: (after == "none" or looks < int(after) or "FINISHED Assembler:NoExeAssembler" not in script) and
                            "WAIT this pack's NoExeAssembler has not finished yet",
        }
        markers = (("rev-parse HEAD) -ne", "head"), ("npm-ci-lock.sha256", "lock"), ("status --porcelain", "dirty"),
                   ("verified-db-noexe\\DataPallas')", "package"), ("Test-Path $log", "log"),
                   ("LastWriteTimeUtc", "old"), ("Select-String", "line"))
        for _, kind in sorted((m.start(), kind) for marker, kind in markers for m in re.finditer(re.escape(marker), script)):
            answer = answers[kind]()
            if answer:
                print(answer); sys.exit(0)
        print("YES"); sys.exit(0)
    if "tar.exe -cf" in script:   # win_package_archive
        name = re.split(r"[\\/]", re.search(r"\$tar = '([^']+)'", script).group(1))[-1]
        subprocess.run(["tar", "-cf", os.path.join(TMP, name), "-C", PKG, "verified-db-noexe"], check=True)
        log("archive " + name)
        print("FILES %d" % files(os.path.join(PKG, "verified-db-noexe")))
        print("SHA256 " + sha(os.path.join(TMP, name))); sys.exit(0)
    if "Remove-Item (Join-Path $pkg 'verified-db-noexe') -Recurse" in script:   # win_package_put, the old package
        shutil.rmtree(os.path.join(PKG, "verified-db-noexe"), ignore_errors=True)
        log("remove-package"); print("EMPTY"); sys.exit(0)
    if "tar.exe -xf" in script:   # win_package_put, the archive unpacked
        name = re.split(r"[\\/]", re.search(r"\$tar = '([^']+)'", script).group(1))[-1]
        want = re.search(r"\$sha -ne '([0-9a-f]{64})'", script).group(1)
        tar = os.path.join(TMP, name)
        have = sha(tar)
        if have != want:
            os.remove(tar); log("sha-refused"); print("FAIL the archive on the VM is not the pack's (sha256 %s)" % have); sys.exit(1)
        subprocess.run(["tar", "-xf", tar, "-C", PKG], check=True); os.remove(tar)
        log("unpack " + name)
        print("FILES %d" % files(os.path.join(PKG, "verified-db-noexe"))); sys.exit(0)
    if "schtasks /create" in script:   # win_run: the VM's own prepare starts here; refused, so it ends at once
        log("task " + (re.search(r'/tn "dp-ci-([a-z0-9-]+)"', script) or re.search("()", "")).group(1))
        print("FAIL  could not create the task"); sys.exit(1)
    sys.exit(0)
cmd = " ".join(words)
if cmd == "query session":   # win_run's check: the CI account's console session
    print(" SESSIONNAME   USERNAME   ID  STATE\n>console       ci         1  Active")
elif "rev-parse --short HEAD" in cmd:
    print(rd("short"))
elif "rev-parse HEAD" in cmd:
    print(rd("head"))
elif "status --porcelain" in cmd:
    print(rd("dirty"))
elif cmd.startswith("type ") and cmd.endswith(".built-from"):
    p = os.path.join(PKG, ".built-from")
    if not os.path.exists(p):
        sys.exit(1)
    print(open(p).read().strip())
elif cmd.startswith("if exist") and ".built-from del" in cmd:
    if os.path.exists(os.path.join(PKG, ".built-from")):
        os.remove(os.path.join(PKG, ".built-from"))
    log("remove-stamp")
elif cmd.endswith("DataPallas echo yes"):
    if os.path.isdir(os.path.join(PKG, "verified-db-noexe", "DataPallas")):
        print("yes")
elif cmd.startswith('>"') and '.built-from" echo ' in cmd:
    value = cmd.split(" echo ", 1)[1]
    open(os.path.join(PKG, ".built-from"), "w").write(value + "\n")
    log("stamp " + value)
elif cmd.startswith("del "):   # a file of C:\dp-ci\tmp: the archive, or win_ps's script file
    p = os.path.join(TMP, re.split(r"[\\/]", cmd)[-1])
    if os.path.exists(p):
        os.remove(p)
    if cmd.endswith(".tar"):
        log("remove-vm-archive")
EOF
cat > "$STUB/bin/scp" <<'EOF'
#!/usr/bin/env python3
# stub scp: a copy to or from a stub VM's C:\dp-ci\tmp (any other remote folder: its fs/other); $STUB/corrupt-pull and
# $STUB/corrupt-put-<vm> change the copied file by one byte
import os, re, shutil, sys
STUB = os.environ["STUB"]
src, dst = sys.argv[-2], sys.argv[-1]
def local(remote):
    host, path = remote.split(":", 1)
    vm = host.split("@", 1)[1].split(".")[0][len("vm-"):]
    folder = os.path.join(STUB, "vm-" + vm, "fs", "tmp" if "dp-ci/tmp" in path.replace("\\", "/") else "other")
    os.makedirs(folder, exist_ok=True)
    return vm, os.path.join(folder, re.split(r"[\\/]", path)[-1])
def corrupt(path):
    with open(path, "ab") as f:
        f.write(b"x")
if ".invalid:" in src:
    vm, path = local(src)
    shutil.copyfile(path, dst)
    if os.path.exists(os.path.join(STUB, "corrupt-pull")):
        corrupt(dst)
    open(os.path.join(STUB, "calls"), "a").write(vm + " pulled " + os.path.basename(path) + "\n")
else:
    vm, path = local(dst)
    shutil.copyfile(src, path)
    if os.path.exists(os.path.join(STUB, "corrupt-put-" + vm)):
        corrupt(path)
    open(os.path.join(STUB, "calls"), "a").write(vm + " put " + os.path.basename(path) + "\n")
EOF
chmod +x "$STUB/bin/ssh" "$STUB/bin/scp"
export PATH="$STUB/bin:$PATH"
mkdir -p "$SCRATCH/vm-conf"
export WIN_CI_CONF="$SCRATCH/vm-conf/win-ci.env" WIN_VM_CONF_DIR="$SCRATCH/vm-conf"
printf 'WIN_HOST=vm-a.invalid\nWIN_USER=ci\nWIN_SSH_KEY=%s\nWIN_KNOWN_HOSTS=%s\nWIN_REPO=C:/ci/repo\n' "$SCRATCH/stub-key" "$SCRATCH/stub-known-hosts" > "$WIN_CI_CONF"
: > "$SCRATCH/stub-key"; : > "$SCRATCH/stub-known-hosts"   # empty stand-ins: the stub ssh reads neither
echo "WIN_HOST=vm-b.invalid" > "$SCRATCH/vm-conf/win-ci-b.env"
chmod 600 "$SCRATCH"/vm-conf/*
unset WIN_VM WIN_HOST WIN_USER WIN_SSH_KEY WIN_KNOWN_HOSTS WIN_REPO RELEASE_PIN E2E_REUSE_BUILD WIN_PACKAGE_ARCHIVE WIN_PACKAGE_PULL_RC \
  WIN_PACKAGE_PACK_RC WIN_PACKAGE_WAIT_SECS
export WIN_PACKAGE_POLL=0 WIN_RUN_EVERY=0 LOG_DIR="$SCRATCH/logs"; mkdir -p "$LOG_DIR"

PIN=$(git rev-parse HEAD); SHORT=$(git rev-parse --short HEAD)
OLD=0000000000000000000000000000000000000000
# vm_state <vm> <key=value>...: a stub VM's state, the keys of the stub ssh
vm_state() {
  local v="$1" kv; shift
  mkdir -p "$STUB/vm-$v"
  for kv in "$@"; do printf '%s\n' "${kv#*=}" > "$STUB/vm-$v/${kv%%=*}"; done
}
# vm_package <vm> <stamp>: a package of a few files on that VM, with that stamp (empty: none)
vm_package() {
  local p="$STUB/vm-$1/fs/pkg"
  rm -rf "$p"; mkdir -p "$p/verified-db-noexe/DataPallas/lib" "$p/verified-db-noexe/DataPallas/config"
  echo "$1 jar" > "$p/verified-db-noexe/DataPallas/lib/rb-common.jar"
  echo "$1 settings" > "$p/verified-db-noexe/DataPallas/config/settings.xml"
  echo "$1 start" > "$p/verified-db-noexe/DataPallas/startServer.bat"
  [ -z "$2" ] || echo "$2" > "$p/.built-from"
}
fresh() {  # fresh: both VMs on the pin, VM a with this pack's package and log (the line from the first look), VM b old
  rm -rf "$STUB"/vm-* "$STUB/calls" "$STUB"/corrupt-*
  vm_state a head="$PIN" short="$SHORT" dirty= lockrec=ok now_ticks=5000 packlog_ticks=6000 line_after=1
  vm_package a ""
  vm_state b head="$PIN" short="$SHORT" dirty=
  vm_package b oldcommit
  ARCHIVE="$SCRATCH/run-$1/e2e-package.tar"; mkdir -p "$(dirname "$ARCHIVE")"
}
dp() { bash asbl/ci/dp-ci.sh win "$@" 2>&1; }   # dp <win subcommand...>: dp-ci.sh with the stubs
calls() { [ -f "$STUB/calls" ] && cat "$STUB/calls" | paste -sd'|' || true; }

echo "---- 1. package-ready: one look ----"
fresh ready
vm_state a packlog_ticks=
check "no pack log yet: WAIT" has "WAIT this pack has written no" "$(WIN_VM=a dp package-ready "$PIN" 5000)"
vm_state a packlog_ticks=4000
check "an earlier pack's log (before this pack's start), the line in it: WAIT, never read as this pack's" \
  has "WAIT asbl\\pack-datapallas.log is an earlier pack's" "$(WIN_VM=a dp package-ready "$PIN" 5000)"
vm_state a packlog_ticks=6000 line_after=none
check "this pack's log, its NoExeAssembler not finished: WAIT" has "WAIT this pack's NoExeAssembler has not finished yet" \
  "$(WIN_VM=a dp package-ready "$PIN" 5000)"
vm_state a line_after=1
check "this pack's log with the line, every check holds: YES" same YES "$(WIN_VM=a dp package-ready "$PIN" 5000)"
vm_state a lockrec=other
check "the rb-webcomponents modules from another lock: NO" has "NO the rb-webcomponents modules come from another package-lock.json" \
  "$(WIN_VM=a dp package-ready "$PIN" 5000)"
vm_state a lockrec=ok dirty="M asbl/pom.xml"
check "a tracked file changed: NO" has "NO the pack left tracked files changed" "$(WIN_VM=a dp package-ready "$PIN" 5000)"
vm_state a dirty= lockrec=missing line_after=none
check "no record of the modules' npm ci, the pack still going (no line yet): NO at once" \
  has "NO no record of the npm ci that installed the rb-webcomponents modules" "$(WIN_VM=a dp package-ready "$PIN" 5000)"
vm_state a lockrec=ok head="$OLD"
check "the checkout on another commit, the pack still going: NO at once" \
  has "NO the checkout is no longer on the commit the pack packed" "$(WIN_VM=a dp package-ready "$PIN" 5000)"
vm_state a head="$PIN" line_after=1
looks=$(cat "$STUB/vm-a/looks"); out=$(WIN_VM=a dp package-ready "$PIN" "")
check "no start time of the pack on the VM's clock: NO" has "NO the pack's start on the VM's clock is unknown" "$out"
check "  without a look at the VM" same "$looks" "$(cat "$STUB/vm-a/looks")"

echo "---- 2. package-pull on the pack's VM ----"
fresh pull-ok
vm_state a line_after=3
out=$(WIN_VM=a dp package-pull "$ARCHIVE" "$PIN" 5000); rc=$?
check "the line at the third look: exit 0, READY, the archive here" bash -c '[ "$1" = 0 ] && [ -s "$2" ] && grep -q "^WIN_E2E_PACKAGE_READY at=" <<< "$3" && grep -q "^WIN_E2E_PACKAGE_ARCHIVE=$2 sha256=.* files=3 took=" <<< "$3"' \
  _ "$rc" "$ARCHIVE" "$out"
check "  it looked three times" same 3 "$(cat "$STUB/vm-a/looks")"
check "  its record: the VM's sha256, the file count, the pin; no .none" bash -c \
  '[ "$(sed -n "s/^sha256 //p" "$1.sha256")" = "$(sha256sum "$1" | cut -d" " -f1)" ] && grep -qx "files 3" "$1.sha256" && grep -qx "commit $2" "$1.sha256" && [ ! -e "$1.none" ]' \
  _ "$ARCHIVE" "$PIN"
check "  the archive made on VM a, brought here, the VM's copy removed; VM a's package untouched" same \
  "a archive e2e-package.tar|a pulled e2e-package.tar|a remove-vm-archive" "$(calls)"
check "  nothing left in VM a's C:\\dp-ci\\tmp" bash -c '[ -z "$(ls -A "$1")" ]' _ "$STUB/vm-a/fs/tmp"

fresh pull-old-log
vm_state a packlog_ticks=4000
: > "$SCRATCH/pack.rc"
out=$(WIN_VM=a WIN_PACKAGE_PACK_RC="$SCRATCH/pack.rc" dp package-pull "$ARCHIVE" "$PIN" 5000); rc=$?
check "an earlier pack's log and the pack's part ended: exit 1, no archive, .none says why" bash -c \
  '[ "$1" = 1 ] && [ ! -e "$2" ] && [ ! -e "$2.sha256" ] && grep -q "^the pack ended before its NoExeAssembler finished (asbl.pack-datapallas.log is an earlier pack" "$2.none"' \
  _ "$rc" "$ARCHIVE"
check "  nothing archived on VM a" same "" "$(calls)"
rm -f "$SCRATCH/pack.rc"

fresh pull-check
vm_state a lockrec=missing line_after=none
out=$(WIN_VM=a dp package-pull "$ARCHIVE" "$PIN" 5000); rc=$?
check "no record of the npm ci, the pack still going: exit 1 at the first look, .none says which, nothing archived" bash -c \
  '[ "$1" = 1 ] && [ ! -e "$2" ] && grep -q "^a check not met: no record of the npm ci" "$2.none" && [ -z "$3" ] && [ "$4" = 1 ]' \
  _ "$rc" "$ARCHIVE" "$(calls)" "$(cat "$STUB/vm-a/looks")"

fresh pull-red
touch "$STUB/corrupt-pull"
out=$(WIN_VM=a dp package-pull "$ARCHIVE" "$PIN" 5000); rc=$?
check "the archive brought here is not the VM's (sha256): exit 1, no archive or part file here, .none says why" bash -c \
  '[ "$1" = 1 ] && [ ! -e "$2" ] && [ ! -e "$2.part" ] && [ ! -e "$2.sha256" ] && grep -q "not VM a.s (sha256)" "$2.none"' _ "$rc" "$ARCHIVE"
check "  the VM's copy removed all the same" bash -c '[ -z "$(ls -A "$1")" ]' _ "$STUB/vm-a/fs/tmp"

echo "---- 3. package on another VM: the pack's copy, else its own prepare ----"
fresh put-current
vm_package b "$SHORT"
out=$(WIN_VM=b WIN_PACKAGE_ARCHIVE="$ARCHIVE" dp package); rc=$?
check "its stamp the pin's already: exit 0, nothing copied, nothing waited for" bash -c \
  '[ "$1" = 0 ] && grep -q "^WIN_E2E_PACKAGE=current ($2): no copy needed" <<< "$3" && [ -z "$4" ]' _ "$rc" "$SHORT" "$out" "$(calls)"

fresh put-ok
WIN_VM=a dp package-pull "$ARCHIVE" "$PIN" 5000 > /dev/null; : > "$STUB/calls"
out=$(WIN_VM=b WIN_PACKAGE_ARCHIVE="$ARCHIVE" WIN_PACKAGE_PULL_RC="$SCRATCH/pull.rc" dp package); rc=$?
check "the record there: exit 0, copied, the stamp the pin's" bash -c \
  '[ "$1" = 0 ] && grep -q "^WIN_E2E_PACKAGE=copied from the pack ($2): 3 files, sha256 .* took=" <<< "$3" && [ "$(cat "$4")" = "$2" ]' \
  _ "$rc" "$SHORT" "$out" "$STUB/vm-b/fs/pkg/.built-from"
check "  in order: the old stamp and package removed, the archive put, unpacked, the stamp written last" same \
  "b remove-stamp|b remove-package|b put e2e-package.tar|b unpack e2e-package.tar|b stamp $SHORT" "$(calls)"
check "  VM b's package is VM a's, file for file" diff -r "$STUB/vm-a/fs/pkg/verified-db-noexe" "$STUB/vm-b/fs/pkg/verified-db-noexe"
check "  nothing left in VM b's C:\\dp-ci\\tmp; no prepare" bash -c '[ -z "$(ls -A "$1")" ] && ! grep -q "pack-prepare-for-e2e" <<< "$2"' \
  _ "$STUB/vm-b/fs/tmp" "$out"

fresh put-none
echo "the pack ended before its NoExeAssembler finished (WAIT ...)" > "$ARCHIVE.none"
out=$(WIN_VM=b WIN_PACKAGE_ARCHIVE="$ARCHIVE" dp package); rc=$?
check "<archive>.none: not copied, why, then its own prepare (pack-prepare-for-e2e.bat), no stamp" bash -c \
  'grep -q "^WIN_E2E_PACKAGE=not copied from the pack (the pack ended before its NoExeAssembler finished (WAIT ...)): VM b prepares its own" <<< "$1" &&
   grep -q "^WIN_E2E_PACKAGE=stale (built from .oldcommit., the VM is at $2) - running pack-prepare-for-e2e.bat" <<< "$1" &&
   grep -q "b task npmwc" <<< "$3" && ! grep -q "stamp $2" <<< "$3"' _ "$out" "$SHORT" "$(calls)"

fresh put-pull-gone
echo 1 > "$SCRATCH/pull.rc"
out=$(WIN_VM=b WIN_PACKAGE_ARCHIVE="$ARCHIVE" WIN_PACKAGE_PULL_RC="$SCRATCH/pull.rc" dp package); rc=$?
check "the pull's part ended with no record: not copied, its own prepare" bash -c \
  'grep -q "^WIN_E2E_PACKAGE=not copied from the pack (the pull ended with no archive and no reason): VM b prepares its own" <<< "$1" &&
   grep -q "running pack-prepare-for-e2e.bat" <<< "$1"' _ "$out"
rm -f "$SCRATCH/pull.rc"

fresh put-red
WIN_VM=a dp package-pull "$ARCHIVE" "$PIN" 5000 > /dev/null; : > "$STUB/calls"
touch "$STUB/corrupt-put-b"
out=$(WIN_VM=b WIN_PACKAGE_ARCHIVE="$ARCHIVE" dp package); rc=$?
check "a copy red on the VM (sha256): the copy failed, its own prepare, no stamp of the copy" bash -c \
  'grep -q "^FAIL  the package unpacked on VM b: FAIL the archive on the VM is not the pack.s" <<< "$1" &&
   grep -q "^WIN_E2E_PACKAGE=not copied from the pack (the copy failed (above)): VM b prepares its own" <<< "$1" &&
   grep -q "running pack-prepare-for-e2e.bat" <<< "$1" && grep -q "b sha-refused" <<< "$2" && ! grep -q "stamp $3" <<< "$2"' \
  _ "$out" "$(calls)" "$SHORT"

fresh put-other-commit
WIN_VM=a dp package-pull "$ARCHIVE" "$PIN" 5000 > /dev/null; : > "$STUB/calls"
vm_state b head="$OLD"
out=$(WIN_VM=b dp package-put "$ARCHIVE"); rc=$?
check "package-put on a VM whose checkout is another commit: refused, nothing removed or copied" bash -c \
  '[ "$1" = 1 ] && grep -q "^FAIL  VM b.s checkout is at 00000000, the package is of" <<< "$2" && [ -z "$3" ]' _ "$rc" "$out" "$(calls)"

echo "---- 4. package-archive by hand ----"
fresh by-hand
vm_package a oldcommit
out=$(WIN_VM=a dp package-archive "$ARCHIVE"); rc=$?
check "the VM's stamp is not its checkout's commit: refused, nothing archived" bash -c \
  '[ "$1" = 1 ] && grep -q "^FAIL  VM a.s package is built from .oldcommit., its checkout is at" <<< "$2" && [ ! -e "$3" ] && [ -z "$4" ]' \
  _ "$rc" "$out" "$ARCHIVE" "$(calls)"
vm_package a "$SHORT"
out=$(WIN_VM=a dp package-archive "$ARCHIVE"); rc=$?
check "stamped with its checkout's commit: archived, the record names that commit" bash -c \
  '[ "$1" = 0 ] && [ -s "$2" ] && grep -qx "commit $3" "$2.sha256"' _ "$rc" "$ARCHIVE" "$PIN"

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-package-copy"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)"; exit 1
