import type {
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron';

let ipcRenderer;
if (window.require) {
  ipcRenderer = window.require('electron').ipcRenderer;
}

export default class UtilitiesElectron {
  static isRunningInsideElectron(): boolean {
    return typeof window.require !== 'undefined';
  }

  static async showOpenDialog(
    options: Electron.OpenDialogOptions,
  ): Promise<Electron.OpenDialogReturnValue> {
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      return ipcRenderer.invoke('dialog.show-open', options);
    }
  }

  static async showSaveDialog(
    options: Electron.SaveDialogOptions,
  ): Promise<Electron.SaveDialogReturnValue> {
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      return ipcRenderer.invoke('dialog.show-save', options);
    }
  }

  static async getSystemInfo(): Promise<{
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
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      return ipcRenderer.invoke('getSystemInfo');
    }
  }

  static async getBackendUrl(): Promise<string> {
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      return ipcRenderer.invoke('getBackendUrl');
    } else {
      return 'http://localhost:9090';
    }
  }

  /**
   * The installation API key, read off the filesystem by the main process. Null outside Electron —
   * a browser has no filesystem to read it from, and must never be handed one.
   */
  static async getApiKey(): Promise<string | null> {
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      return ipcRenderer.invoke('getApiKey');
    }
    return null;
  }

  static async logAsync(message: string, level: string): Promise<void> {
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      return ipcRenderer.invoke('log', level, message);
    }
  }

  static async getEnvVariableValue(envVariableName: string): Promise<string> {
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      return ipcRenderer.invoke('process.env', envVariableName);
    } else {
      return '';
    }
  }

  static async refreshEnv(): Promise<void> {
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      await ipcRenderer.invoke('refreshEnv');
    }
  }

  // Chocolatey version read from choco.exe's file metadata — never executes choco, so it
  // cannot rewrite/corrupt chocolatey.config.
  static async getChocoVersion(): Promise<string> {
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      return ipcRenderer.invoke('choco.version');
    }
    return '';
  }

  static async startBackendServer(): Promise<{ started: boolean; reason: string }> {
    if (UtilitiesElectron.isIpcRendererAvailable()) {
      return ipcRenderer.invoke('backend.start');
    }
    return { started: false, reason: 'not-electron' };
  }

  static async childProcessExec(
    command: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const { stdout, stderr } = await ipcRenderer.invoke(
      'child_process.exec',
      command,
    );
    //console.log(`stdout: ${stdout}`);
    //console.log(`stderr: ${stderr}`);
    return { stdout, stderr };
  }

  // The 'child_process.spawn' IPC handler resolves once the spawned process EXITS,
  // returning a serializable { code, pid } — NOT a live ChildProcess (streams can't
  // cross IPC). Callers must await completion, never read .stdout/.stderr.
  static async childProcessSpawn(
    command: string,
    args?: string[],
    options?: {},
  ): Promise<{ code: number; pid?: number }> {
    return ipcRenderer.invoke('child_process.spawn', command, args, options);
  }

  static isIpcRendererAvailable(): boolean {
    if (ipcRenderer) return true;

    return false;
  }
}
