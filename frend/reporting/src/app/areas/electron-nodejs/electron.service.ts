import { Injectable, inject } from '@angular/core';

import type {
  SaveDialogOptions,
  SaveDialogReturnValue,
  OpenDialogOptions,
  OpenDialogReturnValue,
  IpcRenderer,
} from 'electron';

import type * as CustomElectronTitlebar from 'custom-electron-titlebar/dist';

//import * as process from 'process';
import type { ChildProcess } from 'child_process';

import * as semver from 'semver';
import { SemVer } from 'semver';
import dayjs from 'dayjs';

import { Subscription } from 'rxjs';

import { ApiService } from '../../providers/api.service';
import Utilities from '../../helpers/utilities';
import UtilitiesElectron from './utilities-electron';
import UtilitiesNodeJs from './utilities-nodejs';

class Dialog {
  showSaveDialog(
    options: Electron.SaveDialogOptions,
  ): Promise<Electron.SaveDialogReturnValue> {
    return UtilitiesElectron.showSaveDialog(options);
  }

  showOpenDialog(
    options: Electron.OpenDialogOptions,
  ): Promise<Electron.OpenDialogReturnValue> {
    return UtilitiesElectron.showOpenDialog(options);
  }
}
@Injectable({
  providedIn: 'root',
})
export class RbElectronService {
  //process: typeof process;
  //childProcess: typeof childProcess;
  //exec: typeof childProcess.exec;
  //spawn: typeof childProcess.spawn;

  //log: typeof ElectronLog;

  PORTABLE_EXECUTABLE_DIR: string =
    window.require('process').env.PORTABLE_EXECUTABLE_DIR;

  SHOULD_SEND_STATS: boolean = window.require('process').env.SHOULD_SEND_STATS;
  RUNNING_IN_E2E: boolean = window.require('process').env.RUNNING_IN_E2E;

  dialog: Dialog = new Dialog();

  JAVA_HOME: string;
  JRE_HOME: string;

  PATH: string;

  JAVA_HOME_REGISTRY: string;
  PATH_REGISTRY: string;

  //isJavaOk = false;
  //javaVersion: string;
  checkJavaSubscription: Subscription;

  isRestartRequired = false;

  javaDiagnostics = {
    javaHomeFolderExists: false,
    pathIncludesJavaHomeBin: false,
    javaExeExists: false,
    jreHomeFolderExists: false,
  };

  //isChocoOk = false;
  //chocoVersion: string;

  logFilePath: string;

  pTerminalInput: HTMLInputElement;

  cet: typeof CustomElectronTitlebar = window.require(
    'custom-electron-titlebar',
  );

  protected apiService = inject(ApiService);

  constructor() {
    //this.process = window.require('process');

    //if (this.isElectron) {
    //this.childProcess = window.require('child_process');
    //this.exec = this.childProcess.exec;
    //this.spawn = this.childProcess.spawn;

    //this.log = window.require('electron-log');

    this.logFilePath = Utilities.slash(
      `${this.PORTABLE_EXECUTABLE_DIR}/logs/bash.service.log`,
    );

    //this.checkJavaSubscription = interval(1000).subscribe(async (x) => {
    //  await this.checkJava();
    //});
    //}
  }

  get isElectron(): boolean {
    return UtilitiesElectron.isRunningInsideElectron();
  }

  async getSystemInfo(): Promise<{
    chocolatey: {
      isChocoOk: boolean;
      version: string;
    };
    java: {
      isJavaOk: boolean;
      version: string;
    };
    docker: {
      isDockerOk: boolean;
      version: string;
    };
    portal: {
      isProvisioned: boolean;
    };
    env: {
      PATH: string;
      JAVA_HOME: string;
      JRE_HOME: string;
    };
  }> {
    return UtilitiesElectron.getSystemInfo();
  }

  async getBackendUrl(): Promise<string> {
    return UtilitiesElectron.getBackendUrl();
  }

  async getApiKey(): Promise<string | null> {
    return UtilitiesElectron.getApiKey();
  }

  clock(start?: [number, number]): [number, number] {
    return [0, 0];
  }

