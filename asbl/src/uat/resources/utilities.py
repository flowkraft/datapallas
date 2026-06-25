import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import subprocess, glob, re, os, importlib, shutil, zipfile, time, errno, pyautogui, psutil
import shutil
from pywinauto.application import Application

from vars import DataPallas_exe_path, DataPallas_exe_path_let_me_update, PORTABLE_EXECUTABLE_DIR, PORTABLE_EXECUTABLE_DIR_SERVER, PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE

def click_x_close_DataPallas():
    # Get the directory that this script is in
    script_dir = os.path.dirname(os.path.realpath(__file__))
    print(f"DEBUG: Looking for images in directory: {os.path.abspath(script_dir)}")

    # Construct the path to the image file
    image_path = os.path.join(script_dir, 'images', 'x_button_close_DataPallas.png')
    print(f"DEBUG: Full image path: {os.path.abspath(image_path)}")

    # Check if image file exists
    if not os.path.exists(image_path):
        print(f"ERROR: Image file does not exist at {os.path.abspath(image_path)}")
        return

    button_location = None

    # Wait for up to 100 seconds for the X button to appear
    print(f"DEBUG: Starting to look for X button (will try for 100 seconds)")
    for attempt in range(100):
        print(f"DEBUG: Attempt {attempt+1}/100 to find X button")
        try:
            button_location = pyautogui.locateOnScreen(image_path, grayscale=False, confidence=.7)
            if button_location is not None:
                print(f"DEBUG: X button found at {button_location} on attempt {attempt+1}")
                break
        except Exception as e:
            print(f"DEBUG: Error during search: {str(e)}")
        
        time.sleep(1)  # Wait for 1 second

    # If the button is found, click it
    if button_location is not None:
        try:
            print(f"DEBUG: Clicking X button at position {button_location}")
            pyautogui.click(button_location)
            print("DEBUG: Click successful")
            return True
        except Exception as e:
            print(f"DEBUG: Failed to click X button: {e}")
            return False
    else:
        print("DEBUG: X button not found after 100 attempts")
        
        # Fallback to using PyWinAuto to try to close the window
        try:
            print("DEBUG: Attempting to close window using PyWinAuto with title regex '.*DataPallas.*'")
            app = Application().connect(title_re=".*DataPallas.*")
            main_window = app.top_window()
            print(f"DEBUG: Window found: {main_window.window_text()}")
            main_window.close()
            print("DEBUG: Window closed using PyWinAuto")
            return True
        except Exception as e:
            print(f"DEBUG: PyWinAuto fallback failed: {e}")
            return False


def wait_for_powershell_and_accept_completion():
    # The "Command execution completed..." dialog is a System.Windows.Forms.MessageBox
    # raised by electron.service.ts after an elevated install command finishes.
    # Its window title is "Info" (NOT "PowerShell") and it is a standard Win32
    # dialog (window class "#32770"). We target it by title/class via PyWinAuto,
    # which is immune to theme / DPI / resolution / monitor drift. Pixel-based
    # image matching is kept only as a last-ditch fallback.

    # Primary: find and click OK by window title/class with PyWinAuto.
    print('DEBUG: Waiting up to 300s for the "Info" completion dialog via PyWinAuto')
    for attempt in range(300):
        try:
            app = Application(backend="win32").connect(
                title="Info", class_name="#32770", timeout=1
            )
            dlg = app.window(title="Info", class_name="#32770")
            dlg.wait("visible ready", timeout=5)
            print(f"DEBUG: Info dialog found on attempt {attempt+1}: '{dlg.window_text()}'")

            ok_button = dlg.child_window(title="OK", class_name="Button")
            if ok_button.exists():
                ok_button.click()
            else:
                # Fall back to sending Enter, which activates the default OK button.
                dlg.set_focus()
                dlg.type_keys("{ENTER}")
            print("DEBUG: Completion dialog accepted via PyWinAuto")
            return True
        except Exception as e:
            # Dialog not up yet (or transient connect race) — keep polling.
            if attempt % 10 == 0:
                print(f"DEBUG: Info dialog not found yet (attempt {attempt+1}/300): {e}")
            time.sleep(1)

    # Fallback: pixel image match of the OK button (fragile; environment-dependent).
    print("DEBUG: PyWinAuto path exhausted — falling back to image matching")
    script_dir = os.path.dirname(os.path.realpath(__file__))
    image_path = os.path.join(script_dir, 'images', 'ok_button_powershell.png')
    if not os.path.exists(image_path):
        print(f"ERROR: Fallback image file does not exist at {os.path.abspath(image_path)}")
        return False

    for attempt in range(30):
        try:
            button_location = pyautogui.locateOnScreen(image_path, grayscale=False, confidence=.7)
            if button_location is not None:
                pyautogui.click(button_location)
                print("DEBUG: Completion dialog accepted via image-match fallback")
                return True
        except Exception as e:
            print(f"DEBUG: Image-match error: {e}")
        time.sleep(1)

    print("ERROR: Could not find/accept the completion dialog by any method")
    return False

