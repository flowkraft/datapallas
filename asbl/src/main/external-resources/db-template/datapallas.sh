#!/bin/sh
# DataPallas command line for Linux and macOS - the twin of datapallas.bat.
# Usage: ./datapallas.sh <command> [arguments]   (or: sh datapallas.sh ...)

cd "$(dirname "$0")" || exit 1

# Each argument becomes -Darg<N>="<value>" for the Ant build file, quoted so values with spaces survive
ARGS=""
COUNT=1
for ARG in "$@"; do
    ARGS="$ARGS -Darg$COUNT=\"$ARG\""
    COUNT=$((COUNT + 1))
done

echo "Arguments: $*" >> logs/args_debug.log

eval java -DDOCUMENTBURSTER_HOME="\"$(pwd)\"" \
    -cp "lib/burst/ant-launcher*.jar" \
    org.apache.tools.ant.launch.Launcher \
    -buildfile config/_internal/documentburster.xml \
    $ARGS \
    -emacs > logs/datapallas.sh.log 2>&1
