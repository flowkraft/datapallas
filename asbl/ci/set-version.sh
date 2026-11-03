#!/bin/bash
# ---------------------------------------------------------------------------------------------
# set-version.sh - change the DataPallas product version in every file that really declares it.
#
# ON DEMAND ONLY: by hand, or by step 0 of a release (job dp-ci-release-step0-set-version,
#   asbl/ci/jenkins/release-set-version.sh, in a throwaway worktree of origin/main). dp-ci.sh never calls it.
#
# Usage
#   bash asbl/ci/set-version.sh --show              what is the version now, and in which files
#   bash asbl/ci/set-version.sh --versions          each file's own version, one '<version> <file>' line per file
#                                                   (the release jobs check that all of them say the same)
#   bash asbl/ci/set-version.sh --dry-run 16.6.0    show every edit it would make, change nothing
#   bash asbl/ci/set-version.sh 16.6.0              make the edits, then YOU review and commit
#
# It never commits, never tags, never pushes. Step 0 commits and pushes its edits, after checking
# them, when the owner starts that job with a bigger version.
#
# Why a script and not a find/replace: the version string also appears in files where it means
# something else entirely, and changing those breaks the build. See DO-NOT-TOUCH below.
# ---------------------------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1          # repo root (asbl/ci/.. /..)

# --- files that really declare the product version -------------------------------------------
# path|kind    kind tells the editor which pattern is the version in that file type.
FILES='
pom.xml|pom
bkend/server/pom.xml|pom
frend/reporting/package.json|pkg
frend/reporting/package-lock.json|lock
frend/reporting/app/package.json|pkg
frend/reporting/app/package-lock.json|lock
bkend/reporting/src/main/external-resources/template/config/burst/settings.xml|settings
'

# --- files that contain the same digits for an UNRELATED reason. Never edited. ----------------
# Listed explicitly so the post-check below can tell "known and fine" from "new file, look at it".
KEEP='
asbl/src/main/external-resources/db-template/_apps/flowkraft/_ai-hub/ui-startpage/package.json
bkend/server/src/main/java/com/flowkraft/iam/Role.java
asbl/docker/README-dockerhub.md
asbl/src/main/external-resources/db-template/CHANGELOG.md
asbl/ci/set-version.sh
asbl/ci/release-state.sh
asbl/ci/jenkins/jenkins.md
'
# ui-startpage/package.json : "overrides": { "eslint-config-next": { "globals": "16.5.0" } }
#                             -> the npm package `globals`, nothing to do with us. That app is 0.1.0.
# Role.java                 : a comment about installs upgraded "from 16.5.0-or-earlier". History.
# README-dockerhub.md       : an example docker tag in prose.
# CHANGELOG.md              : past release headings. A new release ADDS a heading by hand.
# set-version.sh            : this file; its comments hold versions as examples.
# release-state.sh          : WINDOWS_RELEASED_BY_HAND, the last release both channels made by hand. History.
# jenkins.md                : versions in the release documentation's examples and history.

MODE=apply
case "${1:-}" in
  --show)    MODE=show ;;
  --versions) MODE=versions ;;
  --dry-run) MODE=dry; shift ;;
  -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
  '')        echo "usage: $0 [--show | --dry-run] <new-version>"; exit 2 ;;
esac
NEW="${1:-}"

if [ "$MODE" = versions ]; then
  # What each file itself declares, read with the same per-kind pattern the editor below uses (a lock file's two
  # header occurrences are both shown, comma-separated, when they differ). '?' = the pattern found nothing.
  FILES="$FILES" python3 - <<'PY'
import io, os, re
for line in os.environ['FILES'].strip().splitlines():
    path, kind = line.split('|')
    try:
        text = io.open(path, encoding='utf-8').read()
    except OSError:
        print('? %s' % path); continue
    if kind == 'pom':
        found = re.findall(r'<revision>([^<]+)</revision>', text)[:1]
    elif kind == 'pkg':
        found = re.findall(r'(?m)^  "version": "([^"]+)"', text)[:1]
    elif kind == 'lock':
        found = sorted(set(re.findall(r'"version": "([^"]+)"', '\n'.join(text.split('\n')[:12]))))
    else:
        found = re.findall(r'<version>([^<]+)</version>', text)[:1]
    print('%s %s' % (','.join(found) or '?', path))
PY
  exit 0
fi

OLD=$(grep -m1 -oP '(?<=<revision>)[^<]+' pom.xml) || true
[ -n "$OLD" ] || { echo "FAIL  could not read <revision> from pom.xml"; exit 1; }
echo "current version: $OLD"

if [ "$MODE" = show ]; then
  printf '\n%-72s %s\n' "FILE" "DECLARES THE VERSION"
  echo "$FILES" | grep . | while IFS='|' read -r f k; do
    n=$(grep -c "$OLD" "$f" 2>/dev/null || echo 0)
    printf '%-72s %s occurrence(s)  [%s]\n' "$f" "$n" "$k"
  done
  printf '\n%-72s %s\n' "FILE" "SAME DIGITS, DIFFERENT MEANING - NEVER EDITED"
  echo "$KEEP" | grep . | while read -r f; do printf '%-72s %s\n' "$f" "see comments in $0"; done
  exit 0
fi

