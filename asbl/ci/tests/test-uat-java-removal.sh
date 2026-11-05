#!/bin/bash
# The Robot UAT's Java removal (asbl/src/uat/resources/utilities.py) ends a running java.exe BEFORE it uninstalls Java:
# a JDK file still in use is not removed but queued for deletion at the next boot, and that boot deleted the lib\modules
# of the Java installed since (the CI VM after 16.6.2's suites, 2026-11-04: Restart Manager 10010 named the machine
# JDK's java.exe, Windows Installer 1038 "requires a system restart"; the next boot left a Java that cannot start).
# The cases, each a recorded order of commands:
#   1. ensure_java_is_not_installed: taskkill java.exe, then choco uninstall, then the MSI sweep;
#   2. ensure_java_is_installed('17') over a broken Java (the repair): the same removal first, then choco install temurin17.
# Runs on Linux with this host's python3: the Windows-only modules (pyautogui, psutil, pywinauto) and the UAT's vars are
# stand-ins, subprocess and the Java state are stubs that record each call: nothing is run, killed or installed. About a
# second.
# Callers: a person or an agent, from the shell, after changing the UAT's Java helpers.
#   bash asbl/ci/tests/test-uat-java-removal.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
python3 -I - "$PWD/asbl/src/uat/resources" <<'PY'
import sys, types
resources = sys.argv[1]
sys.path.insert(0, resources)
# the Windows-only modules and the UAT's vars (selenium): stand-ins, so utilities imports on Linux
for name in ('pyautogui', 'psutil', 'pywinauto', 'pywinauto.application'):
    sys.modules[name] = types.ModuleType(name)
sys.modules['pywinauto.application'].Application = object
v = types.ModuleType('vars')
for name in ('DataPallas_exe_path', 'DataPallas_exe_path_let_me_update', 'PORTABLE_EXECUTABLE_DIR',
             'PORTABLE_EXECUTABLE_DIR_SERVER', 'PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE'):
    setattr(v, name, 'C:/stand-in')
sys.modules['vars'] = v
import utilities as u

calls = []
def record_call(cmd, *a, **k):
    calls.append(cmd if isinstance(cmd, str) else ' '.join(cmd))
    return 0
def record_output(cmd, *a, **k):
    text = cmd if isinstance(cmd, str) else ' '.join(cmd)
    calls.append(text)
    if text == 'choco list':
        return b'Chocolatey v2.2.2\ntemurin17 17.0.20.101\nmaven 3.9.9\n2 packages installed.\n'
    if text == 'choco -v':
        return b'2.2.2\n'
    return b'{11111111-2222-3333-4444-555555555555}\n'   # the MSI sweep finds one untracked JDK
u.subprocess.call = record_call
u.subprocess.check_output = record_output
u.shutil.which = lambda name: 'C:/ProgramData/chocolatey/bin/choco.exe' if name == 'choco' else None
u._refresh_java_env = lambda: None
u._java_install_dirs = lambda: []
states = []
u.detect_java_state = lambda version=None: states.pop(0)

failed = 0
def check(what, ok):
    global failed
    print(('PASS  ' if ok else 'FAIL  ') + what)
    if not ok:
        failed += 1
        print('      the calls: ' + ' | '.join(calls))
def first(prefix):
    return next((i for i, c in enumerate(calls) if c.startswith(prefix)), -1)

# 1. the removal
calls.clear(); states[:] = ['working', 'absent']
u.ensure_java_is_not_installed()
kill, uninstall, sweep = first('taskkill /f /im java.exe'), first('choco uninstall temurin17'), first('msiexec /x {')
check('removal: java.exe ended first, then choco uninstall, then the MSI sweep',
      kill == 0 and 0 < uninstall < sweep)

# 2. the repair of a broken Java 17 (TODO 12 repaired the CI VMs this way)
calls.clear(); states[:] = ['broken', 'broken', 'absent', 'working']
u.ensure_java_is_installed('17')
kill, uninstall, install = first('taskkill /f /im java.exe'), first('choco uninstall temurin17'), first('choco install temurin17')
check('repair: java.exe ended before the uninstall, the install after both',
      0 <= kill < uninstall < install)
check('repair: Java verified working, no state left unread', states == [])

print()
if failed:
    print(f'FAILED  {failed} case(s)  test-uat-java-removal'); sys.exit(1)
print('ALL PASS  test-uat-java-removal')
PY
