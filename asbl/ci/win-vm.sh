#!/bin/bash
# The files on this host that belong to one Windows VM (WIN_VM <name>, a VM of RELEASE_WINDOWS_VMS in the machines file,
# asbl/ci/release-machines.sh). VM a, win10-dev, keeps 16.6.2's names; any other VM <name> has its own, so two VMs run
# at once, while one VM runs one Windows run at a time.
#
# SOURCED by asbl/ci/dp-ci.sh, asbl/ci/jenkins/win-e2e.sh, asbl/ci/jenkins/release-orchestrator.sh and
# asbl/ci/jenkins/release-rehearsal.sh, with LOG_DIR set. <name> left out: WIN_VM, else a.
#   win_vm_name_ok <name>       a VM's name: lowercase letters and digits (it goes into file names)
#   win_vm_pidfile [<name>]     the pid file of the VM's Windows driver (win-e2e.sh), its lock: <LOG_DIR>/win-e2e.pid for
#                               VM a, <LOG_DIR>/win-e2e-<name>.pid for another
#   win_vm_latest_log [<name>]  the link to the VM's newest Windows run log: win-e2e-latest.log, win-e2e-<name>-latest.log
#   win_vm_pidfiles             the pid files of every VM there are now, one per line (is any Windows run going?)
# Tested by asbl/ci/tests/test-vms.sh.
win_vm_name_ok() { [[ "${1:-}" =~ ^[a-z0-9]+$ ]]; }
win_vm_suffix() { local v="${1:-${WIN_VM:-a}}"; [ "$v" = a ] || printf -- '-%s' "$v"; }
win_vm_pidfile() { printf '%s/win-e2e%s.pid' "$LOG_DIR" "$(win_vm_suffix "${1:-}")"; }
win_vm_latest_log() { printf '%s/win-e2e%s-latest.log' "$LOG_DIR" "$(win_vm_suffix "${1:-}")"; }
win_vm_pidfiles() { ls -1 "$LOG_DIR"/win-e2e.pid "$LOG_DIR"/win-e2e-*.pid 2>/dev/null; }
