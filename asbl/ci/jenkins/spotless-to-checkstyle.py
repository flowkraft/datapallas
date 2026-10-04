#!/usr/bin/env python3
"""Turns the console output of `mvn spotless:check` into checkstyle XML, so Jenkins (Warnings Next Generation) can show it as a table.

usage: spotless-to-checkstyle.py <spotless-output.txt> <out.xml> [repo-root]

Python 3 standard library only (the datapallas-ci image has python3, the Jenkins container does not). It is written from the
documented message format of the spotless-maven-plugin check goal and has not been seen against real output:

    [ERROR] Failed to execute goal com.diffplug.spotless:spotless-maven-plugin:<v>:check (default-cli) on project <name>: The following files had format violations:
    [ERROR]     src/main/java/com/x/Foo.java
    [ERROR]         @@ -10,7 +10,7 @@
    [ERROR]         -<line Spotless removes>
    [ERROR]         +<line Spotless writes>
    [ERROR] Run 'mvn spotless:apply' to fix these violations.

One warning per file and hunk: file, the first line of the hunk, "format differs: <what Spotless would change>". A file listed without a hunk gets
one warning on line 1. Tolerant on purpose: unknown lines are ignored, the XML is always valid (empty when nothing is found) and the exit code is
always 0. The last line printed is `spotless-violations=<number of warnings>`.
"""
import os
import re
import sys
from xml.sax.saxutils import quoteattr

PREFIX = re.compile(r'^\[(?:ERROR|WARNING|INFO)\]\s?')
ANSI = re.compile(r'\x1b\[[0-9;]*m')
FILE = re.compile(r'^\s{2,}(\S.*\.java)\s*$')
HUNK = re.compile(r'^\s*@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@')
CHANGE = re.compile(r'^\s*([-+])(.*)$')


def parse(lines, root):
    found = {}      # file -> [(line, message)]
    cur = None      # file being read
    hunk = None     # [line, [changes]] being read

    def resolve(path):
        if root and not os.path.exists(os.path.join(root, path)):
            try:
                for m in sorted(os.listdir(os.path.join(root, 'bkend'))):
                    if os.path.exists(os.path.join(root, 'bkend', m, path)):
                        return 'bkend/' + m + '/' + path
            except OSError:
                pass
        return path

    def close():
        nonlocal hunk
        if cur is not None and hunk is not None:
            what = ' | '.join(hunk[1][:3]) or 'see the Spotless output'
            found.setdefault(cur, []).append((hunk[0], 'format differs: ' + what[:300]))
        hunk = None

    for raw in lines:
        line = PREFIX.sub('', ANSI.sub('', raw.rstrip('\r\n')))
        m = FILE.match(line)
        if m and not CHANGE.match(line):
            close()
            cur = resolve(m.group(1).strip())
            found.setdefault(cur, [])
            continue
        m = HUNK.match(line)
        if m and cur is not None:
            close()
            hunk = [int(m.group(1)), []]
            continue
        m = CHANGE.match(line)
        if m and hunk is not None:
            text = m.group(2).strip()
            if text:
                hunk[1].append(m.group(1) + ' ' + text)
            continue
        if line.startswith('Run ') or 'BUILD' in line or line.startswith('---'):
            close()
            cur = None
    close()
    return found


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else ''
    dst = sys.argv[2] if len(sys.argv) > 2 else 'spotless.xml'
    root = sys.argv[3] if len(sys.argv) > 3 else ''
    found = {}
    try:
        with open(src, encoding='utf-8', errors='replace') as f:
            found = parse(f.readlines(), root)
    except Exception as e:  # never an error: Jenkins then simply shows an empty result
        print('spotless-to-checkstyle: ignored: %s' % e)
    count = 0
    out = ['<?xml version="1.0" encoding="UTF-8"?>', '<checkstyle version="8.0">']
    for name in sorted(found):
        out.append('<file name=%s>' % quoteattr(name))
        items = found[name] or [(1, 'format differs')]
        for line, msg in items:
            out.append('<error line="%d" severity="warning" message=%s source="spotless"/>' % (line, quoteattr(msg)))
            count += 1
        out.append('</file>')
    out.append('</checkstyle>')
    try:
        with open(dst, 'w', encoding='utf-8') as f:
            f.write('\n'.join(out) + '\n')
    except Exception as e:
        print('spotless-to-checkstyle: could not write %s: %s' % (dst, e))
    print('spotless-violations=%d' % count)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('spotless-to-checkstyle: ignored: %s' % e)
    sys.exit(0)
