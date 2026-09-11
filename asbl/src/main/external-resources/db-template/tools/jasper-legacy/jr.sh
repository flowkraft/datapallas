#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  jr.sh — render a classic .jrxml through the JasperReports 6 container.
#
#  Same options as `datapallas.sh jasper`, so a report moves between the two
#  engines by changing the command name and nothing else:
#
#    ./jr.sh --report-dir <dir> --jrxml <file> --format <fmt> --out <file> \
#            [--jdbc-url <url>] [--jdbc-user <u>] [--jdbc-pass <p>] \
#            [-p KEY=VALUE]...
#
#  Exit codes match the rest of the CLI: 0 ok, 1 job failed, 2 bad command line.
#  Output is also appended to logs/jr.sh.log.
# ---------------------------------------------------------------------------
set -uo pipefail

IMAGE="flowkraft/datapallas-jasper-legacy:6.21.5"
TOOLDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="$(cd "$TOOLDIR/../.." && pwd)/logs"
LOGFILE="$LOGDIR/jr.sh.log"

usage() {
	cat >&2 <<'EOF'
Usage: jr.sh --report-dir <dir> --jrxml <file> --format <fmt> --out <file>
             [--jdbc-url <url>] [--jdbc-user <u>] [--jdbc-pass <p>] [-p KEY=VALUE]...
EOF
}

fail2() {
	echo "ERROR - $1" >&2
	echo >&2
	usage
	exit 2
}

# Docker wants a path the host's daemon understands. On Linux and macOS that is
# just the absolute path; under Git Bash or MSYS on Windows the shell's
# /c/Users/... form is meaningless to Docker Desktop, so translate it back.
host_path() {
	if command -v cygpath >/dev/null 2>&1; then
		cygpath -w "$1"
	else
		printf '%s' "$1"
	fi
}

ARGS=()
REPORT_DIR=""
OUT_FILE=""
JDBC_URL=""

while [ $# -gt 0 ]; do
	case "$1" in
		--report-dir) REPORT_DIR="${2-}"; shift 2 || fail2 "Missing value after --report-dir" ;;
		--out)        OUT_FILE="${2-}";   shift 2 || fail2 "Missing value after --out" ;;
		--jdbc-url)   JDBC_URL="${2-}";   shift 2 || fail2 "Missing value after --jdbc-url" ;;
		-p|--params)  ARGS+=("-p" "${2-}"); shift 2 || fail2 "Missing value after -p" ;;
		*)            ARGS+=("$1"); shift ;;
	esac
done

[ -n "$REPORT_DIR" ] || fail2 "Missing required option: --report-dir"
[ -n "$OUT_FILE" ]   || fail2 "Missing required option: --out"
[ -d "$REPORT_DIR" ] || fail2 "Report folder not found: $REPORT_DIR"

REPORT_DIR_ABS="$(cd "$REPORT_DIR" && pwd)"
OUT_DIR="$(dirname "$OUT_FILE")"
OUT_NAME="$(basename "$OUT_FILE")"
mkdir -p "$OUT_DIR" "$LOGDIR"
OUT_DIR_ABS="$(cd "$OUT_DIR" && pwd)"

# A container's "localhost" is the container. Point it at the machine jr.sh is
# running on instead — which is also how you reach a database DataPallas
# started for you, since those publish their port on the host.
if [ -n "$JDBC_URL" ]; then
	JDBC_URL="${JDBC_URL//localhost/host.docker.internal}"
	JDBC_URL="${JDBC_URL//127.0.0.1/host.docker.internal}"
	ARGS+=("--jdbc-url" "$JDBC_URL")
fi

# First run builds the image from the Dockerfile sitting next to this script.
# Nothing is pulled from a registry — the image is yours, built locally, and
# every later run starts immediately.
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
	echo "INFO - $IMAGE not found locally, building it once from $TOOLDIR/internal"
	echo "INFO - this takes a few minutes and needs internet access; later runs start immediately"
	if ! docker build -t "$IMAGE" "$TOOLDIR/internal"; then
		echo "ERROR - could not build $IMAGE. See tools/jasper-legacy/README.md" >&2
		exit 1
	fi
fi

{
	echo
	echo "===== $(date '+%Y-%m-%d %H:%M:%S') jr.sh $*"
} >> "$LOGFILE"

MSYS_NO_PATHCONV=1 docker run --rm \
	--add-host=host.docker.internal:host-gateway \
	-v "$(host_path "$REPORT_DIR_ABS"):/work/report:ro" \
	-v "$(host_path "$OUT_DIR_ABS"):/work/out" \
	-v "$(host_path "$TOOLDIR/lib"):/opt/jr/userlib:ro" \
	"$IMAGE" \
	--report-dir /work/report --out "/work/out/$OUT_NAME" "${ARGS[@]}" 2>&1 | tee -a "$LOGFILE"

exit "${PIPESTATUS[0]}"
