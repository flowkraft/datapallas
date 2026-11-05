#!/usr/bin/env python3
"""Step 1's full set in 2, 3 or 4 runners: the layouts of asbl/ci/full-set-runners.txt, their check, each runner's share
as the regex dp-ci.sh takes (E2E_RUNNER_FILES), each runner's time on a real report, and the merge of the runners'
results into the lane's one log and one Playwright report.

Each runner is a Docker engine of its own (asbl/ci/e2e-runners.sh); its lane writes its own log and report in its own log
folder. Everything here only reads, except `merge`, which writes the two merged files and nothing else.

  full-set-runners.py check   [--lists F] [--checkout D]
      every layout (2, 3 and 4 jobs) against the full set's selection at the checkout (the files dp-ci.sh's full mode
      picks with its E2E_SPEC): each file in exactly one runner, the auth file and the Electron-only file in none, the
      specs that use the test licence key all in one runner. Prints the full set's count and each runner's files; a
      listed file that no longer exists is a WARN. Exit 0 good, 2 refused (the file named).
  full-set-runners.py files   <N> <runner> [--lists F] [--checkout D]
      that runner's files, one per line (path under frend/reporting/e2e/), after the check
  full-set-runners.py pattern <N> <runner> [--lists F] [--checkout D]
      its E2E_RUNNER_FILES, for asbl/ci/e2e-runners.sh run: its own files, or for the rest every file but the other
      runners' (so a file added later still runs); empty with 1 job (the whole full set)
  full-set-runners.py times   <N> --report <playwright.json>... [--max-off 15] [--lists F] [--checkout D]
      each runner's test minutes on each report (its tests' tries added up, as release-estimate.py files counts), the
      layout's mean and each runner's distance from it. Exit 1 when one is more than --max-off percent off
  full-set-runners.py merge   <N> <merged log> <log of runner 1> ... <log of runner N>
      the lane's one log and one report (<merged log without .log>-playwright.json) from the runners' logs and their
      reports, with the summary lines of a lane run whole (PIPELINE_START, the E2E_ lines, the Playwright result block,
      E2E_RESULT, PIPELINE_RESULT), so release-state.sh record-step1, release-keep.sh, release-rerun.sh and the
      orchestrator's result.txt and flaky.txt read them as they read one run. "-" for a runner that never ran: its files
      are named NOT_RUN in both, and the lane is red. Exit 0 when the lane is green, 1 red (both files written), 2 refused
      (nothing written)

Defaults: --lists is full-set-runners.txt beside this script, --checkout the repository this script is in.
Test: asbl/ci/tests/test-runner-lists.sh (on real reports, read only).
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LISTS = os.path.join(HERE, "full-set-runners.txt")
DEFAULT_CHECKOUT = os.path.dirname(os.path.dirname(HERE))
E2E_DIR = os.path.join("frend", "reporting", "e2e")
LAYOUTS = (2, 3, 4)
THE_REST = "the-rest"
# A spec that uses the test licence key: it activates, checks or deactivates it (the licence server holds one seat for
# the key, so two runners using it at once would take it from each other). Read in its code lines, not its comments.
LICENCE_USE = re.compile(
    r"deActivateLicenseKey\(|TEST_LICENSE_KEY|#btnActivateLicenseKey|#btnCheckLicenseKey|#deactivateLicenseKey"
    r"|/api/system/license/(?:activate|deactivate)|restoreDocumentBursterCleanState\(\s*true"
    r"|shouldDeactivateLicenseKey\s*=\s*true")


class Refused(Exception):
    pass


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---- the full set at the checkout ----

def full_set_spec(checkout):
    """dp-ci.sh's full-mode E2E_SPEC: the `export E2E_SPEC='...'` line followed by `mode=full`."""
    lines = open(os.path.join(checkout, "asbl", "ci", "dp-ci.sh"), encoding="utf-8", errors="replace").read().split("\n")
    for i, line in enumerate(lines):
        m = re.match(r"\s*export E2E_SPEC='(\^.+)'\s*$", line)
        if m and any(l.strip() == "mode=full" for l in lines[i + 1:i + 3]):
            return m.group(1)
    raise Refused("dp-ci.sh has no full-mode E2E_SPEC line (export E2E_SPEC='...' then mode=full): cannot tell the full set")