  async checkJavaVersion(throwError = false) {
    const envJavaHome =
      await UtilitiesElectron.getEnvVariableValue('JAVA_HOME');
    if (envJavaHome) this.JAVA_HOME = Utilities.slash(envJavaHome);

    const envJreHome = await UtilitiesElectron.getEnvVariableValue('JRE_HOME');

    if (envJreHome)
      this.JRE_HOME = Utilities.slash(
        await UtilitiesElectron.getEnvVariableValue('JRE_HOME'),
      );

    this.PATH = await UtilitiesElectron.getEnvVariableValue('PATH');

    try {
      //on Windows 7 java 8 java --version is not working, the command is simply java -version
      //console.log(`java -version`);

      //console.log(
      //  `await this.execCommand('java -version') = ${await this.execCommand(
      //    'java -version'
      //  )}`
      //);

      const { stdout, stderr } =
        await UtilitiesElectron.childProcessExec('java -version');

      //console.log(stdout, stderr);

      let javaV = stdout;

      if (!javaV) javaV = stderr;

      //No errors => we have Java installed
      //https://stackoverflow.com/questions/19734477/verify-if-java-is-installed-from-node-js/19734810

      //console.log(`java javaV: ${javaV}`);

      let firstLine: string = javaV;

      // if (javaV) firstLine = javaV.split('\n')[0];
      //else firstLine = stderr.toString().split('\n')[0];

      // console.log(`firstLine: ${firstLine}`);

      //sometimes it is coming as 'openjdk version "14.0.2" 2020-07-14'

      let javaVersion = new RegExp('(java|openjdk) version').test(firstLine)
        ? firstLine.split(' ')[2].replace(/"/g, '')
        : '';

      //and sometimes it is coming as 'openjdk 14.0.2 2020-07-14'
      if (!javaVersion)
        javaVersion = new RegExp('(java|openjdk)').test(firstLine)
          ? firstLine.split(' ')[1].replace(/"/g, '')
          : '';

      //console.log(`java javaVersion: ${javaVersion}`);

      //console.log(`javaVersion = ${javaV}`);
      let semVersion = new SemVer(javaVersion);
      const semVersion1_8 = semver.coerce('1.8');

      if (!semver.valid(javaVersion)) semVersion = semver.coerce(javaVersion);

      if (semver.gte(semVersion, semVersion1_8)) {
        //this.isJavaOk = true;
        //this.javaVersion = javaVersion.toString();
      }

      //this.isRestartRequired = false;

      return javaV;
    } catch (error) {
      //this.isJavaOk = false;
      //this.javaVersion = undefined;

      if (!this.JAVA_HOME_REGISTRY) {
        try {
          const jev = await this._getEnvironmentVariableValue(
            'JAVA_HOME_REGISTRY',
            throwError,
          );
          const javaHomeEnvVariable = Utilities.slash(jev);
          let pathEnvVariable: string;
          {
            pathEnvVariable = await this._getEnvironmentVariableValue(
              'PATH',
              throwError,
            );
          }

          this.JAVA_HOME_REGISTRY = javaHomeEnvVariable;
          this.PATH_REGISTRY = pathEnvVariable;

          if (pathEnvVariable.includes(javaHomeEnvVariable)) {
            //this.isRestartRequired = true;
            //User should be allowed to restart the app in this situation
            //https://stackoverflow.com/questions/55982480/what-is-the-proper-way-to-restart-an-electron-app
            //https://www.electronjs.org/docs/api/app#apprelaunchoptions
            //https://stackoverflow.com/questions/41819632/how-to-call-a-function-module-in-electron-from-my-webpage
          }
        } catch (err) { }

        if (throwError) throw error;
      }
    }
  }

  async checkChocoVersion(throwError = false) {
    try {
      const { stdout, stderr } =
        await UtilitiesElectron.childProcessExec('choco --version');

      //if (!this.isChocoOk) this.isChocoOk = true;
      //this.chocoVersion = stdout;
      //console.log(`this.chocoVersion  = ${this.chocoVersion}`);

      return stdout;
    } catch (error) {
      //if (this.isChocoOk) this.isChocoOk = false;
      //this.chocoVersion = undefined;

      if (throwError) throw error;
    }
  }

  /*
  async checkJava() {
    await this.checkChocoVersion(true);
    await this.checkJavaVersion(true);

    if (this.JAVA_HOME) {
      const javaHomeFolderPathExists = await jetpack.existsAsync(
        this.JAVA_HOME,
      );

      if (javaHomeFolderPathExists === 'dir')
        this.javaDiagnostics.javaHomeFolderExists = true;
      else this.javaDiagnostics.javaHomeFolderExists = false;

      const javaHomeBin = this.JAVA_HOME + '/bin';

      if (
        this.PATH.includes(javaHomeBin) ||
        this.PATH.includes(this.JAVA_HOME + '\\bin')
      )
        this.javaDiagnostics.pathIncludesJavaHomeBin = true;
      else this.javaDiagnostics.pathIncludesJavaHomeBin = false;

      const javaExeFilePathExists = await jetpack.existsAsync(
        javaHomeBin + '/java.exe',
      );

      if (javaExeFilePathExists === 'file')
        this.javaDiagnostics.javaExeExists = true;
      else this.javaDiagnostics.javaExeExists = false;
    } else {
      this.javaDiagnostics.javaHomeFolderExists = false;
      this.javaDiagnostics.pathIncludesJavaHomeBin = false;
      this.javaDiagnostics.javaExeExists = false;
    }

    if (this.JRE_HOME) {
      const jreHomeFolderPathExists = await jetpack.existsAsync(this.JRE_HOME);

      if (jreHomeFolderPathExists === 'dir')
        this.javaDiagnostics.jreHomeFolderExists = true;
      else this.javaDiagnostics.jreHomeFolderExists = false;
    }
  }
  */

  async _getEnvironmentVariableValue(envKey: string, throwError = false) {
    // https://stackoverflow.com/questions/445167/how-can-i-get-the-value-of-a-registry-key-from-within-a-batch-script
    // How can I get the value of a registry key from within a batch script?
    let value = '';
    const queryCommand = `for /F "tokens=3*" %A in ('reg query "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Session Manager\\Environment" /v "${envKey}"') DO @Echo %A %B`;

    try {
      const { stdout, stderr } =
        await UtilitiesElectron.childProcessExec(queryCommand);
      if (stdout) value = stdout;
    } catch (error) {
      //console.log(`error = ${error}, throwError = ${throwError}`);

      if (throwError) throw error;
    } finally {
      return value;
    }
  }

  async installChocolatey(): Promise<ChildProcess> {
    //https://chocolatey.org/docs/installation#install-using-powershell-from-cmdexe

    //Step 1 generate /temp/installChocolatey.cmd
    const scriptContent = `@echo off

SET DIR=%~dp0%
    
::download install.ps1
%systemroot%/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "((new-object net.webclient).DownloadFile('https://chocolatey.org/install.ps1','%DIR%install.ps1'))"
::run installer
%systemroot%/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '%DIR%install.ps1' %*"
del /f /s install.ps1
`;

    const scriptFilePath = Utilities.slash(
      this.PORTABLE_EXECUTABLE_DIR + '/temp/installChocolatey.cmd',
    );

    await UtilitiesNodeJs.writeAsync(scriptFilePath, scriptContent);

    //Step 2 Run installChocolatey.cmd

    // Run installChocolatey.cmd from an elevated cmd.exe command prompt and it will install the latest version of Chocolatey.
    return Promise.resolve(
      this.getCommandReadyToBeRunAsAdministratorUsingBatchCmd(
        'CALL installChocolatey.cmd',
      ),
    );
  }

  async getCommandReadyToBeRunAsAdministratorUsingBatchCmd(
    command: string,
  ): Promise<ChildProcess> {
    const elevatedScriptFilePath =
      await this.generateScriptForRunningCommandAsAdministratorUsingBatchCmd(
        command,
      );

    return UtilitiesElectron.childProcessSpawn(
      'cmd.exe',
      ['/c', 'call', elevatedScriptFilePath],
      {
        cwd: Utilities.slash(this.PORTABLE_EXECUTABLE_DIR + '/temp/'),
      },
    );
  }

  async getCommandReadyToBeRunAsAdministratorUsingPowerShell(
    command: string,
    testCommand = '',
  ): Promise<ChildProcess> {
    const elevatedScriptFilePath =
      await this.generateScriptForRunningCommandAsAdministratorUsingPowerShell(
        command,
        testCommand,
      );
    /*
    return UtilitiesElectron.childProcessSpawn(
      'powershell.exe',
      [
        '-Command',
        `Start-Process -FilePath powershell.exe -ArgumentList '-File', '${elevatedScriptFilePath}' -Wait -Verb RunAs`,
      ],
      {
        cwd: Utilities.slash(this.PORTABLE_EXECUTABLE_DIR + '/temp/'),
      },
    );
    */
    return UtilitiesElectron.childProcessSpawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${elevatedScriptFilePath}"' -Wait -Verb RunAs`
      ],
      {
        cwd: Utilities.slash(this.PORTABLE_EXECUTABLE_DIR.replace(/[\\/]+$/, '') + '/temp'),
        windowsHide: false,
      }
    );
  }

