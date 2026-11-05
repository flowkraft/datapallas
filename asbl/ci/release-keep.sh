#!/bin/bash
# What a release run keeps: the artifacts it built and proved, in one folder per version and commit, with a manifest and the
# run's failure report beside them, so that release day uploads those very files without a rebuild (release-publish.sh
# upload-kept). The release jobs call it (asbl/ci/jenkins/release-docker.sh, dp-ci.sh win release); it also runs by hand.
#
#   <RELEASE_ARTIFACTS_DIR>/<version>-<commit, 8>/
#     datapallas-server-docker.zip                       step 2 (docker channel): the zip its build made and its proofs installed
#     datapallas.zip datapallas-server.zip datapallas-src.zip   step 3 (windows channel): the pack's zips, brought down from the VM
#     MANIFEST.txt                                        version, commit, and per channel: the run's time, verdict, log, each
#                                                         file's name, size and sha256, the image's tag and id, each proof
#     failure-report-docker.md failure-report-windows.md  each channel's last run: every failure, then grouped (below)
#     datapallas-server-image.tar                         step 2 (docker channel): the proven image as a file (docker save)
#     replaced/<channel>-<time>/                          a set a later run of the same version and commit replaced: moved
#                                                         here with its manifest lines and report, never deleted by a run
#   The image stays in this host's Docker daemon, tagged <repo>:<version> (and <repo>:<version>-<commit>, the build's own
#   tag), its id in the manifest. The daemon is no safe place on its own: this host's nightly cleanup deletes every image no
#   container uses, so the image is kept as a file too, and the upload loads it from there when the daemon lost it. That
#   file is not in the manifest's file list: the image id, a hash of its content that docker load checks, says it is the one.
#
#   bash asbl/ci/release-keep.sh begin <channel> <version> <commit>        a run starts: its step list is emptied; prints the folder
#   bash asbl/ci/release-keep.sh step <channel> <version> <commit> <label> PASS|FAIL|NOT_RUN <what> [<log>] [<report>]
#                                                                           one step of the run, its verdict, its log and its
#                                                                           test report (a Playwright .json or a Robot output.xml)
#   bash asbl/ci/release-keep.sh step-verdict <channel> <version> <commit> <label>   that step's newest verdict in the
#                                                                           channel's run, or nothing: a step run in parts
#                                                                           (release-docker.sh DOCKER_RELEASE_PART) reads here
#                                                                           what its earlier parts found
#   bash asbl/ci/release-keep.sh keep <channel> <version> <commit> <name>=<path>... [image=<repo>:<tag> [image-file=<its docker save>]]
#                                                                           the files (and the image) kept: a file whose sha256 is
#                                                                           already the kept one is reused; otherwise the channel's
#                                                                           earlier set goes to replaced/ and the new one comes in
#                                                                           whole, so a folder never mixes two builds of a channel
#   bash asbl/ci/release-keep.sh finish <channel> <version> <commit> PASS|FAIL [<log>]
#                                                                           the run's verdict in the manifest, its failure report
#                                                                           written, and the summary: each artifact, the proofs
#                                                                           that covered it, where it sits
#   bash asbl/ci/release-keep.sh check <folder> [docker|windows]           each kept file's sha256 and the image's id against the
#                                                                           manifest: OK, or CHANGED/MISSING naming it; exit 1 then
#   bash asbl/ci/release-keep.sh inside <folder> docker|windows            the files checked from inside, read-only: each is the
#                                                                           manifest's version and commit (THE FILES CHECKED FROM
#                                                                           INSIDE, below); an OK line per file, MISMATCH naming
#                                                                           each mismatch, exit 1 then. release-publish.sh's
#                                                                           stage-files and stage-docker run it before any upload
#   bash asbl/ci/release-keep.sh show [<folder>]                           the manifest and the summary (the newest folder when
#                                                                           none is given)
#   bash asbl/ci/release-keep.sh failures <folder> <channel> | <steps file>   every failure of that channel's last run (or
#                                                                           of a run written as a .steps file), one tab-separated
#                                                                           line each: step, test|step, the test as the report
#                                                                           names it, its file, its own title, its report
#                                                                           (asbl/ci/release-rerun.sh reads them)
#   bash asbl/ci/release-keep.sh report-steps <steps file> <report.md> <title>   the failure report of any run whose steps
#                                                                           are written as a .steps file (a re-run's), same format
#
# The failure report (one per channel run, green or red): each step with its verdict and its test counts; every failure once,
# with its test, its step, the first lines of its error and its evidence (screenshot, trace, the report it came from), every
# skipped test as a failure of the run, every test the end of a run cut short (never reached, interrupted: its time limit) as one
# too and again in a list of their own, and a red step with no test report as its section's last lines; then the failures grouped
# by their error's first line. A group is a starting point, not a cause: the run never analyses or fixes anything, so each
# group's root cause, what changed since it last passed, the fix proposed and how to verify it are written into the report by
# whoever reads it, and a fix waits for the owner's go.
# RELEASE_ARTIFACTS_DIR and RELEASE_IMAGE_REPO are variables so a test can point them elsewhere.
set -uo pipefail
CALLER_PWD="$PWD"
cd "$(dirname "$0")/../.." || exit 2
abs() { case "$1" in /*|"") echo "$1" ;; *) echo "$CALLER_PWD/$1" ;; esac; }  # a path given relative to the caller

RELEASE_ARTIFACTS_DIR="${RELEASE_ARTIFACTS_DIR:-/var/kraft-internalsystems/logs/datapallas-ci/release-artifacts}"
RELEASE_IMAGE_REPO="${RELEASE_IMAGE_REPO:-flowkraft/datapallas-server}"
IMAGE_FILE=datapallas-server-image.tar   # the kept image as a file; release-publish.sh stage-docker loads it by this name

usage() { sed -n '2,56p' "$0"; exit 2; }
sha_of() { sha256sum "$1" 2>/dev/null | cut -d' ' -f1; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
channel_ok() { case "$1" in docker|windows) ;; *) echo "FAIL  the channel must be docker or windows (got '$1')"; exit 2 ;; esac; }
folder_of() {  # folder_of <version> <commit>: the folder, created
  printf '%s' "$1" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "FAIL  '$1' is not a version (x.y.z)" >&2; return 2; }
  printf '%s' "$2" | grep -qE '^[0-9a-f]{40}$' || { echo "FAIL  '$2' is not a full commit hash" >&2; return 2; }
  F="$RELEASE_ARTIFACTS_DIR/$1-${2:0:8}"
  mkdir -p "$F" || return 2
  [ -f "$F/MANIFEST.txt" ] || {
    { echo "# DataPallas release artifacts of $1 on ${2:0:8}: written by asbl/ci/release-keep.sh, read by release-publish.sh upload-kept"
      echo "version=$1"; echo "commit=$2"; } > "$F/MANIFEST.txt"; }
  [ "$(sed -n 's/^commit=//p' "$F/MANIFEST.txt")" = "$2" ] || { echo "FAIL  $F/MANIFEST.txt is of another commit" >&2; return 2; }
}
mget() { sed -n "s/^$2=//p" "$1/MANIFEST.txt" 2>/dev/null; }   # mget <folder> <key>: every value of that key
mset_channel() {  # mset_channel <folder> <channel> <file with the channel's new lines>: the channel's lines replaced
  local tmp; tmp=$(mktemp "$1/.MANIFEST.XXXXXX") || return 2
  { grep -v "^$2\." "$1/MANIFEST.txt"; cat "$3"; } > "$tmp" && mv -f "$tmp" "$1/MANIFEST.txt"
}
lock() { exec 9>"$1/.lock"; flock -w 600 9 || { echo "FAIL  $1 is locked by another run for 10 minutes"; exit 1; }; }

# the steps of the run, one tab-separated line each: label, verdict, what, log, report, time
steps_file() { echo "$1/.steps-$2"; }

# report <folder> <channel> <verdict>: failure-report-<channel>.md from the steps file
report() {
  report_steps "$(steps_file "$1" "$2")" "$1/failure-report-$2.md" "$2" "$(mget "$1" version)" "$(mget "$1" commit)" "$3"
}
# report_steps <steps file> <report.md> <channel> <version> <commit> <verdict> [<title>]: the failure report of those steps.
# <verdict> --list prints every failure as one tab-separated line instead (release-keep.sh failures); <title> replaces the
# report's "the <channel> release run of <version> on <commit>" (a re-run's report).
report_steps() {
  python3 - "$@" <<'PY'
import collections, json, os, re, sys, xml.etree.ElementTree as ET
steps_path, out, ch, version, commit, verdict = sys.argv[1:7]
title = sys.argv[7] if len(sys.argv) > 7 else ''
ANSI = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')
ERROR_HINT = re.compile(r'(?i)(\bfail\b|\bfailed\b|\berror\b|\bexception\b|\bfatal\b|traceback|caused by|npm err!|\bcannot\b|\bdenied\b|\brefused\b|timed out|no such|\bnot found\b)')
def clean(s): return ANSI.sub('', s or '').strip()
def first_lines(s, n=12):
    lines = [l.rstrip() for l in clean(s).splitlines() if l.strip()]
    return '\n'.join(lines[:n]) + ('\n...' if len(lines) > n else '')
def signature(msg):
    # The FIRST line that reads like an error, not the first line of the message: a step's message is the log's
    # tail, and the tail window starts wherever it starts - usually a stack-trace line or an npm warning. On
    # 2026-10-25 the groups were named after such a line, which told nobody which root cause it was.
    lines = [x.strip() for x in clean(msg).splitlines() if x.strip()]
    l = next((x for x in lines if ERROR_HINT.search(x)), lines[0] if lines else '(no message)')
    l = re.sub(r'\d+(\.\d+)?(ms|s)?', 'N', l)
    l = re.sub(r'[A-Za-z]:\\[^\s\'"]+|/[^\s\'"]+/[^\s\'"]+', '<path>', l)
    return l.strip()[:160]
def tail(path, n=40, label=None):
    if not os.path.isfile(path):
        return '(the log %s was never written: the step died before its first line)' % path
    try:
        # A log that several steps write (dp-ci.sh win release: the whole run) holds this step between its own
        # '######## <label> START' and '... END' lines, so the excerpt comes from there. The file's last lines are
        # whatever ran last: on 2026-10-26 the pack's failure was shown with the electron light set's end.
        if label:
            start, end, sec = '######## %s START' % label, '######## %s END' % label, None
            with open(path, 'rb') as f:
                for raw in f:
                    line = raw.decode('utf-8', 'replace').rstrip('\r\n')
                    if line.startswith(start): sec = collections.deque(maxlen=n)
                    elif sec is not None and line.startswith(end): break
                    elif sec is not None: sec.append(line)
            if sec:
                return clean('\n'.join(sec))
        with open(path, 'rb') as f: data = f.read()[-200000:]
        return '\n'.join(clean(data.decode('utf-8', 'replace')).splitlines()[-n:])
    except Exception as e:
        return '(the log could not be read: %s)' % e

steps = []
try:
    for line in open(steps_path, encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        if len(p) >= 6: steps.append(dict(label=p[0], verdict=p[1], what=p[2], log=p[3], report=p[4], time=p[5]))
except FileNotFoundError:
    pass

failures, counts, suites, flaky, cut_short = [], {}, {}, [], []
def playwright(st):
    r = st['report']
    try: d = json.load(open(r, encoding='utf-8'))
    except Exception as e: return 'the Playwright report %s could not be read (%s)' % (r, e)
    s = d.get('stats', {})
    counts[st['label']] = 'passed %s, failed %s, flaky %s, skipped %s' % (s.get('expected', 0), s.get('unexpected', 0), s.get('flaky', 0), s.get('skipped', 0))
    cut = {'never reached': 0, 'interrupted': 0}
    def walk(suite, path):
        for sp in suite.get('specs', []):
            for t in sp.get('tests', []):
                status = t.get('status')
                ran = t.get('results') or []
                # A run that ends before its tests do (the lane's time limit: Playwright's --global-timeout, dp-ci.sh
                # win_web_e2e) leaves the test it was in "interrupted" and those after it with no result at all.
                # Playwright counts both as skipped, and one that failed and was then cut off on its retry as flaky
                # (chain b's AI Hub on 889001e6). None of them passed, so each is a failure of the run, named for what
                # happened to it, and `show` (release-rerun.sh) lists it until a re-run of it passes.
                interrupted = any(x.get('status') == 'interrupted' for x in ran)
                if status == 'flaky' and interrupted and not any(x.get('status') == 'passed' for x in ran): status = 'unexpected'
                if status == 'flaky':
                    flaky.append('%s > %s (%s:%s)' % (st['label'], ' > '.join([x for x in path + [sp.get('title', '')] if x]), sp.get('file', '?'), sp.get('line', '?')))
                if status not in ('unexpected', 'skipped'): continue
                res = ran or [{}]
                last = res[-1]
                err = last.get('error') or {}
                msg = err.get('message') or '\n'.join(clean((e or {}).get('message')) for e in last.get('errors', [])) or ''
                ev = [a.get('path') for r_ in res for a in r_.get('attachments', []) if a.get('path')]
                tried = len([x for x in res if x.get('status') != 'interrupted'])
                if status == 'skipped' and not ran:
                    outcome, msg = 'never reached: the run ended before this test began, so it never ran', 'not run: the run ended before this test began'
                elif status == 'skipped' and interrupted:
                    outcome, msg = 'interrupted: the run ended while this test ran, so it never finished', msg or 'interrupted: the run ended while this test ran'
                elif interrupted:
                    outcome = 'failed (%d attempt%s), then interrupted on its retry: the run ended' % (tried, '' if tried == 1 else 's')
                elif status == 'unexpected':
                    outcome = 'failed (%d attempt%s)' % (len(res), '' if len(res) == 1 else 's')
                else:
                    outcome, msg = 'skipped: counts as a failure of the run', msg or 'skipped (no message: a test.skip or a condition in the spec)'
                test = ' > '.join([x for x in path + [sp.get('title', '')] if x])
                if interrupted or not ran:
                    cut['interrupted' if interrupted else 'never reached'] += 1
                    cut_short.append('%s > %s (%s:%s): %s' % (st['label'], test, sp.get('file', '?'), sp.get('line', '?'), outcome.split(':')[0]))
                failures.append(dict(step=st['label'], kind='test', file=sp.get('file', ''), title=sp.get('title', ''), report=r,
                    test=test, where='%s:%s' % (sp.get('file', '?'), sp.get('line', '?')), outcome=outcome, message=msg,
                    evidence=ev[:6] + [r]))
        for sub in suite.get('suites', []): walk(sub, path + [sub.get('title', '')])
    for top in d.get('suites', []): walk(top, [])
    if cut['never reached'] or cut['interrupted']:
        counts[st['label']] += '; cut short by the end of the run: %d never reached, %d interrupted' % (cut['never reached'], cut['interrupted'])
    return None
def robot_partial(st, r, err):
    """A run stopped mid-write (the stall guard, a kill, a full disk) leaves output.xml without its closing tags,
    so ElementTree refuses the whole file and this report used to say only "could not be read" - with none of the
    failed tests named, which is the one thing a reader needs. Read the text instead: every <test> written to the
    end carries its status."""
    try:
        text = open(r, encoding='utf-8', errors='replace').read()
    except Exception as e:
        return 'the Robot output %s could not be read (%s)' % (r, e)
    passed = failed = skipped = 0
    for m in re.finditer(r'<test\b[^>]*\bname="([^"]*)"[^>]*>(.*?)(</test>|\Z)', text, re.S):
        name, body, closed = m.group(1), m.group(2), m.group(3)
        # A test's own status is the LAST <status> in it; the ones before belong to its keywords (the first is
        # usually a passed setup keyword). A test the file ends inside never got its own status: not run.
        s = re.findall(r'<status[^>]*\bstatus="([A-Z ]+)"', body) if closed else []
        status = s[-1] if s else 'NOT RUN'
        message = ' '.join(clean(re.sub(r'<[^>]+>', ' ', body[:4000])).split())
        if status == 'PASS':
            passed += 1
        elif status == 'SKIP':
            skipped += 1
        else:
            failed += 1
        if status in ('FAIL', 'SKIP', 'NOT RUN'):
            failures.append(dict(step=st['label'], kind='test', file='', title=name, report=r, test=name, where=os.path.basename(r),
                outcome='failed' if status == 'FAIL' else 'skipped or not run: counts as a failure of the run',
                message=message or '(no message)', evidence=[os.path.join(os.path.dirname(r), 'log.html'), r]))
    counts[st['label']] = 'passed %d, failed %d, skipped %d (partial: the file was cut short)' % (passed, failed, skipped)
    return ('the Robot output %s was cut short (%s); %d tests were readable in it, the rest of the file was never '
            'written' % (os.path.basename(r), err, passed + failed + skipped))
def robot(st):
    r = st['report']
    try: root = ET.parse(r).getroot()
    except Exception as e: return robot_partial(st, r, e)
    stat = root.find('statistics/total/stat')
    if stat is not None: counts[st['label']] = 'passed %s, failed %s, skipped %s' % (stat.get('pass', 0), stat.get('fail', 0), stat.get('skip', 0))
    parent = {c: p for p in root.iter() for c in p}
    for t in root.iter('test'):
        s = t.find('status'); status = s.get('status') if s is not None else '?'
        names, p = [], parent.get(t)
        while p is not None:
            if p.tag == 'suite': names.insert(0, p.get('name', ''))
            p = parent.get(p)
        top = names[-1] if names else '?'
        sc = suites.setdefault(top, {'tests': 0, 'PASS': 0, 'FAIL': 0, 'SKIP': 0, 'source': ''})
        sc['tests'] += 1; sc[status] = sc.get(status, 0) + 1
        for p in [parent.get(t)]:
            if p is not None and p.get('source'): sc['source'] = os.path.basename(p.get('source'))
        if status in ('FAIL', 'SKIP', 'NOT RUN'):
            failures.append(dict(step=st['label'], kind='test', file=sc['source'] or top, title=t.get('name', ''), report=r,
                test=' > '.join(names + [t.get('name', '')]), where=sc['source'] or top,
                outcome='failed' if status == 'FAIL' else 'skipped: counts as a failure of the run',
                message=(s.text or '') if s is not None else '', evidence=[os.path.join(os.path.dirname(r), 'log.html'), r]))
    return None

notes = {}
for st in steps:
    n = len(failures); note = None
    if st['report'] and os.path.isfile(st['report']):
        note = robot(st) if st['report'].endswith('.xml') else playwright(st)
    elif st['report']:
        note = 'no test report at %s (the step did not get that far)' % st['report']
    if note: notes[st['label']] = note
    if st['verdict'] != 'PASS' and len(failures) == n:
        where = (st['log'] or '-') if not st['log'] or os.path.isfile(st['log']) else st['log'] + ' (never written)'
        failures.append(dict(step=st['label'], kind='step', file='', title='', report=st['report'],
            test='(the step itself: %s)' % st['what'], where=where,
            outcome='step %s with no failed test in its report%s' % (st['verdict'], (': ' + note) if note else ''),
            message=tail(st['log'], label=st['label']) if st['log'] else '(no log)', evidence=[x for x in (st['log'], st['report']) if x]))

if verdict == '--list':
    # release-rerun.sh: every failure, one line, each field on one line (a test title may hold a line break)
    one = lambda v: ' '.join(str(v or '').split())
    for f in failures: print('\t'.join(one(f.get(k)) for k in ('step', 'kind', 'test', 'file', 'title', 'report')))
    sys.exit(0)
L = ['# Failure report: ' + (title or 'the %s release run of %s on %s' % (ch, version, commit[:8])), '',
     'Verdict of the run: **%s**. Written by asbl/ci/release-keep.sh at the end of the run; nothing in it was fixed or applied.' % verdict, '',
     '## The steps', '', '| step | verdict | tests | log | test report |', '|---|---|---|---|---|']
for st in steps:
    L.append('| %s: %s | %s | %s | %s | %s |' % (st['label'], st['what'], st['verdict'], counts.get(st['label'], notes.get(st['label'], '-')), st['log'] or '-', st['report'] or '-'))
if suites:
    L += ['', '## Robot UAT by suite', '', '| suite | file | tests | passed | failed | skipped |', '|---|---|---|---|---|---|']
    for name, sc in suites.items():
        L.append('| %s | %s | %d | %d | %d | %d |' % (name, sc['source'], sc['tests'], sc.get('PASS', 0), sc.get('FAIL', 0), sc.get('SKIP', 0) + sc.get('NOT RUN', 0)))
L += ['', '## Every failure (%d)' % len(failures), '']
if not failures:
    L.append('None: every step passed and no test failed or was skipped.')
for i, f in enumerate(failures, 1):
    L += ['### %d. %s' % (i, f['test']), '', '- step: %s' % f['step'], '- where: %s' % f['where'], '- outcome: %s' % f['outcome'],
          '- evidence: %s' % ', '.join(f['evidence']), '', '```text', first_lines(f['message'], 40 if f['outcome'].startswith('step') else 12) or '(no message)', '```', '']
# the tests the end of the run cut short, beside the failures above (each is one of them): what a capped run never proved
if cut_short:
    L += ['## Cut short by the end of the run (%d): never reached or interrupted, so not proven' % len(cut_short), ''] + ['- ' + x for x in cut_short] + ['']
if flaky:
    L += ['## Flaky: failed, then passed on the retry (not failures of the run, listed to be looked at)', ''] + ['- ' + x for x in flaky] + ['']
groups = {}
for i, f in enumerate(failures, 1): groups.setdefault(signature(f['message']), []).append(i)
L += ['## Grouped by root cause', '']
if not failures:
    L.append('Nothing to group: the run is green.')
else:
    L += ['The run groups the failures by the first line of their message that reads like an error - not the first line,',
          'which is wherever the log tail happens to begin (the same line = one group). A group is a starting point,',
          'not a cause: the run analyses and fixes nothing. Whoever reads this writes, under each group, the root cause, what changed',
          'since the test last passed, the fix proposed and how to verify it; the fix waits for the owner\'s go.', '']
    for g, (sig, ids) in enumerate(groups.items(), 1):
        L += ['### Group %d: %s' % (g, sig), '', '- failures: %s' % ', '.join('#%d' % i for i in ids),
              '- root cause: (to be written)', '- what changed since it last passed: (to be written)',
              '- fix proposed: (to be written; not applied)', '- how to verify: (to be written)', '']
open(out, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('FAILURES %d (%d group%s): %s' % (len(failures), len(groups), '' if len(groups) == 1 else 's', out))
PY
}

summary() {  # summary <folder> <channel>: each artifact of the channel, its proofs, where it sits
  local f="$1" ch="$2" l name size sha
  echo "KEPT  $ch channel of $(mget "$f" version) on $(mget "$f" commit | cut -c1-8): verdict $(mget "$f" "$ch.result"), folder $f"
  mget "$f" "$ch.file" | while read -r name size sha; do
    echo "KEPT    $name  ${size#size=} bytes  ${sha}  ->  $f/$name"
  done
  mget "$f" "$ch.image" | while read -r l; do
    echo "KEPT    image $l  (in this host's Docker daemon$([ -s "$f/$IMAGE_FILE" ] && echo ", and as a file: $f/$IMAGE_FILE"))"; done
  mget "$f" "$ch.proof" | sed 's/^/PROOF   /'
  echo "REPORT  $f/failure-report-$ch.md"
}

check() {  # check <folder> [channel]: rc 0 = everything as the manifest says
  local f="$1" chs="${2:-docker windows}" ch bad=0 n=0 name size sha got img id rest have
  [ -f "$f/MANIFEST.txt" ] || { echo "MISSING $f/MANIFEST.txt: no kept release there"; return 1; }
  for ch in $chs; do
    while read -r name size sha; do
      [ -n "$name" ] || continue; n=$((n + 1)); sha=${sha#sha256=}
      if [ ! -f "$f/$name" ]; then echo "MISSING $f/$name: the manifest keeps it ($ch), the folder does not have it"; bad=1; continue; fi
      got=$(sha_of "$f/$name")
      if [ "$got" = "$sha" ]; then echo "OK      $name  sha256 $sha"
      else echo "CHANGED $f/$name: sha256 is $got, the manifest says $sha ($ch): it is not the file the run proved"; bad=1; fi
    done < <(mget "$f" "$ch.file")
    while read -r img id rest; do
      [ -n "$img" ] || continue; n=$((n + 1)); id=${id#id=}
      for t in "$img" ${rest#built_as=}; do
        have=$(docker image inspect "$t" --format '{{.Id}}' 2>/dev/null)
        if [ "$have" = "$id" ]; then echo "OK      image $t  id $id"
        elif [ -z "$have" ] && [ -s "$f/$IMAGE_FILE" ]; then echo "NOTE    image $t is not in this host's Docker daemon now (its nightly image cleanup?): the upload loads it from $f/$IMAGE_FILE and checks its id"
        elif [ "$t" = "$img" ] && [ -n "${rest#built_as=}" ]; then echo "NOTE    image $t is ${have:-not on this host} now (another build of this version tagged it?): the upload tags it again from ${rest#built_as=}"
        else echo "CHANGED image $t: its id is ${have:-not on this host}, the manifest says $id ($ch)"; bad=1; fi
      done
    done < <(mget "$f" "$ch.image")
  done
  [ "$n" -gt 0 ] || { echo "MISSING nothing kept for ${2:-either channel} in $f"; return 1; }
  return "$bad"
}

# THE FILES CHECKED FROM INSIDE (inside <folder> docker|windows): a kept file's sha256 says it is the file the run proved,
# not that the run packed this version of this commit. So, read-only, against the folder's manifest (version, commit):
#   windows  datapallas.zip and datapallas-server.zip: CHANGELOG.md's first heading is "## <version> - ", and the
#            product's own versioned jars (rb-common-<version>.jar; any rb-* or datapallas-* jar with a version in its
#            name) are of this version and no other; datapallas-src.zip holds exactly the files of `git archive <commit>`
#            (names and CRC32s, as DataPallasSourceAssembler makes it); release-files-windows.txt names this commit and
#            version;
#   docker   datapallas-server-docker.zip's compose pins <RELEASE_IMAGE_REPO>:<version> and no other tag of it, and the
#            kept image's label "version" is the version: read from this host's Docker daemon by the manifest's image id,
#            or from the kept image file (its config, whose sha256 is that id). The image carries no commit inside: its
#            id and build tag are what `check` checks;
#   both     each binary zip's copies of db-template/ equal the commit's (line endings aside; a file the assemblers
#            leave out of a zip is no copy). A file an assembler writes over its copy is compared with what the assembler
#            makes from this commit instead (INSIDE_REWRITTEN, below, each with its reason).
# The commit's files are read from this checkout's git (no fetch): a commit it cannot read is a mismatch.
# Prints one OK line per file checked, a MISMATCH line for each mismatch, then INSIDE PASS|FAIL; rc 0 PASS, 1 FAIL, 2 when
# there is no kept release in the folder.
# The files an assembler writes over its db-template copy, four items each: the path below db-template/, the zips it
# happens in (all = the three binary zips), what the copy must equal instead (<path at the commit>, optionally
# |<python regex>|<replacement> applied to it, as the assembler does), and why.
INSIDE_REWRITTEN=(
  _apps/cms-webportal-playground/wp-plugins/datapallas-portal/resources/views/single-paystub.php all
  bkend/reporting/src/main/external-resources/template/samples/webportal/single-paystub.php
  "NoExeAssembler copies the webportal sample over the plugin's copy (16.6.2: an option name re-cased in the sample)"
  _apps/cms-webportal-playground/wp-plugins/datapallas-portal/resources/views/page-my-documents.php all
  bkend/reporting/src/main/external-resources/template/samples/webportal/page-my-documents-paystubs.php
  "NoExeAssembler copies the webportal sample page-my-documents-paystubs.php over the plugin's copy"
  _apps/cms-webportal-playground/wp-plugins/datapallas-portal/resources/views/content-type-paystub.png all
  bkend/reporting/src/main/external-resources/template/samples/webportal/content-type-paystub.png
  "NoExeAssembler copies the webportal sample over the plugin's copy"
  config/_internal/settings.xml datapallas-server-docker.zip
  'asbl/src/main/external-resources/db-template/config/_internal/settings.xml|(?is)<runtime\b[^>]*>\s*windows\s*</runtime>|<runtime>docker</runtime>'
  "DockerAssembler sets the runtime to docker in the Docker zip's copy"
)
inside() {  # inside <folder> <channel>
  [ -f "$1/MANIFEST.txt" ] || { echo "FAIL  no kept release in '$1' (no MANIFEST.txt)"; return 2; }
  RELEASE_IMAGE_REPO="$RELEASE_IMAGE_REPO" IMAGE_FILE="$IMAGE_FILE" INSIDE_REWRITTEN=$(printf '%s\n' "${INSIDE_REWRITTEN[@]}") \
    python3 -I - "$1" "$2" <<'PY'
import hashlib, json, os, re, subprocess, sys, tarfile, zipfile, zlib

folder, channel = sys.argv[1], sys.argv[2]
TEMPLATE = 'asbl/src/main/external-resources/db-template/'
BINARY_ZIPS = {'windows': ['datapallas.zip', 'datapallas-server.zip'], 'docker': ['datapallas-server-docker.zip']}
manifest = {}
for line in open(os.path.join(folder, 'MANIFEST.txt'), encoding='utf-8', errors='replace'):
    if '=' in line and not line.startswith('#'):
        k, v = line.rstrip('\r\n').split('=', 1)
        manifest.setdefault(k, []).append(v)
version, commit = manifest.get('version', [''])[0], manifest.get('commit', [''])[0]
mismatches = []
def ok(name, what):
    print('OK        %s: %s' % (name, what))
def bad(name, what):
    mismatches.append(name); print('MISMATCH  %s: %s' % (name, what))
def git(*args):
    return subprocess.run(['git'] + list(args), capture_output=True)
def same_text(a, b):
    return a.replace(b'\r\n', b'\n') == b.replace(b'\r\n', b'\n')
def zip_of(name):
    path = os.path.join(folder, name)
    if not os.path.isfile(path):
        bad(name, 'missing from %s' % folder); return None
    try:
        z = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError) as e:
        bad(name, 'not a zip (%s)' % e); return None
    if not z.namelist():
        bad(name, 'an empty zip'); return None
    return z
def top_of(z):   # the installation folder: every entry's first folder (DataPallas/)
    return z.namelist()[0].split('/')[0] + '/'

print('INSIDE    the %s files of %s on %s, %s' % (channel, version, commit[:8], folder))
commit_ok = git('cat-file', '-e', commit + '^{commit}').returncode == 0 if re.match(r'^[0-9a-f]{40}$', commit) else False
if not commit_ok:
    bad('MANIFEST.txt', 'git cannot read its commit "%s" in this checkout: nothing can be compared with it' % commit)

blobs = {}
def read_blobs(shas):   # git cat-file --batch: every blob once
    want = [s for s in shas if s not in blobs]
    if not want:
        return
    out = subprocess.run(['git', 'cat-file', '--batch'], input=('\n'.join(want) + '\n').encode(), capture_output=True).stdout
    i = 0
    for s in want:
        head_end = out.index(b'\n', i)
        size = int(out[i:head_end].split()[2])
        blobs[s] = out[head_end + 1:head_end + 1 + size]
        i = head_end + 1 + size + 1
def tree_at(prefix):   # {path: blob sha} of the commit's files under a prefix
    rows = git('ls-tree', '-r', commit, '--', prefix).stdout.decode('utf-8', 'replace').splitlines()
    return {r.split('\t', 1)[1]: r.split()[2] for r in rows if r.split()[1] == 'blob'}

r = [l for l in os.environ.get('INSIDE_REWRITTEN', '').split('\n') if l]
rewritten = {}
for i in range(0, len(r) - 3, 4):
    rewritten[r[i]] = (r[i + 1], r[i + 2], r[i + 3])
def expected_rewrite(spec):
    path, *sub = spec.split('|')
    t = tree_at(path)
    if path not in t:
        return None
    read_blobs([t[path]])
    data = blobs[t[path]]
    if sub:
        data = re.sub(sub[0], sub[1], data.decode('utf-8')).encode('utf-8')
    return data

def template_copies(name, z):
    """each db-template file the zip holds equals the commit's, line endings aside"""
    template = tree_at(TEMPLATE)
    read_blobs(template.values())
    top, entries = top_of(z), {i.filename: i for i in z.infolist()}
    copies = eol = over = 0
    wrong = []
    for path, sha in sorted(template.items()):
        rel = path[len(TEMPLATE):]
        info = entries.get(top + rel)
        if info is None:
            continue
        copies += 1
        want, why = blobs[sha], ''
        if rel in rewritten and rewritten[rel][0] in ('all', name):
            want, why = expected_rewrite(rewritten[rel][1]), rewritten[rel][2]
            over += 1
            if want is None:
                wrong.append('%s (what the assembler copies over it, %s, is not in the commit)' % (rel, rewritten[rel][1])); continue
        if zlib.crc32(want) & 0xffffffff == info.CRC:
            continue
        if same_text(z.read(info), want):
            eol += 1; continue
        wrong.append(rel + (' (%s)' % why if why else ''))
    for w in wrong[:10]:
        bad(name, 'its db-template copy %s%s differs from commit %s' % (top, w, commit[:8]))
    if len(wrong) > 10:
        bad(name, '%d more db-template copies differ' % (len(wrong) - 10))
    if not wrong:
        ok(name, '%d db-template copies equal commit %s (%d by line endings only; %d written over by an assembler, compared '
                 'with what it copies)' % (copies, commit[:8], eol, over))

def changelog_and_jars(name, z):
    top = top_of(z)
    try:
        heads = [l for l in z.read(top + 'CHANGELOG.md').decode('utf-8', 'replace').splitlines() if l.startswith('## ')]
    except KeyError:
        heads = None
    if heads is None:
        bad(name, 'no %sCHANGELOG.md' % top)
    elif not heads or not heads[0].startswith('## %s - ' % version):
        bad(name, '%sCHANGELOG.md\'s first heading is "%s", not "## %s - ..."' % (top, heads[0] if heads else 'none', version))
    else:
        ok(name, 'CHANGELOG.md\'s first heading is "%s"' % heads[0])
    jars = []
    for n in z.namelist():
        m = re.match(r'^(rb|datapallas)-.+?-(\d+(?:\.\d+)+)(-SNAPSHOT)?\.jar$', n.rsplit('/', 1)[-1])
        if m:
            jars.append((n, m.group(2)))
    others = [n for n, v in jars if v != version]
    for n in others:
        bad(name, 'the product jar %s is not of %s' % (n, version))
    if not jars:
        bad(name, 'no versioned product jar (rb-common-%s.jar)' % version)
    elif not others:
        ok(name, 'the product\'s versioned jars are of %s: %s' % (version, ', '.join(n.rsplit('/', 1)[-1] for n, _ in jars)))

if channel == 'windows':
    for name in BINARY_ZIPS['windows']:
        z = zip_of(name)
        if z:
            changelog_and_jars(name, z)
            if commit_ok:
                template_copies(name, z)
    z = zip_of('datapallas-src.zip')
    if z and commit_ok:
        got = {i.filename: i.CRC for i in z.infolist() if not i.is_dir()}
        top = top_of(z)
        p = subprocess.Popen(['git', 'archive', '--format=tar', '--prefix=' + top, commit], stdout=subprocess.PIPE)
        want = {}
        with tarfile.open(fileobj=p.stdout, mode='r|') as t:
            for m in t:
                if m.isfile():
                    want[m.name] = zlib.crc32(t.extractfile(m).read()) & 0xffffffff
                elif m.issym():
                    want[m.name] = None
        p.wait()
        extra, lacking = sorted(set(got) - set(want)), sorted(set(want) - set(got))
        differ = sorted(n for n in set(got) & set(want) if got[n] != want[n])
        if extra or lacking or differ:
            for what, names in (('not in git archive %s' % commit[:8], extra), ('missing (git archive %s has it)' % commit[:8], lacking),
                                ('differs from git archive %s' % commit[:8], differ)):
                if names:
                    bad('datapallas-src.zip', '%d file(s) %s: %s%s' % (len(names), what, ', '.join(names[:5]), ' ...' if len(names) > 5 else ''))
        else:
            ok('datapallas-src.zip', 'exactly the files of git archive %s (%d, names and CRC32s)' % (commit[:8], len(want)))
    listing = os.path.join(folder, 'release-files-windows.txt')
    if not os.path.isfile(listing):
        bad('release-files-windows.txt', 'missing from %s' % folder)
    else:
        text = open(listing, encoding='utf-8', errors='replace').read()
        c = re.findall(r'^commit +(\S+)', text, re.M); v = re.findall(r'^version +(\S+)', text, re.M)
        if c == [commit] and v == [version]:
            ok('release-files-windows.txt', 'names commit %s and version %s' % (commit[:8], version))
        else:
            bad('release-files-windows.txt', 'names commit %s and version %s, not %s and %s'
                % (','.join(x[:8] for x in c) or 'none', ','.join(v) or 'none', commit[:8], version))
else:
    repo = os.environ['RELEASE_IMAGE_REPO']
    name = BINARY_ZIPS['docker'][0]
    z = zip_of(name)
    if z:
        top = top_of(z)
        try:
            compose = z.read(top + 'docker-compose.yml').decode('utf-8', 'replace')
            tags = re.findall(r'^\s*image:\s*' + re.escape(repo) + r':(\S+)', compose, re.M)   # a # line is no pin
            if tags and set(tags) == {version}:
                ok(name, 'its compose pins %s:%s' % (repo, version))
            else:
                bad(name, 'its compose pins %s, not %s:%s' % (', '.join('%s:%s' % (repo, t) for t in tags) or 'no %s tag' % repo, repo, version))
        except KeyError:
            bad(name, 'no %sdocker-compose.yml' % top)
        if commit_ok:
            template_copies(name, z)
    image = (manifest.get('docker.image') or [''])[-1]
    m = re.search(r' id=(sha256:[0-9a-f]{64})', image)
    if not m:
        bad('image', 'the manifest names no kept image id (docker.image=%s)' % image)
    else:
        image_id, label, where = m.group(1), None, ''
        try:
            d = subprocess.run(['docker', 'image', 'inspect', image_id, '--format', '{{index .Config.Labels "version"}}'],
                               capture_output=True, text=True)
        except OSError:
            d = None
        if d is not None and d.returncode == 0 and d.stdout.strip() not in ('', '<no value>'):
            label, where = d.stdout.strip(), 'in this host\'s Docker daemon'
        else:
            image_file = os.path.join(folder, os.environ['IMAGE_FILE'])
            try:
                with tarfile.open(image_file) as t:
                    config_name = json.load(t.extractfile('manifest.json'))[0]['Config']
                    config = t.extractfile(config_name).read()
                if 'sha256:' + hashlib.sha256(config).hexdigest() != image_id:
                    bad('image', '%s is not the image %s (its config\'s sha256 differs)' % (image_file, image_id[:19]))
                else:
                    label = (json.loads(config).get('config') or {}).get('Labels', {}).get('version')
                    where = 'from %s' % os.path.basename(image_file)
            except (OSError, KeyError, ValueError, tarfile.TarError) as e:
                bad('image', '%s is in neither this host\'s Docker daemon nor a readable %s (%s): its label cannot be read'
                    % (image_id[:19], image_file, e))
        if where:
            if label == version:
                ok('image', '%s, its label version is %s (%s); it carries no commit inside: its id and build tag are '
                            'what release-keep.sh check checks' % (image_id[:19], label, where))
            else:
                bad('image', '%s, its label version is %s (%s), not %s' % (image_id[:19], label, where, version))
if mismatches:
    print('INSIDE FAIL the %s files of %s on %s: %d mismatch(es), in %s' % (channel, version, commit[:8], len(mismatches),
                                                                       ', '.join(sorted(set(mismatches)))))
    sys.exit(1)
print('INSIDE PASS the %s files of %s on %s: each is this version and this commit, from inside' % (channel, version, commit[:8]))
PY
}

keep() {  # keep <channel> <version> <commit> <name>=<path>... [image=<repo>:<tag> [image-file=<its docker save>]]
  local ch="$1" v="$2" c="$3" a name path sha same=1 img="" imgfile="" id old dest t new
  shift 3
  folder_of "$v" "$c" || exit 2
  lock "$F"
  new=$(mktemp "$F/.keep-$ch.XXXXXX") || exit 2
  for a in "$@"; do
    name=${a%%=*}; path=${a#*=}
    if [ "$name" = image-file ]; then imgfile=$path; continue; fi
    if [ "$name" = image ]; then
      id=$(docker image inspect "$path" --format '{{.Id}}' 2>/dev/null) || { echo "FAIL  keep: the image $path is not on this host"; rm -f "$new"; exit 1; }
      docker tag "$path" "$RELEASE_IMAGE_REPO:$v" || { echo "FAIL  keep: docker tag $RELEASE_IMAGE_REPO:$v"; rm -f "$new"; exit 1; }
      img="$RELEASE_IMAGE_REPO:$v id=$id built_as=$path"
      [ "$(mget "$F" "$ch.image")" = "$img" ] || same=0
      continue
    fi
    printf '%s' "$name" | grep -qE '^[A-Za-z0-9._-]+$' || { echo "FAIL  keep: bad name '$name'"; rm -f "$new"; exit 2; }
    [ -s "$path" ] || { echo "FAIL  keep: $path is missing or empty"; rm -f "$new"; exit 1; }
    sha=$(sha_of "$path")
    echo "$name size=$(stat -c %s "$path") sha256=$sha" >> "$new"
    [ "$(sha_of "$F/$name" 2>/dev/null)" = "$sha" ] && mget "$F" "$ch.file" | grep -qx "$name size=[0-9]* sha256=$sha" || same=0
  done
  [ "$(mget "$F" "$ch.file" | cut -d' ' -f1 | sort | tr '\n' ' ')" = "$(cut -d' ' -f1 "$new" | sort | tr '\n' ' ')" ] || same=0
  if [ "$same" = 1 ]; then
    echo "KEEP  the $ch set in $F is already these very files (the same sha256$([ -n "$img" ] && echo " and image id")): reused, nothing copied"
    # a set kept before the image was kept as a file gets that file now
    [ -n "$img" ] && [ -s "$imgfile" ] && [ ! -s "$F/$IMAGE_FILE" ] && mv -f "$imgfile" "$F/$IMAGE_FILE"
    for a in "$@"; do path=${a#*=}; case "$path" in "$RELEASE_ARTIFACTS_DIR"/*/.incoming-*) rm -f "$path" ;; esac; done
    rm -f "$new"; return 0
  fi
  old=$(mget "$F" "$ch.time" | tail -1)
  if [ -n "$(mget "$F" "$ch.file")$(mget "$F" "$ch.image")" ]; then
    dest="$F/replaced/$ch-${old:-$(now)}"; mkdir -p "$dest" || exit 2
    mget "$F" "$ch.file" | while read -r name _; do [ -f "$F/$name" ] && mv -f "$F/$name" "$dest/"; done
    [ -f "$F/failure-report-$ch.md" ] && mv -f "$F/failure-report-$ch.md" "$dest/"
    [ -n "$(mget "$F" "$ch.image")" ] && [ -f "$F/$IMAGE_FILE" ] && mv -f "$F/$IMAGE_FILE" "$dest/"
    grep "^$ch\." "$F/MANIFEST.txt" > "$dest/MANIFEST-$ch.txt"
    echo "REPLACED  the earlier $ch set of this version and commit (run ${old:-?}) moved to $dest: kept, not deleted; the new one comes in whole"
  fi
  t=$(mktemp "$F/.lines-$ch.XXXXXX") || exit 2
  echo "$ch.time=$(now)" > "$t"
  for a in "$@"; do
    name=${a%%=*}; path=${a#*=}
    case "$name" in image|image-file) continue ;; esac
    case "$path" in "$RELEASE_ARTIFACTS_DIR"/*) mv -f "$path" "$F/$name" ;; *) cp -f "$path" "$F/.$name.part" && mv -f "$F/.$name.part" "$F/$name" ;; esac ||
      { echo "FAIL  keep: could not put $name in $F"; rm -f "$new" "$t"; exit 1; }
    sha=$(sed -n "s/^$name size=[0-9]* sha256=//p" "$new")
    [ "$(sha_of "$F/$name")" = "$sha" ] || { echo "FAIL  keep: $F/$name is not the file given (sha256 differs after the copy)"; rm -f "$new" "$t"; exit 1; }
    echo "KEEP  $name  sha256 $sha  ->  $F/$name"
  done
  if [ -n "$img" ] && [ -s "$imgfile" ]; then
    case "$imgfile" in "$RELEASE_ARTIFACTS_DIR"/*) mv -f "$imgfile" "$F/$IMAGE_FILE" ;; *) cp -f "$imgfile" "$F/.$IMAGE_FILE.part" && mv -f "$F/.$IMAGE_FILE.part" "$F/$IMAGE_FILE" ;; esac ||
      { echo "FAIL  keep: could not put $IMAGE_FILE in $F"; rm -f "$new" "$t"; exit 1; }
    echo "KEEP  $IMAGE_FILE  ->  $F/$IMAGE_FILE  (the image as a file: docker load -i brings it back, its id is checked)"
  fi
  sed "s/^/$ch.file=/" "$new" >> "$t"
  [ -n "$img" ] && { echo "$ch.image=$img" >> "$t"; echo "KEEP  image $RELEASE_IMAGE_REPO:$v  ${img#* id=}"; }
  mset_channel "$F" "$ch" "$t"; rm -f "$new" "$t"
}

cmd="${1:-}"; [ "$#" -gt 0 ] && shift
case "$cmd" in
  begin)
    [ "$#" = 3 ] || usage; channel_ok "$1"; folder_of "$2" "$3" || exit 2
    : > "$(steps_file "$F" "$1")"; echo "$F" ;;
  step)
    [ "$#" -ge 6 ] || usage; channel_ok "$1"; folder_of "$2" "$3" || exit 2
    case "$5" in PASS|FAIL|NOT_RUN) ;; *) echo "FAIL  step: the verdict must be PASS, FAIL or NOT_RUN (got '$5')"; exit 2 ;; esac
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$4" "$5" "$6" "${7:-}" "${8:-}" "$(now)" | tr -d '\r' >> "$(steps_file "$F" "$1")"
    echo "STEP  $4 $5: $6" ;;
  step-verdict)
    [ "$#" = 4 ] || usage; channel_ok "$1"; folder_of "$2" "$3" || exit 2
    awk -F'\t' -v l="$4" '$1 == l { v = $2 } END { print v }' "$(steps_file "$F" "$1")" 2>/dev/null; exit 0 ;;
  keep)
    [ "$#" -ge 4 ] || usage; channel_ok "$1"; keep "$@" ;;
  finish)
    [ "$#" -ge 4 ] || usage; channel_ok "$1"; folder_of "$2" "$3" || exit 2
    case "$4" in PASS|FAIL) ;; *) echo "FAIL  finish: the verdict must be PASS or FAIL"; exit 2 ;; esac
    lock "$F"
    t=$(mktemp "$F/.lines-$1.XXXXXX") || exit 2
    grep "^$1\.\(time\|file\|image\)=" "$F/MANIFEST.txt" > "$t"
    grep -q "^$1\.time=" "$t" || echo "$1.time=$(now)" >> "$t"
    { echo "$1.result=$4"; echo "$1.finished=$(now)"; [ -n "${5:-}" ] && echo "$1.log=$5"; echo "$1.report=failure-report-$1.md"
      awk -F'\t' -v ch="$1" '{ printf "%s.proof=%s %s: %s%s\n", ch, $1, $2, $3, ($4 != "" ? " (log " $4 ")" : "") }' "$(steps_file "$F" "$1")"; } >> "$t"
    mset_channel "$F" "$1" "$t"; rm -f "$t"
    report "$F" "$1" "$4"
    summary "$F" "$1" ;;
  check)
    [ "$#" -ge 1 ] || usage; check "$(abs "$1")" "${@:2}" ;;
  inside)
    [ "$#" = 2 ] || usage; channel_ok "$2"; f="$(abs "$1")"; inside "${f%/}" "$2" ;;
  failures)
    if [ "$#" = 1 ] && [ -f "$(abs "$1")" ]; then report_steps "$(abs "$1")" - steps "" "" --list; exit $?; fi
    [ "$#" = 2 ] || usage; channel_ok "$2"; f="$(abs "$1")"; f="${f%/}"
    [ -f "$f/MANIFEST.txt" ] || { echo "FAIL  no kept release in '$f'"; exit 2; }
    report_steps "$(steps_file "$f" "$2")" - "$2" "$(mget "$f" version)" "$(mget "$f" commit)" --list ;;
  report-steps)
    [ "$#" = 3 ] || usage; [ -f "$(abs "$1")" ] || { echo "FAIL  no steps file '$1'"; exit 2; }
    # the run's verdict: PASS only when every step passed
    v=$(awk -F'\t' '$2 != "PASS" { r = "FAIL" } END { print (r ? r : "PASS") }' "$(abs "$1")")
    report_steps "$(abs "$1")" "$(abs "$2")" re-run "" "" "$v" "$3" ;;
  show)
    f="$(abs "${1:-$(ls -1dt "$RELEASE_ARTIFACTS_DIR"/*/ 2>/dev/null | head -1)}")"; f="${f%/}"
    [ -f "$f/MANIFEST.txt" ] || { echo "no kept release in '${f:-$RELEASE_ARTIFACTS_DIR}'"; exit 1; }
    cat "$f/MANIFEST.txt"; echo
    for ch in docker windows; do [ -n "$(mget "$f" "$ch.time")" ] && summary "$f" "$ch"; done; true ;;
  *) usage ;;
esac