def full_set(checkout):
    """The spec files the full mode runs: Playwright matches E2E_SPEC against each file's absolute path."""
    root = os.path.join(checkout, E2E_DIR)
    spec = re.compile(full_set_spec(checkout))
    chosen, left_out = [], []
    for folder, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d != "node_modules")
        for name in sorted(names):
            if not name.endswith(".spec.ts"):
                continue
            path = os.path.join(folder, name)
            rel = os.path.relpath(path, root).replace(os.sep, "/")
            (chosen if spec.search(path) else left_out).append(rel)
    return sorted(chosen), sorted(left_out)


def code_lines(text):
    """The spec's lines without its comments (// lines and /* */ blocks that start a line)."""
    text = re.sub(r"(?ms)^\s*/\*.*?\*/", "", text)
    return [l for l in text.split("\n") if not re.match(r"\s*//", l)]


def licence_specs(checkout, files):
    root = os.path.join(checkout, E2E_DIR)
    found = []
    for f in files:
        text = open(os.path.join(root, f), encoding="utf-8", errors="replace").read()
        if any(LICENCE_USE.search(l) for l in code_lines(text)):
            found.append(f)
    return found


# ---- the lists ----

def read_lists(path):
    """{jobs: {runner: [files]}} and {jobs: rest runner}, refusing what the format does not allow."""
    layouts, rest = {}, {}
    for number, raw in enumerate(open(path, encoding="utf-8").read().split("\n"), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit():
            raise Refused("%s line %d: not '<jobs> <runner> <spec file>|%s': %s" % (path, number, THE_REST, line))
        jobs, runner, entry = int(parts[0]), int(parts[1]), parts[2]
        if jobs not in LAYOUTS or not 1 <= runner <= jobs:
            raise Refused("%s line %d: %d jobs, runner %d: jobs are 2, 3 or 4, runners 1 to jobs" % (path, number, jobs, runner))
        layout = layouts.setdefault(jobs, {})
        layout.setdefault(runner, [])
        if entry == THE_REST:
            if jobs in rest and rest[jobs] != runner:
                raise Refused("%d jobs: runners %d and %d are both %s; one runner is" % (jobs, rest[jobs], runner, THE_REST))
            rest[jobs] = runner
        else:
            layout[runner].append(entry)
    for jobs in LAYOUTS:
        if jobs not in layouts:
            raise Refused("%s has no layout for %d jobs" % (path, jobs))
        missing = [r for r in range(1, jobs + 1) if r not in layouts[jobs]]
        if missing:
            raise Refused("%d jobs: runner(s) %s not in %s" % (jobs, ", ".join(map(str, missing)), path))
        if jobs not in rest:
            raise Refused("%d jobs: no runner is %s (a new spec file would run nowhere)" % (jobs, THE_REST))
    return layouts, rest


def resolve(layouts, rest, chosen, left_out, warn):
    """{jobs: {runner: [files]}}: each runner's files at the checkout; the rest takes every file no other runner lists."""
    chosen_set, left_set = set(chosen), set(left_out)
    resolved = {}
    for jobs in LAYOUTS:
        seen = {}
        for runner in sorted(layouts[jobs]):
            for f in layouts[jobs][runner]:
                if f in seen:
                    raise Refused("%d jobs: %s is in runner %d and in runner %d: a file runs in one runner"
                                  % (jobs, f, seen[f], runner) if seen[f] != runner else
                                  "%d jobs: %s is listed twice in runner %d" % (jobs, f, runner))
                seen[f] = runner
                if f in left_set:
                    raise Refused("%d jobs: %s (runner %d) is not in the full set: dp-ci.sh's full mode leaves it out (the "
                                  "auth file and the Electron-only file run on their own)" % (jobs, f, runner))
                if f not in chosen_set:
                    warn("%d jobs: %s (runner %d) is no spec file of the checkout any more: left out" % (jobs, f, runner))
        listed_elsewhere = {f for f, r in seen.items() if r != rest[jobs]}
        resolved[jobs] = {}
        for runner in sorted(layouts[jobs]):
            if runner == rest[jobs]:
                files = [f for f in chosen if f not in listed_elsewhere]
            else:
                files = [f for f in layouts[jobs][runner] if f in chosen_set]
            if not files:
                raise Refused("%d jobs: runner %d has no file of the full set" % (jobs, runner))
            resolved[jobs][runner] = sorted(files)
    return resolved


def check_licence(resolved, licence):
    for jobs in LAYOUTS:
        where = {f: r for r, files in resolved[jobs].items() for f in files if f in licence}
        runners = sorted(set(where.values()))
        if len(runners) > 1:
            first = min(runners, key=lambda r: (-sum(1 for v in where.values() if v == r), r))
            strays = ", ".join("%s (runner %d)" % (f, r) for f, r in sorted(where.items()) if r != first)
            raise Refused("%d jobs: the specs that use the test licence key run in one runner (%d): %s elsewhere"
                          % (jobs, first, strays))


def load(args, quiet=False):
    warnings = []
    warn = warnings.append
    chosen, left_out = full_set(args.checkout)
    layouts, rest = read_lists(args.lists)
    resolved = resolve(layouts, rest, chosen, left_out, warn)
    licence = licence_specs(args.checkout, chosen)
    check_licence(resolved, licence)
    if not quiet:
        for w in warnings:
            print("WARN  " + w, file=sys.stderr)
    return dict(chosen=chosen, left_out=left_out, rest=rest, resolved=resolved, licence=licence, warnings=warnings)


# ---- the subcommands ----

def cmd_check(args):
    s = load(args)
    print("FULL SET  %d spec files at %s (dp-ci.sh's full mode); left out: %s"
          % (len(s["chosen"]), args.checkout, ", ".join(s["left_out"]) or "none"))
    print("LICENCE   the specs that use the test licence key: %s" % (", ".join(s["licence"]) or "none"))
    for jobs in LAYOUTS:
        for runner, files in sorted(s["resolved"][jobs].items()):
            print("%d JOBS  runner %d%s: %d files: %s" % (jobs, runner, " (the rest)" if runner == s["rest"][jobs] else "",
                                                       len(files), " ".join(os.path.basename(f)[:-len(".spec.ts")] for f in files)))
    print("CHECK OK  every file of the full set in exactly one runner of each layout%s"
          % ("; %d WARN" % len(s["warnings"]) if s["warnings"] else ""))
    return 0


def runner_files(s, jobs, runner):
    if jobs == 1 and runner == 1:
        return list(s["chosen"])
    if jobs not in LAYOUTS or runner not in s["resolved"][jobs]:
        raise Refused("no runner %d with %d jobs (jobs 1 to 4, runners 1 to jobs)" % (runner, jobs))
    return s["resolved"][jobs][runner]


def cmd_files(args):
    s = load(args)
    for f in runner_files(s, args.jobs, args.runner):
        print(f)
    return 0


def regex_text(path):
    """A file path as regex text, the same in Python and in JavaScript (Playwright's RegExp): metacharacters escaped."""
    return re.sub(r"([\\^$.|?*+()\[\]{}])", r"\\\1", path)


def alternation(files):
    return "/(?:%s)$" % "|".join(regex_text(f) for f in files)


def cmd_pattern(args):
    s = load(args)
    runner_files(s, args.jobs, args.runner)
    if args.jobs == 1:
        print("")
    elif args.runner == s["rest"][args.jobs]:
        others = sorted(f for r, files in s["resolved"][args.jobs].items() if r != args.runner for f in files)
        print("^(?!.*%s)" % alternation(others))
    else:
        print(alternation(s["resolved"][args.jobs][args.runner]))
    return 0


def report_minutes(path):
    """{file: minutes}: each file's tests' tries added up (release-estimate.py files counts the same way)."""
    per_file = {}

    def walk(suite, file_name):
        file_name = suite.get("file") or file_name
        for spec in suite.get("specs", []):
            f = spec.get("file") or file_name
            for test in spec.get("tests", []):
                per_file[f] = per_file.get(f, 0) + sum(r.get("duration", 0) for r in test.get("results", []))
        for child in suite.get("suites", []):
            walk(child, file_name)

    for top in json.load(open(path, encoding="utf-8")).get("suites", []):
        walk(top, None)
    return {f: ms / 60000.0 for f, ms in per_file.items()}


def cmd_times(args):
    s = load(args)
    if args.jobs not in LAYOUTS:
        raise Refused("times: %d jobs has no layout (2, 3 or 4)" % args.jobs)
    worst = 0.0
    for path in args.report:
        minutes = report_minutes(path)
        outside = sorted(f for f in minutes if f not in s["chosen"])
        per_runner = {r: sum(minutes.get(f, 0.0) for f in files) for r, files in s["resolved"][args.jobs].items()}
        mean = sum(per_runner.values()) / len(per_runner)
        print("REPORT  %s: %.1f test minutes in the lists' files%s" % (path, sum(per_runner.values()),
              "; not in today's full set: %s" % ", ".join(outside) if outside else ""))
        for r, m in sorted(per_runner.items()):
            off = (m - mean) / mean * 100 if mean else 0.0
            worst = max(worst, abs(off))
            print("%d JOBS  runner %d: %6.1f min  %+5.1f%% of the mean (%.1f)%s" % (
                args.jobs, r, m, off, mean, "  OFF (more than %g%%)" % args.max_off if abs(off) > args.max_off else ""))
    print("TIMES %s  the farthest runner is %.1f%% from its layout's mean (at most %g%%)"
          % ("OK" if worst <= args.max_off else "OFF", worst, args.max_off))
    return 0 if worst <= args.max_off else 1


# ---- the merge ----

def read_runner_log(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    r = dict(log=path, start=None, commit=None, version=None, retries=None, timeout=None, report=None, target=None,
             caps=None, result=None, e2e=None)
    for line in text.split("\n"):
        line = line.rstrip("\r")
        m = re.match(r"PIPELINE_START (\S+)\s+task=\S+\s+commit=(\S+)\s+version=(\S+)", line)
        if m and r["start"] is None:
            r["start"], r["commit"], r["version"] = m.groups()
        m = re.match(r"E2E_RETRIES=(\S+) E2E_TIMEOUT_SECS=(\S+) E2E_JSON_REPORT=(\S+)", line)
        if m:
            r["retries"], r["timeout"], r["report"] = m.groups()
        m = re.match(r"E2E_TARGET=(\S+)", line)
        if m:
            r["target"] = m.group(1)
        if line.startswith("E2E_CAPS "):
            r["caps"] = line
        if line.startswith("E2E_RESULT "):
            r["e2e"] = dict(re.findall(r" (passed|failed|flaky|skipped|didnotrun|exit|target)=(\S+)", line))
        m = re.match(r"PIPELINE_RESULT=(\S+)", line)
        if m:
            r["result"] = m.group(1)
    if not r["report"] or not os.path.isfile(r["report"]):
        beside = path[:-len(".log")] + "-playwright.json" if path.endswith(".log") else ""
        r["report"] = beside if beside and os.path.isfile(beside) else r["report"]
    return r


def parse_time(text):
    return datetime.strptime(text.replace("Z", "+00:00")[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def wall(ms):
    """Playwright's way of writing a run's time: (42.0s), (12.5m), (10.5h)."""
    s = ms / 1000.0
    return "%.1fs" % s if s < 60 else "%.1fm" % (s / 60) if s < 3600 else "%.1fh" % (s / 3600)


def tests_of(report):
    """(runner's tests as "<file>:<line> > <titles>", status, tries) for the failed and flaky ones, in report order."""
    out = []

    def walk(suite, path, file_name):
        file_name = suite.get("file") or file_name
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                if test.get("status") in ("unexpected", "flaky"):
                    titles = " > ".join(x for x in path + [spec.get("title", "")] if x)
                    out.append(("%s:%s > %s" % (spec.get("file") or file_name, spec.get("line", "?"), titles),
                                test.get("status"), len(test.get("results", []))))
        for child in suite.get("suites", []):
            walk(child, path + [child.get("title", "")], file_name)

    for top in report.get("suites", []):
        walk(top, [], None)
    return out


def cmd_merge(args):
    s = load(args)
    jobs, out, logs = args.jobs, args.merged_log, args.runner_logs
    if jobs not in LAYOUTS:
        raise Refused("merge: %d jobs has no layout (2, 3 or 4); one runner's log is the lane's log as it is" % jobs)
    if len(logs) != jobs:
        raise Refused("merge: %d jobs need %d runner logs (\"-\" for one that never ran), got %d" % (jobs, jobs, len(logs)))
    if not out.endswith(".log") or os.path.exists(out):
        raise Refused("merge: the merged log must be a new <name>.log (%s %s)"
                      % (out, "exists" if os.path.exists(out) else "does not end with .log"))
    merged_report = out[:-len(".log")] + "-playwright.json"
    if os.path.exists(merged_report):
        raise Refused("merge: %s exists already" % merged_report)

    runners = []
    for n, log in enumerate(logs, 1):
        files = s["resolved"][jobs][n]
        if log == "-" or not os.path.isfile(log):
            runners.append(dict(n=n, files=files, log=None, why="never ran" if log == "-" else "no log at %s" % log))
            continue
        r = read_runner_log(log)
        r.update(n=n, files=files, why=None)
        try:
            r["json"] = json.load(open(r["report"], encoding="utf-8")) if r["report"] else None
        except (OSError, ValueError) as e:
            r["json"], r["why"] = None, "its report %s could not be read (%s)" % (r["report"], e)
        if r["json"] is None and not r["why"]:
            r["why"] = "it left no report"
        runners.append(r)
    ran = [r for r in runners if r["log"]]
    for key in ("commit", "version", "target"):
        values = sorted(set(r[key] for r in ran if r[key]))
        if len(values) > 1:
            raise Refused("merge: the runners ran different %ss (%s): not one lane run" % (key, ", ".join(values)))
    first = ran[0] if ran else {}
    target = first.get("target") or "web"

    # the report: the runners' suites one after another, their counts added, their time from the first start to the last end
    parts = [r for r in ran if r.get("json") is not None]
    stats = dict(startTime=None, duration=0, expected=0, skipped=0, unexpected=0, flaky=0)
    starts, ends, suites, errors = [], [], [], []
    for r in parts:
        st = r["json"].get("stats", {})
        for k in ("expected", "skipped", "unexpected", "flaky"):
            stats[k] += st.get(k, 0)
        if st.get("startTime"):
            t0 = datetime.fromisoformat(st["startTime"].replace("Z", "+00:00"))
            starts.append(t0)
            ends.append(t0 + timedelta(milliseconds=st.get("duration", 0)))
        suites.extend(r["json"].get("suites", []))
        errors.extend(r["json"].get("errors", []))
    for r in runners:
        if r["why"]:
            errors.append({"message": "runner %d of %d %s: its %d files are NOT_RUN: %s"
                           % (r["n"], jobs, r["why"], len(r["files"]), " ".join(r["files"]))})
    if starts:
        stats["startTime"] = min(starts).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        stats["duration"] = (max(ends) - min(starts)).total_seconds() * 1000.0
    merged = dict(config=parts[0]["json"].get("config", {}) if parts else {}, suites=suites, errors=errors, stats=stats)

    # the counts: the runners' own E2E_RESULT lines added up; a runner without one is red
    counts = dict(passed=0, failed=0, flaky=0, skipped=0, didnotrun=0)
    red = []
    for r in runners:
        e2e = r.get("e2e") if r["log"] else None
        if e2e:
            for k in counts:
                v = e2e.get(k, "0")
                counts[k] += int(v) if v.isdigit() else 0
        if not r["log"]:
            red.append("%d (%s)" % (r["n"], r["why"]))
        elif r.get("result") != "SUCCESS" or not e2e or e2e.get("exit") != "0" or r["why"]:
            red.append("%d (%s)" % (r["n"], r["why"] or "PIPELINE_RESULT=%s, Playwright exit %s"
                                    % (r.get("result") or "none", (e2e or {}).get("exit", "none"))))
    exit_code = "0" if not red else "1"
    spec = full_set_spec(args.checkout)
    tests = sum(counts.values()) - counts["didnotrun"]

    lines = []
    start = min((r["start"] for r in ran if r["start"]), default=utc_now())
    lines.append("PIPELINE_START %s  task=e2e  commit=%s  version=%s" % (start, first.get("commit") or "unknown",
                                                                         first.get("version") or "unknown"))
    if first.get("commit"):
        # the lane's commit, as a lane run whole prints it (release-state.sh record-step1 reads it)
        lines.append("E2E_COMMIT=%s" % first["commit"])
    lines.append("E2E_RUNNERS=%d  merged at %s by asbl/ci/full-set-runners.py: the full set in %d runners, each its own "
                 "Playwright run; their own logs:" % (jobs, utc_now(), jobs))
    for r in runners:
        if r["log"]:
            e2e = r.get("e2e") or {}
            lines.append("E2E_RUNNER %d log=%s result=%s %s files=%d" % (
                r["n"], r["log"], r.get("result") or "none",
                " ".join("%s=%s" % (k, e2e.get(k, "?")) for k in ("passed", "failed", "flaky", "skipped", "didnotrun", "exit")),
                len(r["files"])))
        else:
            lines.append("E2E_RUNNER %d log=none result=NOT_RUN (%s) files=%d: %s"
                         % (r["n"], r["why"], len(r["files"]), " ".join(r["files"])))
    lines.append("E2E_MODE=full")
    lines.append("E2E_RETRIES=%s E2E_TIMEOUT_SECS=%s E2E_JSON_REPORT=%s"
                 % (first.get("retries") or "?", first.get("timeout") or "?", merged_report))
    if first.get("caps"):
        lines.append(first["caps"])
    lines.append("E2E_TARGET=%s" % target)
    lines.append("E2E_SPEC='%s'  E2E_GREP=''" % spec)
    lines.append("Running %d tests in %d runners" % (tests, jobs))
    failed = [(r["n"], t) for r in parts for t in tests_of(r["json"])]
    if failed:
        lines.append("--- Failed and flaky tests (each runner's report) ---")
        for n, (name, status, tries) in failed:
            lines.append("  runner %d: %s (%s, %d tr%s)" % (n, name, "failed" if status == "unexpected" else "flaky",
                                                          tries, "y" if tries == 1 else "ies"))
    lines.append("--- Playwright result ---")
    for k, word in (("failed", "failed"), ("flaky", "flaky"), ("skipped", "skipped"), ("didnotrun", "did not run")):
        if counts[k]:
            lines.append("  %d %s" % (counts[k], word))
    lines.append("  %d passed (%s)" % (counts["passed"], wall(stats["duration"])))
    lines.append("Playwright exit code: %s" % exit_code)
    if red:
        lines.append("E2E_RUNNERS_RED %s" % "; ".join(red))
    lines.append("E2E_RESULT mode=full spec='%s' grep='' passed=%d failed=%d flaky=%d skipped=%d didnotrun=%d exit=%s target=%s"
                 % (spec, counts["passed"], counts["failed"], counts["flaky"], counts["skipped"], counts["didnotrun"],
                    exit_code, target))
    lines.append("")
    lines.append("PIPELINE_RESULT=%s  %s" % ("SUCCESS" if not red else "FAILED_IN_RUNNERS", utc_now()))

    for path, body in ((merged_report, json.dumps(merged)), (out, "\n".join(lines) + "\n")):
        tmp = path + ".part"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(body)
        os.replace(tmp, path)
    print("E2E_MERGED_LOG=%s" % out)
    print("E2E_JSON_REPORT=%s" % merged_report)
    for line in lines[-4:]:
        if line:
            print(line)
    return 0 if not red else 1


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("check", "files", "pattern", "times", "merge"):
        c = sub.add_parser(name)
        c.add_argument("--lists", default=DEFAULT_LISTS)
        c.add_argument("--checkout", default=DEFAULT_CHECKOUT)
        if name != "check":
            c.add_argument("jobs", type=int)
        if name in ("files", "pattern"):
            c.add_argument("runner", type=int)
        if name == "times":
            c.add_argument("--report", action="append", required=True)
            c.add_argument("--max-off", type=float, default=15.0)
        if name == "merge":
            c.add_argument("merged_log")
            c.add_argument("runner_logs", nargs="+")
    args = p.parse_args()
    try:
        return dict(check=cmd_check, files=cmd_files, pattern=cmd_pattern, times=cmd_times, merge=cmd_merge)[args.cmd](args)
    except Refused as e:
        print("REFUSED  %s" % e)
        return 2


if __name__ == "__main__":
    sys.exit(main())