  async generateScriptForRunningCommandAsAdministratorUsingPowerShell(
    commandToElevate: string,
    testCommand = '',
  ) {
    //https://stackoverflow.com/questions/7690994/running-a-command-as-administrator-using-powershell
    //Here's a self-elevating snippet for Powershell scripts which preserves the working directory:

    const elevatedScriptFilePath =
      Utilities.uniqueFilename(
        Utilities.slash(this.PORTABLE_EXECUTABLE_DIR + '/temp/'),
        'elevated-powershell-script',
      ) + '.ps1';

    const now = dayjs().format('DD/MM/YYYY HH:mm:ss');

    const scriptContent = `
trap {
  Add-Content ${this.logFilePath} "${now} POWERSHELL ERROR: $($_.Exception.Message)"
  Write-Host "POWERSHELL ERROR: $($_.Exception.Message)"
  Read-Host -Prompt "Press Enter to exit"
  exit 1
}

if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "${now} - Executing '${commandToElevate}' as Administrator";
  Start-Process PowerShell -Verb RunAs "-NoProfile -ExecutionPolicy Bypass -Command \`"cd '$pwd'; & '$PSCommandPath';\`"";
  exit 0;
}

function timestamp {
  foreach ($i in $input){
      "${now} - $i"
  }
}

if (!(Test-Path -Path "${this.logFilePath}")) {
  New-Item -ItemType File -Path "${this.logFilePath}" -Force
} else {
  Clear-Content -Path "${this.logFilePath}"
}

${testCommand}

if($?) {
  Write-Host "Please wait while executing '${commandToElevate}' as Administrator...";
  ${commandToElevate} 2>&1 | timestamp | Out-File -Append -Encoding ascii ${this.logFilePath};
} else {
  Add-Content ${this.logFilePath} "${now} ERRROR - Could not execute '${commandToElevate}' because '${testCommand}' failed!"
  Write-Host "${now} ERRROR - Could not execute '${commandToElevate}' because '${testCommand}' failed!"
  Read-Host -Prompt "Press Enter to exit"
  exit 1
}

Write-Host "Script execution completed successfully"

Remove-Item $PSCommandPath;

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show('Command execution completed, you may want to close and start again DataPallas.', 'Info', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
`;

    await UtilitiesNodeJs.writeAsync(elevatedScriptFilePath, scriptContent);

    return Promise.resolve(elevatedScriptFilePath);
  }

