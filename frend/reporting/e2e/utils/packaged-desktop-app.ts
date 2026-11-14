import { Browser, BrowserContext, chromium, ElectronApplication, Page } from '@playwright/test';
import { execSync, spawn } from 'child_process';
import * as path from 'path';

// Playwright's own WebSocket client (an exported entry of playwright-core): the main process's inspector speaks CDP over it
const { ws: WebSocket } = require('playwright-core/lib/utilsBundle');

const RENDERER_DEBUGGING_PORT = 9222;
const MAIN_PROCESS_INSPECTOR_PORT = 9229;
// the splash, then the app's own Java server: about 75 s on the Windows CI VM (TODO 1's proof), 5 min fallback in main.ts
const APP_WINDOW_TIMEOUT_MS = 10 * 60_000;
const QUIT_TIMEOUT_MS = 90_000;

/** The app's own page, not the splash: index.html, or the folder it is served from. */
export function isAppWindowUrl(url: string): boolean {
  const withoutQuery = (url || '').split('#')[0].split('?')[0];
  return withoutQuery.endsWith('/index.html') || (withoutQuery.startsWith('file:') && withoutQuery.endsWith('/'));
}

/**
 * The expression the main process evaluates for `evaluate(fn, arg)`: fn called with the electron module and arg, as
 * Playwright's ElectronApplication.evaluate calls it.
 */
export function mainProcessExpression(fn: Function | string, arg?: unknown): string {
  const electronModule = "(typeof require === 'function' ? require : process.mainModule.require)('electron')";
  return `(async () => (${fn.toString()})(${electronModule}, ${JSON.stringify(arg ?? null)}))()`;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The Electron main process, reached through Node's inspector (`--inspect`): Runtime.evaluate over CDP. */
export class MainProcessInspector {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

  private constructor(private socket: any) {
    socket.on('message', (data: Buffer) => {
      const message = JSON.parse(String(data));
      const waiting = this.pending.get(message.id);
      if (!waiting) return;
      this.pending.delete(message.id);
      if (message.error) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result);
    });
  }

  static async connect(port: number, deadline: number): Promise<MainProcessInspector> {
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
        return new MainProcessInspector(socket);
      } catch (err) {
        lastError = err;
        await delay(2000);
      }
    }
    throw new Error(`the main process's inspector on port ${port} never answered: ${lastError}`);
  }

  async evaluate<R>(fn: Function | string, arg?: unknown): Promise<R> {
    const id = this.nextId++;
    const answer = new Promise<any>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression: mainProcessExpression(fn, arg), awaitPromise: true, returnByValue: true, includeCommandLineAPI: true },
    }));
    const result = await answer;
    if (result.exceptionDetails)
      throw new Error(`main process: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    return result.result.value as R;
  }

  close(): void {
    try { this.socket.close(); } catch { }
  }
}

/**
 * E2E_MODE=production-packaged on the desktop: DataPallas.exe of the unzipped datapallas.zip, started as a user starts it,
 * without RUNNING_IN_E2E (the splash, then the app starts its own Java server). The exe is electron-builder's portable
 * stub, which unpacks the app and starts it, so Playwright's electron.launch never gets its handshake: the window is
 * reached over Chromium's debugging port, the main process over Node's inspector. Offers the part of
 * ElectronApplication the specs and helpers use (firstWindow, windows, context, evaluate, close).
 */
export class PackagedDesktopApp {
  private constructor(
    private readonly browser: Browser,
    private readonly appWindow: Page,
    private readonly mainProcess: MainProcessInspector,
  ) { }

  static async launch(installFolder: string, env: NodeJS.ProcessEnv): Promise<PackagedDesktopApp> {
    stopPackagedDesktopProcesses();
    const appEnv = { ...env };
    delete appEnv.RUNNING_IN_E2E;
    spawn(
      path.join(installFolder, 'DataPallas.exe'),
      [`--remote-debugging-port=${RENDERER_DEBUGGING_PORT}`, `--inspect=${MAIN_PROCESS_INSPECTOR_PORT}`],
      { cwd: installFolder, env: appEnv, detached: true, stdio: 'ignore' },
    ).unref();

    const deadline = Date.now() + APP_WINDOW_TIMEOUT_MS;
    let browser: Browser | undefined;
    while (!browser && Date.now() < deadline) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${RENDERER_DEBUGGING_PORT}`, { timeout: 5000 });
      } catch {
        await delay(2000);
      }
    }
    if (!browser) throw new Error(`DataPallas.exe in ${installFolder}: its debugging port never answered`);

    let appWindow: Page | undefined;
    while (!appWindow && Date.now() < deadline) {
      appWindow = browser.contexts().flatMap((c) => c.pages()).find((p) => isAppWindowUrl(p.url()));
      if (!appWindow) await delay(2000);
    }
    if (!appWindow) throw new Error(`DataPallas.exe in ${installFolder}: no app window within ${APP_WINDOW_TIMEOUT_MS / 1000} s`);

    const app = new PackagedDesktopApp(browser, appWindow, await MainProcessInspector.connect(MAIN_PROCESS_INSPECTOR_PORT, deadline));
    await app.answerWhatTheProductOnlyDoesOutsideE2e();
    return app;
  }

  /**
   * What the app does only outside E2E, which no test can answer: the native file dialogs, answered as the E2E build
   * answers them (an empty path), and the user's browser (shell.openExternal, which window.open also reaches): nothing
   * opened. A spec that records openExternal installs its own over this one and puts this one back.
   */
  private async answerWhatTheProductOnlyDoesOutsideE2e(): Promise<void> {
    await this.evaluate(({ dialog, shell }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [''] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: '' });
      shell.openExternal = async () => { };
    });
  }

  /** For the code typed against Playwright's ElectronApplication: this class offers the part of it that code uses. */
  asElectronApplication(): ElectronApplication {
    return this as unknown as ElectronApplication;
  }

  async firstWindow(): Promise<Page> {
    return this.appWindow;
  }

  windows(): Page[] {
    return this.browser.contexts().flatMap((c) => c.pages());
  }

  context(): BrowserContext {
    return this.appWindow.context();
  }

  evaluate<R>(fn: (electron: any, arg?: any) => R | Promise<R>, arg?: unknown): Promise<R> {
    return this.mainProcess.evaluate<R>(fn, arg);
  }

  /** Quits as a user quits (the app stops its Java server on the way out), then makes sure nothing is left. */
  async close(): Promise<void> {
    try {
      await Promise.race([this.evaluate(({ app }) => { setTimeout(() => app.quit(), 100); }), delay(10_000)]);
    } catch { }
    this.mainProcess.close();
    try { await this.browser.close(); } catch { }
    const until = Date.now() + QUIT_TIMEOUT_MS;
    while (Date.now() < until && packagedDesktopIsRunning()) await delay(2000);
    stopPackagedDesktopProcesses();
  }
}

function packagedDesktopIsRunning(): boolean {
  try {
    return execSync('tasklist /FI "IMAGENAME eq DataPallas.exe" /NH', { encoding: 'utf-8' }).includes('DataPallas.exe');
  } catch {
    return false;
  }
}

/** DataPallas.exe's process tree and its Java server (rb-server), as Robot's cleanup stops them. */
export function stopPackagedDesktopProcesses(): void {
  try { execSync('taskkill /F /T /IM DataPallas.exe', { stdio: 'ignore' }); } catch { }
  try {
    execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like \'java*\' -and $_.CommandLine -like \'*rb-server*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
      { stdio: 'ignore' },
    );
  } catch { }
}