def kill_DataPallas_exe_process(let_me_update=False):
    # Terminating only the single -DELECTRON_PID from electron.log is not enough: Electron
    # spawns a process tree (main + renderers + GPU) and a Java backend (rb-server.jar), and
    # the logged PID can be stale after an in-place re-init. Any survivor keeps the remote
    # debugging port (9222) bound and the DataPallas.exe / rb-server.jar files locked, which
    # makes the next "Open Electron" reconnect to the stale window and the next run's cleanup
    # fail with WinError 32. So kill the whole family by image name + child trees.
    log_file_path = os.path.join(os.path.dirname(DataPallas_exe_path), 'logs', 'electron.log')
    if let_me_update:
        log_file_path = os.path.join(os.path.dirname(DataPallas_exe_path_let_me_update), 'logs', 'electron.log')
    print(f'Log file path: {log_file_path}')

    # 1) Kill the logged Electron PID and its descendants, if present.
    if os.path.exists(log_file_path):
        with open(log_file_path, 'r') as log_file:
            match = re.search(r'-DELECTRON_PID=(\d+)', log_file.read())
        if match:
            _kill_pid_tree(int(match.group(1)))

    # 2) Sweep every DataPallas/Electron process and its children, plus the rb-server.jar
    #    Java backend, regardless of what electron.log says.
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            name = (proc.info['name'] or '').lower()
            cmdline = ' '.join(proc.info['cmdline'] or []).lower()
            if name in ('datapallas.exe', 'electron.exe') or 'rb-server.jar' in cmdline:
                _kill_pid_tree(proc.info['pid'])
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

def _kill_pid_tree(pid):
    """Kill a process and all of its descendants. Safe to call on a dead PID."""
    try:
        parent = psutil.Process(pid)
    except psutil.NoSuchProcess:
        print(f"No process found with PID: {pid}")
        return
    procs = parent.children(recursive=True)
    procs.append(parent)
    for p in procs:
        try:
            p.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    psutil.wait_procs(procs, timeout=5)