  async generateScriptForRunningCommandAsAdministratorUsingBatchCmd(
    commandToElevate: string,
  ) {
    //https://stackoverflow.com/questions/7044985/how-can-i-auto-elevate-my-batch-file-so-that-it-requests-from-uac-administrator
    //There is an easy way without the need to use an external tool - it runs fine with Windows 7, 8, 8.1 and 10

    const elevatedScriptFilePath =
      Utilities.uniqueFilename(
        Utilities.slash(this.PORTABLE_EXECUTABLE_DIR + '/temp/'),
        'elevated-batch-cmd-script',
      ) + '.cmd';

    const now = dayjs().format('DD/MM/YYYY HH:mm:ss');

    const scriptContent = `::::::::::::::::::::::::::::::::::::::::::::
    :: Elevate.cmd - Version 4
    :: Automatically check & get admin rights
    :: see "https://stackoverflow.com/a/12264592/1016343" for description
    ::::::::::::::::::::::::::::::::::::::::::::
     @echo off
     CLS
     ECHO.
     ECHO =============================
     ECHO Please wait... Running '${commandToElevate}' as Admin...
     ECHO =============================
    
    :init
     setlocal DisableDelayedExpansion
     set cmdInvoke=0
     set winSysFolder=System32
     set "batchPath=%~0"
     for %%k in (%0) do set batchName=%%~nk
     set "vbsGetPrivileges=%temp%/OEgetPriv_%batchName%.vbs"
     setlocal EnableDelayedExpansion
    
    :checkPrivileges
      NET FILE 1>NUL 2>NUL
      if '%errorlevel%' == '0' ( goto gotPrivileges ) else ( goto getPrivileges )
    
    :getPrivileges
      if '%1'=='ELEV' (echo ELEV & shift /1 & goto gotPrivileges)
      ECHO.
      ECHO **************************************
      ECHO Invoking UAC for Privilege Escalation
      ECHO **************************************
    
      ECHO Set UAC = CreateObject^("Shell.Application"^) > "%vbsGetPrivileges%"
      ECHO args = "ELEV " >> "%vbsGetPrivileges%"
      ECHO For Each strArg in WScript.Arguments >> "%vbsGetPrivileges%"
      ECHO args = args ^& strArg ^& " "  >> "%vbsGetPrivileges%"
      ECHO Next >> "%vbsGetPrivileges%"
    
      if '%cmdInvoke%'=='1' goto InvokeCmd 
    
      ECHO UAC.ShellExecute "!batchPath!", args, "", "runas", 1 >> "%vbsGetPrivileges%"
      goto ExecElevation
    
    :InvokeCmd
      ECHO args = "/c """ + "!batchPath!" + """ " + args >> "%vbsGetPrivileges%"
      ECHO UAC.ShellExecute "%SystemRoot%/%winSysFolder%/cmd.exe", args, "", "runas", 1 >> "%vbsGetPrivileges%"
    
    :ExecElevation
     "%SystemRoot%/%winSysFolder%/WScript.exe" "%vbsGetPrivileges%" %*
     exit /B
    
    :gotPrivileges
     setlocal & cd /d %~dp0
     if '%1'=='ELEV' (del "%vbsGetPrivileges%" 1>nul 2>nul  &  shift /1)
    
     ::::::::::::::::::::::::::::
     ::START
     ::::::::::::::::::::::::::::
     REM Run shell as admin (example) - put here code as you like
     type nul > "${this.logFilePath}"
     ${commandToElevate} 2>&1 >> ${this.logFilePath}
     
     echo Script execution completed successfully
     ::show message box
     powershell -ExecutionPolicy Bypass -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Command execution completed, you may want to close and start again DataPallas.', 'Info', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)"
     del /f /s *.cmd 2>&1 >> ${this.logFilePath}
     
     ::cmd /k
    `;

    await UtilitiesNodeJs.writeAsync(elevatedScriptFilePath, scriptContent);

    return Promise.resolve(elevatedScriptFilePath);
  }