[ -n "$NEW" ] || { echo "usage: $0 [--show | --dry-run] <new-version>"; exit 2; }
echo "$NEW" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9.]+)?$' \
  || { echo "FAIL  '$NEW' does not look like x.y.z"; exit 1; }
[ "$NEW" != "$OLD" ] || { echo "nothing to do, already $NEW"; exit 0; }
echo "new version    : $NEW"
echo "mode           : $MODE"
echo

OLD="$OLD" NEW="$NEW" MODE="$MODE" FILES="$FILES" python3 - <<'PY'
import io, os, re, sys

OLD, NEW, MODE = os.environ['OLD'], os.environ['NEW'], os.environ['MODE']
dry = (MODE == 'dry')
rc, touched = 0, 0

def edit(path, kind):
    """Return (n_changes, note). Targeted per file kind - never a blanket replace."""
    global rc
    try:
        text = io.open(path, encoding='utf-8').read()
    except OSError as e:
        print('FAIL  %s: %s' % (path, e)); rc = 1; return 0

    if kind == 'pom':
        # <revision>X</revision> - the single Maven property everything else inherits from.
        pat, repl, want = r'(<revision>)%s(</revision>)' % re.escape(OLD), r'\g<1>%s\g<2>' % NEW, 1
    elif kind == 'pkg':
        # ONLY the top-level "version" key. Anchored to a 2-space indent at the start of a line,
        # so a nested dependency that happens to be on the same version is never matched.
        pat, repl, want = r'(?m)^(  "version": ")%s(")' % re.escape(OLD), r'\g<1>%s\g<2>' % NEW, 1
    elif kind == 'lock':
        # A lock file declares its own version twice, in the structural header: the top-level
        # "version" and packages[""].version. Both live in the first few lines; everything after
        # that is dependency versions, which must not be touched.
        head, tail = text.split('\n', 12), None
        head, tail = '\n'.join(text.split('\n')[:12]), '\n'.join(text.split('\n')[12:])
        new_head, n = re.subn(r'("version": ")%s(")' % re.escape(OLD),
                              r'\g<1>%s\g<2>' % NEW, head)
        if n < 1:
            print('FAIL  %s: no "version": "%s" in the header' % (path, OLD)); rc = 1; return 0
        if not dry:
            io.open(path, 'w', encoding='utf-8').write(new_head + '\n' + tail)
        print('  %-70s %d change(s)' % (path, n))
        return n
    elif kind == 'settings':
        pat, repl, want = r'(<version>)%s(</version>)' % re.escape(OLD), r'\g<1>%s\g<2>' % NEW, 1
    else:
        print('FAIL  %s: unknown kind %s' % (path, kind)); rc = 1; return 0

    new_text, n = re.subn(pat, repl, text)
    if n != want:
        print('FAIL  %s: expected %d match(es) for the %s pattern, found %d'
              % (path, want, kind, n)); rc = 1; return 0
    if not dry:
        io.open(path, 'w', encoding='utf-8').write(new_text)
    print('  %-70s %d change(s)' % (path, n))
    return n

print('%s:' % ('would change' if dry else 'changed'))
for line in os.environ['FILES'].strip().splitlines():
    p, k = line.split('|')
    touched += edit(p, k)

print('\n%d edit(s) across %d file(s)' % (touched, len(os.environ['FILES'].strip().splitlines())))
sys.exit(rc)
PY
PYRC=$?
[ $PYRC -eq 0 ] || { echo; echo "FAIL  nothing was committed and some files may be half-edited - run 'git diff' and decide"; exit $PYRC; }

if [ "$MODE" = dry ]; then
  echo; echo "dry run - no file was written."
  exit 0
fi

# --- post-check: did the old version survive anywhere we did not expect? ----------------------
echo
echo "post-check: tracked files still containing $OLD"
UNEXPECTED=0
while read -r f; do
  case "$f" in *node_modules*) continue;; esac
  grep -lqF "$OLD" "$f" 2>/dev/null || continue   # -F: the dots are dots (as a regex 16.5.0 also matched digits in SVG paths)
  if echo "$KEEP" | grep -qx "[[:space:]]*$f"; then
    printf '  ok (known, left alone)  %s\n' "$f"
  else
    printf '  LOOK AT THIS            %s\n' "$f"; UNEXPECTED=$((UNEXPECTED+1))
  fi
done < <(git ls-files)
[ "$UNEXPECTED" -eq 0 ] && echo "  no surprises." \
  || echo "  ^ $UNEXPECTED file(s) not in this script's tables - decide if they need $NEW too, then add them."

cat <<EOF

NEXT, BY HAND:
  1. add a '## $NEW - $(date +%Y-%m-%d)' heading to
     asbl/src/main/external-resources/db-template/CHANGELOG.md
  2. review the edits:    git diff --stat        (use --stat, not a full diff: frend/reporting/package.json
                                                  holds a test licence key that should not be echoed)
  3. commit them yourself. This script never commits, tags or pushes.
  4. then push, and prove that commit: step 1 of a release, Jenkins job dp-ci-release-step1-e2e-prerelease
     (its two lanes; asbl/ci/jenkins/jenkins.md, "The release, in order"). The Jenkins job
     dp-ci-release-step0-set-version runs this script, checks the edits, commits and pushes them for you;
     the changelog (1) stays yours.
EOF