def empty_folder(folder_path):
    for filename in os.listdir(folder_path):
        file_path = os.path.join(folder_path, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            print('Failed to delete %s. Reason: %s' % (file_path, e))

def count_files(directory, pattern='*.pdf', recursive=False):
    if recursive:
        pattern = '**/' + pattern
    files = glob.glob(os.path.join(directory, pattern), recursive=recursive)
    files = [f for f in files if os.path.isfile(f)]
    return len(files)

def clean_output_folders_and_log_files(product="exe"):
    # Define the paths
    backup_folder_path = os.path.join(PORTABLE_EXECUTABLE_DIR, 'backup')
    output_folder_path = os.path.join(PORTABLE_EXECUTABLE_DIR, 'output')
    info_log_file_path = os.path.join(PORTABLE_EXECUTABLE_DIR, 'logs', 'info.log')
    errors_log_file_path = os.path.join(PORTABLE_EXECUTABLE_DIR, 'logs', 'errors.log')
    warnings_log_file_path = os.path.join(PORTABLE_EXECUTABLE_DIR, 'logs', 'warnings.log')

    if product == 'server':
        backup_folder_path = os.path.join(PORTABLE_EXECUTABLE_DIR_SERVER, 'backup')
        output_folder_path = os.path.join(PORTABLE_EXECUTABLE_DIR_SERVER, 'output')
        info_log_file_path = os.path.join(PORTABLE_EXECUTABLE_DIR_SERVER, 'logs', 'info.log')
        errors_log_file_path = os.path.join(PORTABLE_EXECUTABLE_DIR_SERVER, 'logs', 'errors.log')
        warnings_log_file_path = os.path.join(PORTABLE_EXECUTABLE_DIR_SERVER, 'logs', 'warnings.log')

    # Empty the folders
    for folder_path in [backup_folder_path, output_folder_path]:
        empty_folder(folder_path)

    # Create or overwrite the log files
    with open(info_log_file_path, 'w') as log_file:
        log_file.write('.')
    for log_file_path in [errors_log_file_path, warnings_log_file_path]:
        with open(log_file_path, 'w') as log_file:
            pass

def ensure_java_prerequisite():
    ensure_java_is_installed("17")

# ─────────────────────────────────────────────────────────────────────────────
# Bullet-proof Java state management.
#
# Hard lesson: detecting Java by whether `java -version` EXITS 0 is wrong — a
# broken/partial JDK (launcher present, lib\modules runtime removed) ALSO fails
# -version, so it looks identical to "absent". That false signal made the old
# cleanup skip the leftover dir and the reinstall no-op over a corrupt install,
# leaving the machine permanently broken ("Failed setting boot class path").
#
# Fix: detect by PRESENCE (java.exe on PATH / known install dir on disk) AND,
# separately, by HEALTH (java -version exits 0 AND the lib\modules runtime image
# exists) -> three honest states: working / broken / absent. Each ensure_* runs
# the normal action, then VERIFIES the promised end state and escalates + retries
# until it holds, or raises. It never falsely reports success.
# ─────────────────────────────────────────────────────────────────────────────

# Roots where Temurin/Adoptium/other JDKs install — used for presence + leftover nuke.
_JAVA_INSTALL_GLOBS = [
    r'C:\Program Files\Eclipse Adoptium\*',
    r'C:\Program Files\Java\*',
    r'C:\Program Files\AdoptOpenJDK\*',
    r'C:\Program Files\Temurin\*',
    r'C:\Program Files\Zulu\*',
    r'C:\Program Files\Microsoft\jdk*',
]


def _java_install_dirs():
    """Every known JDK install directory currently on disk."""
    dirs = []
    for pattern in _JAVA_INSTALL_GLOBS:
        dirs.extend(d for d in glob.glob(pattern) if os.path.isdir(d))
    return dirs


def _refresh_java_env():
    """Re-read the live Machine+User PATH and JAVA_HOME from the registry into THIS
    process, so checks right after a choco install/uninstall see reality (a fresh
    subprocess otherwise inherits our stale environment)."""
    ps = (
        "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + "
        "[Environment]::GetEnvironmentVariable('Path','User'); "
        "[Environment]::GetEnvironmentVariable('JAVA_HOME','Machine'); "
        "[Environment]::GetEnvironmentVariable('JAVA_HOME','User')"
    )
    try:
        lines = subprocess.check_output(
            ['powershell', '-NoProfile', '-Command', ps]
        ).decode('utf-8', 'ignore').splitlines()
    except subprocess.CalledProcessError as e:
        print(f"_refresh_java_env: could not read environment ({e})")
        return
    if lines:
        os.environ['PATH'] = lines[0].strip()
    java_home = next((l.strip() for l in lines[1:] if l.strip()), '')
    if java_home:
        os.environ['JAVA_HOME'] = java_home
    elif 'JAVA_HOME' in os.environ:
        del os.environ['JAVA_HOME']


def _java_runs(version=None):
    """HEALTH check (never a presence check): True iff `java -version` actually
    boots (exit 0), optionally requiring major `version` in the banner."""
    try:
        result = subprocess.run(['java', '-version'], capture_output=True, text=True)
    except (OSError, ValueError):
        return False
    if result.returncode != 0:
        return False
    if version is None:
        return True
    banner = (result.stderr or '') + (result.stdout or '')
    return re.search(r'version "%s[.\"]' % re.escape(str(version)), banner) is not None


def _runtime_image_present():
    """A bootable Java 9+ install has <home>\\lib\\modules. Its absence is exactly
    what 'Failed setting boot class path' means."""
    java_exe = shutil.which('java')
    if not java_exe:
        return False
    java_home = os.path.dirname(os.path.dirname(java_exe))
    return os.path.isfile(os.path.join(java_home, 'lib', 'modules'))


def detect_java_state(version=None):
    """Honest three-way Java state, PRESENCE-based so a broken JDK is never
    mistaken for an absent one:
        'absent'  - no java.exe on PATH AND no known JDK install dir on disk.
        'working' - java.exe resolves, `java -version` exits 0, AND the lib\\modules
                    runtime image exists (and matches `version` if given).
        'broken'  - present on PATH/disk but NOT working (fails -version, or the
                    runtime image is missing).
    """
    _refresh_java_env()
    present = bool(shutil.which('java')) or bool(_java_install_dirs())
    if not present:
        return 'absent'
    return 'working' if (_java_runs(version) and _runtime_image_present()) else 'broken'


def java_still_resolves():
    """Back-compat: True iff Java is present in ANY form (working OR broken).
    Presence-based on purpose — a broken JDK still resolves and must be cleaned."""
    return detect_java_state() != 'absent'


def _choco_uninstall_java_packages():
    """Uninstall every choco-tracked java/jdk/temurin/adoptium package (forced)."""
    try:
        out = subprocess.check_output('choco list', shell=True).decode('utf-8', 'ignore')
    except subprocess.CalledProcessError:
        out = ''
    for line in out.splitlines():
        low = line.lower()
        if any(k in low for k in ('java', 'jdk', 'temurin', 'adoptium')):
            pkg = line.split(' ')[0].strip()
            if pkg:
                print(f"Uninstalling {pkg} with Chocolatey...")
                subprocess.call(f'choco uninstall {pkg} -y --force', shell=True)


def force_remove_untracked_java():
    """MSI sweep — silently uninstall any Adoptium/Temurin/JDK MSI products that
    Chocolatey is no longer tracking, by enumerating the Windows uninstall registry
    and running `msiexec /x {ProductCode} /qn`."""
    ps_script = (
        "$keys = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',"
        "'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*';"
        "Get-ItemProperty $keys -ErrorAction SilentlyContinue |"
        " Where-Object { $_.DisplayName -match 'Temurin|Adoptium|JDK' -and $_.PSChildName -match '^{.*}$' } |"
        " ForEach-Object { Write-Output $_.PSChildName }"
    )
    try:
        output = subprocess.check_output(['powershell', '-NoProfile', '-Command', ps_script]).decode('utf-8')
    except subprocess.CalledProcessError as e:
        print(f"Could not enumerate installed JDK products: {e}")
        return
    for code in [l.strip() for l in output.splitlines() if l.strip().startswith('{')]:
        print(f"Uninstalling JDK MSI product {code} ...")
        # /x = uninstall, /qn = silent, /norestart = don't reboot
        subprocess.call(f'msiexec /x {code} /qn /norestart', shell=True)


def _force_remove_java_dirs():
    """Force-delete any leftover JDK directory on disk — the half-removed dir whose
    launcher remains but whose runtime was deleted (the broken-boot footgun)."""
    dirs = _java_install_dirs()
    if dirs:
        # A running java.exe locks its own directory; we're removing Java, so end it.
        subprocess.call('taskkill /f /im java.exe', shell=True,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for d in dirs:
        print(f"Force-removing leftover JDK directory: {d}")
        subprocess.call(['cmd', '/c', 'rmdir', '/s', '/q', d])
        if os.path.isdir(d):
            shutil.rmtree(d, ignore_errors=True)


def ensure_java_is_not_installed():
    """Leave the system with NO Java — and VERIFY it. Normal path: choco uninstall +
    MSI sweep + force-remove leftover dirs. Then PROVE (presence-based) that Java no
    longer resolves and no install dir lingers; escalate + retry if anything remains.
    Raises if it cannot reach a verified 'absent' state — never falsely reports success."""
    attempts = 3
    for attempt in range(1, attempts + 1):
        if detect_java_state() == 'absent':
            print(f"Java is not installed (verified, attempt {attempt}).")
            return
        print(f"[ensure_java_is_not_installed] attempt {attempt}: Java still present -> removing")
        if shutil.which('choco'):
            _choco_uninstall_java_packages()
        force_remove_untracked_java()   # untracked Adoptium/Temurin/JDK MSIs
        _force_remove_java_dirs()        # half-removed leftover dirs (the broken-boot case)
        _refresh_java_env()
    raise RuntimeError(
        "ensure_java_is_not_installed: Java is STILL present after "
        f"{attempts} attempts (state={detect_java_state()}). Refusing to report "
        "success — manual cleanup required."
    )


def ensure_java_is_installed(version="17"):
    """Leave the system with a WORKING Java <version> — and VERIFY it. Normal path:
    a clean choco install. Then PROVE the JVM actually boots (and matches the
    version). A broken/partial install (launcher present, runtime missing) is nuked
    and reinstalled with --force so choco can't no-op over a corrupt dir. Escalates +
    retries; raises if it cannot reach a verified 'working' state — never falsely
    reports success."""
    ensure_chocolatey_is_installed()
    pkg = {'17': 'temurin17', '11': 'temurin11', '8': 'temurin8'}.get(str(version), 'temurin')
    attempts = 3
    for attempt in range(1, attempts + 1):
        state = detect_java_state(version)
        if state == 'working':
            print(f"Java {version} is installed and working (verified, attempt {attempt}).")
            return
        print(f"[ensure_java_is_installed] attempt {attempt}: state={state} -> (re)installing")
        if state == 'broken':
            # A broken/partial install must be fully removed first, or choco no-ops
            # over it and lib\modules is never rewritten.
            ensure_java_is_not_installed()
        subprocess.call(f'choco install {pkg} -y --force', shell=True)
        if str(version) == '17':
            subprocess.call('choco install maven -y --force', shell=True)
        _refresh_java_env()
    raise RuntimeError(
        f"ensure_java_is_installed: could NOT leave a working Java {version} after "
        f"{attempts} attempts (state={detect_java_state(version)}). Refusing to "
        "report success — manual intervention required."
    )

def ensure_chocolatey_is_installed():
    try:
        output = subprocess.check_output('choco -v', shell=True, stderr=subprocess.STDOUT)
        print(f"Output of 'choco -v': {output.decode('utf-8')}")
        if 'not recognized' in output.decode('utf-8'):
            raise Exception("'choco' command not recognized")
        print("Chocolatey is already installed.")
    except Exception:
        print("Chocolatey is not installed or there was an error checking. Installing now...")
        install_command = """
        @"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "
        Set-ExecutionPolicy Bypass -Scope Process -Force; 
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; 
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        "
        """

        process = subprocess.Popen('powershell', shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate(install_command.encode())

        if process.returncode != 0:
            print(f"Error occurred: {stderr.decode()}")
        else:
            print("Chocolatey has been installed.")


def ensure_chocolatey_is_not_installed():
    try:
        subprocess.check_output('choco -v', shell=True)
        print("Chocolatey is installed. Uninstalling now...")
        choco_uninstall_script_path = os.path.join(PORTABLE_EXECUTABLE_DIR, 'tools', 'chocolatey', 'uninstall.ps1')
        try:
            output = subprocess.check_output(['powershell', '-ExecutionPolicy', 'Bypass', choco_uninstall_script_path], shell=True)
            print(output)
            print("Chocolatey has been uninstalled: " + choco_uninstall_script_path)
        except subprocess.CalledProcessError as e:
            print("Error occurred:", e.output)
    except subprocess.CalledProcessError:
        print("Chocolatey is not installed.")

def ensure_folder_location_in_path(folder_location_path):
    # Get the current PATH
    current_path = os.environ.get('PATH')

    # Check if the folder location is already in the PATH
    if folder_location_path not in current_path.split(os.pathsep):
        # If not, add it to the PATH
        os.environ['PATH'] = folder_location_path + os.pathsep + current_path

def ensure_folder_location_not_in_path(folder_location_path):
    # Get the current PATH
    current_path = os.environ.get('PATH')

    # Split the PATH into a list of locations
    path_list = current_path.split(os.pathsep)

    # Check if the folder location is in the PATH
    if folder_location_path in path_list:
        # If it is, remove it
        path_list.remove(folder_location_path)

    # Join the list back into a string and update the PATH
    os.environ['PATH'] = os.pathsep.join(path_list)

def clean_and_extract_zip_files():
    """
    Cleans destination folders and extracts DataPallas zip files to target directories
    """
    paths = [
        "../../target/uat/rb",
        "../../target/uat/rbs"
    ]
    zips = [
        "../../dist/DataPallas.zip",
        "../../dist/DataPallas-server.zip"
    ]

    # A DataPallas.exe / rb-server.jar left running by a previous run locks files under
    # target/uat and makes the deletion below fail with WinError 32. Kill any survivor first.
    kill_DataPallas_exe_process()

    for path, zip_file in zip(paths, zips):
        # Clean the path if it exists
        if os.path.exists(path):
            print(f"Cleaning existing directory: {path}")
            empty_folder(path)
            force_remove_dir(path)
        
        # Create the directory and extract the zip file
        print(f"Creating directory and extracting {zip_file} to {path}")
        os.makedirs(path, exist_ok=True)
        with zipfile.ZipFile(zip_file, 'r') as zip_ref:
            zip_ref.extractall(path)
            
def start_server():
    process = subprocess.Popen(['cmd.exe', '/c', f'{PORTABLE_EXECUTABLE_DIR_SERVER}/startServer.bat'], cwd=PORTABLE_EXECUTABLE_DIR_SERVER)
    return process

def shut_server():
    process = subprocess.Popen(['cmd.exe', '/c', f'{PORTABLE_EXECUTABLE_DIR_SERVER}/shutServer.bat'], cwd=PORTABLE_EXECUTABLE_DIR_SERVER)
    return process

def service_install():
    process = subprocess.Popen(['cmd.exe', '/c', f'{PORTABLE_EXECUTABLE_DIR_SERVER}/service.bat', 'install'], cwd=PORTABLE_EXECUTABLE_DIR_SERVER, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()
    return stdout.decode()

def service_uninstall():
    process = subprocess.Popen(['cmd.exe', '/c', f'{PORTABLE_EXECUTABLE_DIR_SERVER}/service.bat', 'uninstall'], cwd=PORTABLE_EXECUTABLE_DIR_SERVER, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()
    return stdout.decode()

def text_contains_either(text, str1, str2):
    return str1 in text or str2 in text

def get_parent_directory(file_path):
    return os.path.dirname(file_path)

def refresh_env_variables():
    
    importlib.reload(os)

    # Import the chocolateyProfile.psm1 module and execute the refreshenv command in PowerShell
    subprocess.run(["powershell", "-Command", "Import-Module $env:ChocolateyInstall\\helpers\\chocolateyProfile.psm1; refreshenv"], check=True)
    
def get_project_path():

    PROJECT_PATH = os.path.normpath(os.path.abspath('../../..')).replace('\\', '/')

    print(f'PROJECT_PATH = {PROJECT_PATH}')

    return PROJECT_PATH

def generate_let_me_update_baseline():

    PROJECT_PATH = get_project_path()

    FRONTEND_REPORTING_PATH = f'{PROJECT_PATH}/frend/reporting'
    
    env = os.environ.copy()
    command = 'cmd /c "npm --version"'
    result = subprocess.run(command, capture_output=True, text=True, shell=True, env=env)

    print("stdout:", result.stdout)
    print("stderr:", result.stderr)

    command = 'cmd /c "npm run \"_custom:e2e-generate-let-me-update-baseline-for-exe-update.robot\""'
    result = subprocess.run(command, capture_output=True, text=True, shell=True, cwd=FRONTEND_REPORTING_PATH, env=env)

    print("stdout:", result.stdout)
    print("stderr:", result.stderr)

    clean_output_folders_and_log_files()    

    if os.path.exists(PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE):
        empty_folder(PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE)
        force_remove_dir(PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE)

    shutil.copytree(PORTABLE_EXECUTABLE_DIR, PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE, dirs_exist_ok=True)

    # ONE
    # specify your destination file
    PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE = f'{FRONTEND_REPORTING_PATH}/testground/upgrade/baseline/DocumentBurster'
    
    destination_folder_path = f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/config/reports/my-reports-915'

    # create necessary directories
    os.makedirs(destination_folder_path, exist_ok=True)

    # move the file
    shutil.move(f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/config/burst/50-settings-9.1.5.xml', f'{destination_folder_path}/settings.xml')
    shutil.copy(f'{PROJECT_PATH}/asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml', f'{destination_folder_path}/reporting.xml')

    # read the file
    with open(f'{destination_folder_path}/settings.xml', 'r') as file:
        file_data = file.read()

    # replace <template>My Reports</template> with <template>My Reports 915</template>
    file_data = file_data.replace('<template>My Reports</template>', '<template>My Reports 915</template>')

    # write the new data back to the file
    with open(f'{destination_folder_path}/settings.xml', 'w') as file:
        file.write(file_data)

    # TWO
    # specify your destination file
    destination_folder_path = f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/config/reports/custom-9-1-5'

    # create necessary directories
    os.makedirs(destination_folder_path, exist_ok=True)

    # move the file
    shutil.move(f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/config/burst/50-settings-9.1.5-custom.xml', f'{destination_folder_path}/settings.xml')    
    shutil.copy(f'{PROJECT_PATH}/asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml', f'{destination_folder_path}/reporting.xml')

    # THREE
    # specify your destination file
    destination_folder_path = f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/config/reports/my-reports-1020'

    # create necessary directories
    os.makedirs(destination_folder_path, exist_ok=True)

    # move the file
    shutil.move(f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/config/burst/55-settings-10.2.0.xml', f'{destination_folder_path}/settings.xml')
    shutil.copy(f'{PROJECT_PATH}/asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml', f'{destination_folder_path}/reporting.xml')

    # read the file
    with open(f'{destination_folder_path}/settings.xml', 'r') as file:
        file_data = file.read()

    # replace <template>My Reports</template> with <template>My Reports 915</template>
    file_data = file_data.replace('<template>My Reports</template>', '<template>My Reports 1020</template>')

    # write the new data back to the file
    with open(f'{destination_folder_path}/settings.xml', 'w') as file:
        file.write(file_data)

    # FOUR
    # specify your destination file
    destination_folder_path = f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/config/reports/custom-10-2-0'

    # create necessary directories
    os.makedirs(destination_folder_path, exist_ok=True)

    # move the file
    shutil.move(f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/config/burst/55-settings-10.2.0-custom.xml', f'{destination_folder_path}/settings.xml')    
    shutil.copy(f'{PROJECT_PATH}/asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml', f'{destination_folder_path}/reporting.xml')

    # FIVE
    destination_folder_path = f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/config/connections'

    # create necessary directories
    os.makedirs(destination_folder_path, exist_ok=True)
    shutil.copy(f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE}/config/connections/eml-contact.xml', f'{destination_folder_path}/eml-contact.xml')

    # read the file
    with open(f'{destination_folder_path}/eml-contact.xml', 'r') as file:
        file_data = file.read()

    # replace <host>Email Server Host</host> with <host>127.0.0.1</host>
    file_data = file_data.replace('<host>Email Server Host</host>', '<host>127.0.0.1</host>')

    # write the new data back to the file
    with open(f'{destination_folder_path}/eml-contact.xml', 'w') as file:
        file.write(file_data)

    shutil.move(f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/file-1.txt', f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE_BASELINE}/DocumentBurster.exe')    
    
def open_folder(window_title, folder_path):

    # Match on a stable prefix of the title rather than the full string, so the
    # match survives changes to the trailing executable name in the dialog title.
    title_pattern = re.escape(window_title[:50]) + ".*"
    app = Application().connect(title_re=title_pattern)
    dialog = app.window(title_re=title_pattern)

    # Set the focus to the 'Edit' control again
    dialog.Edit.click_input()
    dialog.Edit.set_text(folder_path.replace("/", "\\"))
    # Send the {ENTER} key to the 'Edit' control
    dialog.Edit.type_keys("{ENTER}")
    time.sleep(1)
    dialog['Select Existing Installation'].click()

def force_remove_dir(dir_path):
    try:
        shutil.rmtree(dir_path)
    except FileNotFoundError:
        pass  # Directory does not exist
    except OSError as e:
        # If the error is due to an access error (read only file)
        # it's because the files/folders aren't writable.
        # To remove the dir and all its contents recursively
        # os.chmod is used to make the item writable
        if e.errno == errno.EACCES:
            for root, dirs, files in os.walk(dir_path):
                for dir in dirs:
                    os.chmod(os.path.join(root, dir), 0o777)
                for file in files:
                    os.chmod(os.path.join(root, file), 0o777)
            shutil.rmtree(dir_path)
        else:
            raise    

def assert_configuration_files_were_migrated_correctly():

    # assert eml-contact.xml
    asserted_file_path = f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE}/config/connections/eml-contact.xml'

    with open(asserted_file_path, 'r') as file:
        file_data = file.read()

    assert '<host>127.0.0.1</host>' in file_data, f'The file {PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE}/config/connections/eml-contact.xml was expected to contain <host>127.0.0.1</host> and does not'

    config_reports_path = f'{PORTABLE_EXECUTABLE_DIR_LET_ME_UPDATE}/config/reports'

    # config/reports/my-reports-915
    asserted_file_path = f'{config_reports_path}/my-reports-915/reporting.xml'
    assert os.path.exists(asserted_file_path), f'The file {asserted_file_path} does not exist'

    asserted_file_path = f'{config_reports_path}/my-reports-915/settings.xml'
    assert os.path.exists(asserted_file_path), f'The file {asserted_file_path} does not exist'

    # config/reports/custom-9-1-5
    asserted_file_path = f'{config_reports_path}/custom-9-1-5/reporting.xml'
    assert os.path.exists(asserted_file_path), f'The file {asserted_file_path} does not exist'

    asserted_file_path = f'{config_reports_path}/custom-9-1-5/settings.xml'
    assert os.path.exists(asserted_file_path), f'The file {asserted_file_path} does not exist'

    # config/reports/my-reports-1020
    asserted_file_path = f'{config_reports_path}/my-reports-1020/reporting.xml'
    assert os.path.exists(asserted_file_path), f'The file {asserted_file_path} does not exist'

    asserted_file_path = f'{config_reports_path}/my-reports-1020/settings.xml'
    assert os.path.exists(asserted_file_path), f'The file {asserted_file_path} does not exist'

    # config/reports/custom-10-2-0
    asserted_file_path = f'{config_reports_path}/custom-10-2-0/reporting.xml'
    assert os.path.exists(asserted_file_path), f'The file {asserted_file_path} does not exist'

    asserted_file_path = f'{config_reports_path}/custom-10-2-0/settings.xml'
    assert os.path.exists(asserted_file_path), f'The file {asserted_file_path} does not exist'