  //async emptyLogFile() {
  //  return UtilitiesNodeJs.writeAsync(this.logFilePath, '');
  //}

  async createJobFile(jobType: string): Promise<string> {
    let filePath = '';
    if (jobType === 'update')
      filePath = `samples/burst/updating DocumentBurster, please wait`;

    const jobFileName = Utilities.getRandomJobFileName();

    const jobFilePath = `temp/${jobFileName}`;
    const jobFileContent = Utilities.getJobFileContent(
      filePath,
      jobType,
      '14234234324324',
    );

    await UtilitiesNodeJs.writeAsync(jobFilePath, jobFileContent);

    return Promise.resolve(Utilities.slash(jobFilePath));
  }

  async deleteJobFile(jobFilePath: string) {
    return UtilitiesNodeJs.removeAsync(jobFilePath);
  }

  typeCommandOnTerminalAndThenPressEnter(command: string) {
    this.pTerminalInput.value = command;
    this.pTerminalInput.dispatchEvent(new Event('input'));
    this.pTerminalInput.dispatchEvent(
      new KeyboardEvent('keydown', {
        keyCode: 13,
      } as KeyboardEventInit),
    );
    this.pTerminalInput.focus();
  }

  restartElectronApp() {
    //this should call the RUST writen program rb_rust_updater
    //with the Electron APIs the restartElectronApp() never worked properly
  }
}
