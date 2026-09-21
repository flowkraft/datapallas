#!/bin/sh
# DataPallas Linux CI only: the shell npm uses for package.json scripts inside the dp-ci container
# (dp-ci.sh points npm_config_script_shell at a copy of this file). Never used on Windows.
#
# Why: on Windows npm runs scripts through cmd.exe, which expands %npm_package_version% and %cd%. On Linux
# npm runs them through sh, which leaves both as literal text, so custom:compile-and-stage-backend-jars
# would copy rb-common.jar as "rb-common-%npm_package_version%.jar", and custom:stage-apps-* would mount
# a folder literally named "%cd%". This wrapper rewrites those two cmd.exe variables to their sh form and
# runs the script with sh, so frend/reporting/package.json stays exactly as it runs on Windows.
#
# %cd%: cmd.exe expands it once, when it parses the whole line, so it is the directory the script
# STARTS in, even after a `cd` earlier on the same line. sh's $PWD would follow each cd, so the start
# directory is captured here and substituted instead. A nested `npm run` gets its own start directory,
# exactly like a nested cmd.exe line.
#
# npm runs a script shell as:  <shell> -c "<script> <args>"
if [ "$1" = "-c" ] && [ "$#" -ge 2 ]; then
  __DP_START_DIR=$PWD
  export __DP_START_DIR
  script=$(printf '%s\n' "$2" | sed -e 's/%npm_package_version%/${npm_package_version}/g' -e 's/%[cC][dD]%/${__DP_START_DIR}/g')
  shift 2
  exec /bin/sh -c "$script" "$@"
fi
exec /bin/sh "$@"
