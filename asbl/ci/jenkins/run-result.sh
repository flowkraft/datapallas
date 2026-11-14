# Sourced, from the repository's root, by scheduled-e2e.sh and e2e-by-hand.sh: a run's result.txt and flaky.txt in the release
# orchestrator's format (asbl/ci/jenkins/release-orchestrator.sh, THE RUN FOLDER), so the fixer (fix-round.sh) and the jobs
# read them as they read a release run's.

RUN_RESULT_SETTINGS_XML=bkend/reporting/src/main/external-resources/template/config/burst/settings.xml   # as release-state.sh reads it

# version_at <commit>: the product version that commit carries
version_at() { git show "$1:$RUN_RESULT_SETTINGS_XML" 2>/dev/null | grep -m1 -oP '(?<=<version>)[^<]+'; }

# newest_log_since <link> <epoch>: the log the link points at, when written since then (the lane's own)
newest_log_since() { local l; l=$(readlink -f "$1" 2>/dev/null) || return 0; [ -f "$l" ] && [ "$(stat -c %Y "$l")" -ge "$2" ] && echo "$l"; }

# part_line <name> <machine> <exit code> <log> <Playwright JSON report or empty> <why>: one part line of result.txt:
# part TAB <name> TAB host|windows-vm TAB PASS|FAIL TAB <log> TAB <the JSON and its HTML folder> TAB <why>
part_line() {
  printf 'part\t%s\t%s\t%s\t%s\t%s\t%s' "$1" "$2" "$([ "$3" = 0 ] && echo PASS || echo FAIL)" "$4" "${5:+$5 ${5%.json}-html}" "$6"
}

# write_run_result <run folder> <green|red> <what run it is> <part lines> <key=value>...: <run folder>/flaky.txt from the
# parts' Playwright reports (release-orchestrator.sh flaky), then <run folder>/result.txt: result, the keys in the order
# given, then the part lines
write_run_result() {
  local dir="$1" result="$2" what="$3" parts="$4" flaky_args=() part report
  shift 4
  while IFS=$'\t' read -r part report; do
    case "$report" in *.json) [ -f "$report" ] && flaky_args+=("$part" "$report") ;; esac
  done < <(printf '%s\n' "$parts" | awk -F'\t' '$1 == "part" { split($6, r, " "); print $2 "\t" r[1] }')
  if [ "${#flaky_args[@]}" = 0 ]; then : > "$dir/flaky.txt"
  else bash asbl/ci/jenkins/release-orchestrator.sh flaky "${flaky_args[@]}" > "$dir/flaky.txt"; fi
  {
    echo "# the result of $what, in the release orchestrator's format"
    echo "result=$result"
    printf '%s\n' "$@"
    printf '%s\n' "$parts"
  } > "$dir/result.txt"
}
