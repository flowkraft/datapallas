import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import log from 'electron-log';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import { screen } from 'electron';

import { ChildProcessWithoutNullStreams, exec as _execSync, spawn as _spawnSync } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(_execSync);

import * as jetpack from 'fs-jetpack';

ipcMain.on('window-minimize', () => {
  try { if (win) win.minimize(); } catch { }
});
ipcMain.on('window-toggle-maximize', () => {
  try {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } catch { }
});
ipcMain.on('window-close', () => {
  try { if (win) win.close(); } catch { }
});

// forward native maximize/unmaximize to renderer(s) so UI can update
function forwardMaxState() {
  if (!win) return;
  win.on('maximize', () => {
    try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('window-maximized')); } catch { }
  });
  win.on('unmaximize', () => {
    try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('window-unmaximized')); } catch { }
  });
}

// ensure this stays early in the file
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, cwd) => {
    // If the window already exists, bring it forward
    if (win) {
      try {
        if (win.isMinimized()) win.restore();
        win.show();   // ensure visible if hidden
        win.focus();
        // clear any queued focus request, it's been handled directly
        focusRequestedBySecondInstance = false;
      } catch { }
    } else {
      // If the window has not been created yet, store a flag so we can
      // show/focus the window after createWindow() runs.
      focusRequestedBySecondInstance = true;
    }

    // Optionally, process argv to open files/URLs in the existing instance:
    // const fileToOpen = parseArgvForFile(argv);
    // if (fileToOpen) mainWindow.webContents.send('open-file', fileToOpen);
  });
}

let win: BrowserWindow = null;
const args = process.argv.slice(1),
  serve = args.some((val) => val === '--serve');

if (!process.env.PORTABLE_EXECUTABLE_DIR) {
  process.env.PORTABLE_EXECUTABLE_DIR = 'testground/e2e';
}
process.env.PORTABLE_EXECUTABLE_DIR = path
  .normalize(path.resolve(process.env.PORTABLE_EXECUTABLE_DIR))
  .replace(/\\/g, '/');

const electronLogFilePath = `${process.env.PORTABLE_EXECUTABLE_DIR}/logs/electron.log`;
const rbsjExeLogFilePath = `${process.env.PORTABLE_EXECUTABLE_DIR}/logs/rbsj-exe.log`;
const portalSageComposerLockFilePath = `${process.env.PORTABLE_EXECUTABLE_DIR}/_apps/cms-webportal-playground/wp-themes/datapallas-sage/composer.lock`;

log.transports.file.resolvePath = () => {
  return electronLogFilePath;
};

log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] - {text}';

//console.log(
//  `process.env.PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR}`,
//);

let splashWindow: BrowserWindow | null = null;
let uiLoaded = false;
let backendReady = false;
let rendererReady = false; // set by renderer via ipc
let focusRequestedBySecondInstance = false; // flag set when second-instance occurs before window is created

// choose theme centrally (packaged: prefer OS choice or fallback to dark; dev: random)
function chooseTheme(): 'light' | 'dark' {
  if (process.env.DATAPALLAS_FORCE_THEME === 'light') return 'light';
  if (process.env.DATAPALLAS_FORCE_THEME === 'dark') return 'dark';
  // if (app.isPackaged) {
  // deterministic default for packaged builds to match BMP & avoid mismatch
  // return 'dark';
  // }
  // still random in dev
  return Math.random() < 0.5 ? 'light' : 'dark';
}

// create a minimal splash BrowserWindow and show it immediately
// ...existing code...
function createSplashWindow(theme: 'light' | 'dark'): BrowserWindow {
  const bg = theme === 'light' ? '#ffffff' : '#1f1f1f';
  const splash = new BrowserWindow({
    width: 560,
    height: 320,
    useContentSize: true,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: true,
    skipTaskbar: true,
    backgroundColor: bg, // sets native window bg
    // ensure it's not transparent so browser background color is used
    transparent: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // be defensive: make sure the native background is applied immediately
  try { splash.setBackgroundColor(bg); } catch (e) { log.warn('splash.setBackgroundColor failed', e); }

  // theme param + load the html (unchanged)
  const splashPath = path.join(__dirname, 'splash.html');
  if (fs.existsSync(splashPath)) {
    const splashUrl = new URL(path.join('file:', __dirname, 'splash.html'));
    splashUrl.searchParams.set('theme', theme);
    splash.loadURL(splashUrl.href).catch(() => { });
  } else {
    splash.loadURL(`data:text/html,<body><h3>DataPallas</h3><p>Starting...</p></body>`);
  }

  return splash;
}

// send progress or text to the splash window (no-op if missing)
function sendSplashProgress(payload: { text?: string; progress?: number }) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  try {
    splashWindow.webContents.send('splash-progress', payload);
  } catch { }
}

// wait for a TCP connection to a port (returns true if connected within timeout)
async function waitForServerPort(port = 9090, timeoutMs = 120000): Promise<boolean> {
  const start = Date.now();
  let tries = 0;
  while (Date.now() - start < timeoutMs) {
    tries++;
    const ok = await new Promise<boolean>((resolve) => {
      const s = new net.Socket();
      let done = false;
      s.setTimeout(1200);
      s.on('connect', () => {
        done = true;
        s.destroy();
        resolve(true);
      });
      s.on('error', () => {
        if (!done) {
          done = true;
          resolve(false);
        }
      });
      s.on('timeout', () => {
        if (!done) {
          done = true;
          s.destroy();
          resolve(false);
        }
      });
      s.connect(port, '127.0.0.1');
    });

    if (ok) return true;

    sendSplashProgress({
      text: `Waiting for backend on port ${port} (attempt ${tries})…`,
      progress: Math.min(70, 10 + tries * 6),
    });
    await sleep(800 + Math.min(tries * 200, 1500));
  }
  return false;
}

// Prevent concurrent createWindow calls
let windowCreating = false;

function createWindow(): BrowserWindow {
  // If a usable window already exists, focus and return it
  if (win && !win.isDestroyed()) {
    try {
      // If the window was hidden, show it
      if (!win.isVisible()) win.show();
      win.focus();
    } catch (err) {
      log.warn('createWindow: focus/show failed', err);
    }
    return win;
  }

  // If creation is already underway, return early (caller can rely on the existing 'win' afterwards)
  if (windowCreating) {
    return win;
  }

  windowCreating = true;

  // Create the browser window (unchanged)
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    useContentSize: true,
    center: true,
    resizable: true,
    maximizable: true,
    //titleBarOverlay: true,
    frame: false,
    show: false, // <-- hide at startup
    titleBarStyle: process.env.PORTABLE_EXECUTABLE_DIR.includes('testground')
      ? 'default'
      : 'hidden',
    webPreferences: {
      ['enableRemoteModule' as any]: true,
      nodeIntegration: true,
      webSecurity: false,
      allowRunningInsecureContent: serve,
      contextIsolation: false,
    },
    //icon: path.join(__dirname, 'src/assets/icons/icon.ico'),
  });

  win.setResizable(true);
  win.setMaximizable(true);
  forwardMaxState();

  // Hook the main window life-cycle and behavior
  win.on('closed', () => {
    win = null;
    windowCreated = false;
    windowCreating = false;
    // Reset focus request: no window exists
    focusRequestedBySecondInstance = false;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const electronRemote = require('@electron/remote/main');
  electronRemote.initialize();
  electronRemote.enable(win.webContents);

  // load URL / dev mode behavior remains identical
  if (serve) {
    const debug = require('electron-debug');
    debug();
    require('electron-reloader')(module);
    win.loadURL('http://localhost:4200');
  } else {
    let pathIndex = './index.html';
    if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
      pathIndex = '../dist/index.html';
    }
    // pathToFileURL() handles Windows drive letters + backslashes correctly;
    // the previous `new URL(path.join('file:', ...))` produced malformed URLs
    // like `file:\C:\…\index.html` that Node's URL constructor rejects when
    // the file:// branch is exercised (electron:local path, not --serve).
    const url = require('url').pathToFileURL(path.resolve(__dirname, pathIndex));
    win.loadURL(url.href);

    // Attach titlebar to window - safe attempt
    //try {
    //  attachTitlebarToWindow(win);
    //  mainTitlebarAttached = true;
    //} catch (err) {
    //  log.warn('attachTitlebarToWindow failed', err);
    //}
  }

  // When the UI finishes loading, mark it and optionally take action
  win.webContents.once('did-finish-load', () => {
    uiLoaded = true;
    windowCreated = true;
    windowCreating = false;
    sendSplashProgress({ text: 'UI loaded', progress: 75 });

    // Try showing the main window if both the UI and backend are ready
    showMainWindowIfBackendAndUIReady('did-finish-load');

    // If the app was requested to focus via second-instance while the window
    // wasn't yet created, honor that now and focus the window.
    if (focusRequestedBySecondInstance) {
      try { win.show(); win.focus(); } catch { }
      focusRequestedBySecondInstance = false;
    }
  });

  return win;
}

let serverProcess: ChildProcessWithoutNullStreams;

try {
  app.commandLine.appendSwitch(
    'disable-features',
    'BlockInsecurePrivateNetworkRequests',
  );

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  // Added 400 ms to fix the black background issue while using transparent window. More detais at https://github.com/electron/electron/issues/15947

  app.on('ready', async () => {
    // E2E mode: Java server is started externally by test scripts.
    // Skip splash and backend-wait logic; create window immediately.
    const isE2E = process.env.RUNNING_IN_E2E === 'true';
    if (isE2E) {
      log.info('main: E2E mode detected — creating window immediately (no splash, no backend wait)');
      setTimeout(() => {
        if (!win) {
          win = createWindow();
          win.show();
        }
      }, 400);
      return; // skip the rest of the ready handler
    }

    try {
      // show splash early ONLY in packaged builds
      if (app.isPackaged) {
        // show splash early
        // pick a theme for the splash only (packaged: deterministic dark / dev: random)
        const theme = chooseTheme();
        // show splash early with matching native background color (no change to main window)
        splashWindow = createSplashWindow(theme);
        sendSplashProgress({ text: 'Starting application...', progress: 6 });
      }

      // defer heavy module actions after splash painted
      // safe setup for custom titlebar (defer to ready)
      //try {
      //  setupTitlebar();
      //} catch (err) {
      //  log.warn('setupTitlebar failed', err);
      //}

      // In packaged runs, we wait for the server stdout to create the main window to
      // avoid early empty frames. In development mode, create and show window immediately
      // (like the old behavior) — gulp already waited for server, no coordination needed.
      if (!app.isPackaged) {
        log.info('main: Development mode — creating window immediately');
        sendSplashProgress({ text: 'Development mode — initializing UI', progress: 20 });
        setTimeout(() => {
          if (!win) {
            win = createWindow();
            win.show(); // Show immediately in dev mode (matches old behavior)
            // Defer BMP regen until after the main window has finished loading and
            // the app is fully running. The hidden capture window contended with the
            // main window during startup, so we run it in the background only after
            // everything else is up. The BMP is only consumed at electron-builder
            // package time, not at dev runtime, so timing is flexible.
            win.webContents.once('did-finish-load', () => {
              setTimeout(() => {
                log.info('main: starting deferred splash BMP regeneration');
                generateSplashIfMissing().catch((err) =>
                  log.warn('generateSplashIfMissing failed', err),
                );
              }, 10000); // 10 s after the Angular app finishes loading
            });
          }
        }, 400);
        return; // Skip the rest of the ready handler - no server monitoring or probes needed
      }

      // Packaged mode only — dev mode already returned above.
      // Start/monitor server, forwarding log lines to splash with sendSplashProgress().
      serverProcess = _spawnSync('startRbsjServer.bat', [], {
        cwd: `${process.env.PORTABLE_EXECUTABLE_DIR}/tools/rbsj`,
        env: { ...process.env, ELECTRON_PID: process.pid.toString() },
      });
      serverProcess.stdout.on('data', (data) => {
        sendSplashProgress({ text: String(data).trim(), progress: 20 });
        handleServerOutput(data, false);
      });
      serverProcess.stderr.on('data', (data) => {
        sendSplashProgress({ text: String(data).trim(), progress: 15 });
        handleServerOutput(data, true);
      });

      // Rely primarily on the server's stdout to decide when to create the main window.
      // The handleServerOutput() callback will call createWindow() when it detects
      // a successful server start or a Java error. To avoid the UI hanging forever
      // if logs are silent or server is slow, use a fallback to show the UI for
      // diagnostics after a reasonable timeout.
      if (app.isPackaged) {
        const fallbackMs = 120000;
        setTimeout(() => {
          if (!windowCreated) {
            sendSplashProgress({ text: 'Backend not responding; showing UI for diagnostics', progress: 90 });
            try { if (!win) createWindow(); win?.show(); win?.focus(); } catch { }
            try {
              if (!rendererReady) {
                BrowserWindow.getAllWindows().forEach((w) => { try { w.webContents.send('renderer.init.retry'); } catch { } });
                log.info('main: sent renderer.init.retry to renderers (fallback)');
              }
            } catch { }
            setTimeout(() => { try { splashWindow?.close(); } catch { } }, 800);
          }
        }, fallbackMs);
      }

      // Dev mode: server is started externally, use port probe as the ONLY coordination mechanism.
      // Production mode: log parsing is primary, port probe is backup (in case logs are silent).
      (async () => {
        const probeTimeoutMs = 120000;
        try {
          const ok = await waitForServerPort(9090, probeTimeoutMs);
          if (ok) {
            setBackendReady(true, 'port-probe');
          } else {
            log.info('main: port probe timed out (no backend reachable)');
            // In dev mode, show UI for diagnostics if backend never responded
            if (!app.isPackaged && !windowCreated) {
              log.info('main: dev mode fallback — showing UI for diagnostics');
              try { if (!win) createWindow(); win?.show(); win?.focus(); } catch { }
            }
          }
        } catch (err) {
          log.warn('main: error during backend port probe', err);
        }
      })();

    } catch (err) {
      log.error('Error in app.ready handler', err);
      // Ensure we close the splash and show the main window so the user can see the error or UI
      try { splashWindow?.close(); } catch { }
      try { if (!win) createWindow(); win?.show(); win?.focus(); } catch { }
    }
  });

  app.on('before-quit', async () => {
    // log.info(`before-quit: serverProcess exists? ${!!serverProcess}`);

    //stop the java server
    if (app.isPackaged) {
      if (serverProcess) {
        //log.info(
        //  `executing ${process.env.PORTABLE_EXECUTABLE_DIR}/tools/rbsj/shutRbsjServer.bat`,
        //);
        await _shutServer();
      }
    }
  });

  app.on('will-quit', async () => {
    // log.info(`will-quit: serverProcess exists? ${!!serverProcess}`);

    if (app.isPackaged) {
      if (serverProcess) {
        //stop the java server
        await _shutServer();
      }
    }
  });

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
      createWindow();
    }
  });
} catch (e) {
  // Catch Error
  // throw e;
}

let windowCreated = false;
let unifiedBuffer = '';

function handleServerOutput(data: Buffer | string, isError = false) {
  unifiedBuffer += data.toString();
  let lines = unifiedBuffer.split(/\r?\n/);
  unifiedBuffer = lines.pop() || '';
  for (const line of lines) {
    log.info(line);

    // forward to splash for visibility
    sendSplashProgress({ text: line.trim(), progress: undefined });

    // If we haven't already created a window, only then attempt to create
    if (!windowCreated) {
      // Success patterns - server started successfully
      if (
        /started\s+serverapplication/i.test(line) ||
        /starting\s+protocolhandler/i.test(line) ||
        /initializing\s+spring\s+dispatcherservlet/i.test(line)
      ) {
        log.info(`main:createWindow() because of successful server start: ${line}`);
        windowCreated = true;
        if (!win) createWindow();
        setBackendReady(true, 'handleServerOutput'); // This will show window if UI is loaded
      }

      // Java error patterns -> open UI for diagnostics
      else if (
        line.includes("'java' is not recognized") ||
        line.includes("java: command not found") ||
        line.includes("Error: JAVA_HOME is not defined") ||
        /could not find (.*) java/i.test(line)
      ) {
        log.info(`main:createWindow() because of Java error: ${line}`);
        windowCreated = true;
        if (!win) createWindow();
        // Bring UI forward and close splash so user sees diagnostics immediately
        try { win?.show(); win?.focus(); } catch { }
        try { splashWindow?.close(); } catch { }
      }
    }

    // If an error line occurs and window isn't visible -> show UI for diagnostics
    if (isError && win && !win.isVisible()) {
      try { win.show(); win.focus(); } catch { }
    }
  }
}

ipcMain.handle('dialog.show-save', async (event, options) => {
  const result = await dialog.showSaveDialog(options);
  return result;
});

ipcMain.handle('dialog.show-open', async (event, options) => {
  const result = await dialog.showOpenDialog(options);
  return result;
});

ipcMain.handle('child_process.exec', async (event, command) => {
  const execPromise = promisify(_execSync);
  return execPromise(command);
});

ipcMain.handle(
  'child_process.spawn',
  async (event, command, args?, options?) => {
    const spawnPromise = promisify(_spawnSync);
    return spawnPromise(command, args, options);
  },
);

ipcMain.handle('process.env', async (event, envVariableName) => {
  return process.env[envVariableName];
});

ipcMain.handle('log', async (event, level, message) => {
  switch (level) {
    case 'info':
      log.info(message);
      break;
    case 'warn':
      log.warn(message);
      break;
    case 'error':
      log.error(message);
      break;
    case 'debug':
      log.debug(message);
      break;
    default:
      log.info(message);
      break;
  }
});

ipcMain.handle('getSystemInfo', async (event) => {
  return _getSystemInfo();
});

ipcMain.handle('app.relaunch', async (event) => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('app.shutserver', async (event) => {
  return _shutServer();
});

ipcMain.on('restart_app', () => {
  app.relaunch();
  app.exit(0);
});

// Renderer handshake: renderer notifies main that its init is complete (or failed)
ipcMain.on('renderer.init.complete', (event) => {
  rendererReady = true;
  log.info('renderer.init.complete received');

  // If backend already ready and UI loaded -> show app and close splash
  if (backendReady && uiLoaded) {
    try { win?.show(); win?.focus(); } catch { }
    try { splashWindow?.close(); } catch { }
  } else {
    sendSplashProgress({ text: 'Renderer initialized; still waiting for backend', progress: 84 });
  }
  // If a second-instance requested focus while the window was not created,
  // honor that now and focus the window.
  if (focusRequestedBySecondInstance) {
    try { win?.show(); win?.focus(); } catch { }
    focusRequestedBySecondInstance = false;
  }
});

ipcMain.on('renderer.init.failed', (event, reason) => {
  log.warn('renderer.init.failed', reason);
  sendSplashProgress({ text: 'Renderer init failed - will retry when backend is ready', progress: 80 });
});

// Handle opening HTML in browser
ipcMain.on('open-html-in-browser', (event, args) => {
  try {
    // Create a more unique filename with template name
    const tempName = args.title
      ? args.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      : 'template';

    const tempPath = path.join(os.tmpdir(), `${tempName}-${Date.now()}.html`);
    fs.writeFileSync(tempPath, args.html, 'utf8');

    // Use shell.openExternal which is more reliable
    shell.openExternal(`file://${tempPath}`);
  } catch (error) {
    console.error('Error opening HTML in browser:', error);
    event.sender.send('open-html-in-browser-error', { error: error.message });
  }
});

ipcMain.handle('getBackendUrl', async (event) => {
  //if non-"production"
  if (!app.isPackaged) return 'http://localhost:9090/api';

  const internalSettingsXmlFilePath = `${process.env.PORTABLE_EXECUTABLE_DIR}/config/_internal/settings.xml`;
  const internalSettingsXmlFileContent = await fs.promises.readFile(
    internalSettingsXmlFilePath,
    'utf-8',
  );

  const match = internalSettingsXmlFileContent.match(
    /<backendurl>(.*?)<\/backendurl>/,
  );
  const backendUrl = match ? match[1] : null;

  //log.info(`getBackendUrl settings.xml: ${internalSettingsXmlFileContent}`);

  return backendUrl;
});

ipcMain.handle('getApiKey', async (event) => {
  try {
    const baseDir = process.env.PORTABLE_EXECUTABLE_DIR;
    const resolvedBase = baseDir || process.cwd();

    const apiKeyFilePath = `${resolvedBase}/config/_internal/api-key.txt`;
    const apiKey = await fs.promises.readFile(apiKeyFilePath, 'utf-8');
    return apiKey.trim();
  } catch (error) {
    // API key file may not exist yet (first startup) - this is normal in dev mode
    log.info('[DEV] api-key.txt not found, using default API_KEY or "123". This is expected during development.');
    return "123";
  }
});

ipcMain.handle(
  'jetpack.dirAsync',
  async (event, pathFolder, criteria = { empty: false, mode: undefined }) => {
    const mkdir = promisify(fs.mkdir);
    const readdir = promisify(fs.readdir);
    const unlink = promisify(fs.unlink);
    const chmod = promisify(fs.chmod);
    const stat = promisify(fs.stat);

    try {
      const stats = await stat(pathFolder);

      if (!stats.isDirectory()) {
        throw new Error(`Path ${pathFolder} exists but is not a directory`);
      }

      if (criteria.empty) {
        const files = await readdir(pathFolder);
        await Promise.all(
          files.map((file) => unlink(path.join(pathFolder, file))),
        );
      }

      if (criteria.mode !== undefined) {
        await chmod(pathFolder, criteria.mode);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        await mkdir(pathFolder, { recursive: true, mode: criteria.mode });
      } else {
        throw error;
      }
    }
  },
);

ipcMain.handle(
  'jetpack.copyAsync',
  async (
    event,
    from,
    to,
    options: {
      overwrite?:
      | boolean
      | ((source: any, destination: any) => boolean | Promise<boolean>);
      matching?: string;
      ignoreCase?: boolean;
    },
  ) => {
    return await jetpack.copyAsync(from, to, options);
  },
);

ipcMain.handle(
  'jetpack.moveAsync',
  async (
    event,
    from,
    to,
    options: {
      overwrite?: false;
    },
  ) => {
    return await jetpack.moveAsync(from, to, options);
  },
);

ipcMain.handle('jetpack.existsAsync', async (event, filePath) => {
  return await jetpack.existsAsync(filePath);
});

ipcMain.handle('jetpack.removeAsync', async (event, filePath) => {
  return await jetpack.removeAsync(filePath);
});

ipcMain.handle('jetpack.writeAsync', async (event, filePath, content) => {
  return await jetpack.writeAsync(filePath, content);
});

ipcMain.handle('jetpack.readAsync', async (event, filePath) => {
  return await jetpack.readAsync(filePath);
});

ipcMain.handle('jetpack.findAsync', async (event, directory, options) => {
  return await jetpack.findAsync(directory, options);
});

async function _shutServer() {
  serverProcess = null;
  _spawnSync('shutRbsjServer.bat', {
    cwd: `${process.env.PORTABLE_EXECUTABLE_DIR}/tools/rbsj`,
  });
  await sleep(1000);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function _getSystemInfo(): Promise<{
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
  let dockerIsInstalled = true;
  let chocoIsInstalled = true;

  const electronLogFileContent = await fs.promises.readFile(
    electronLogFilePath,
    'utf8',
  );

  let rbsjExeLogFileContent = await readLogFileSmart(rbsjExeLogFilePath);

  // keep existing English-based quick checks (harmless on English systems)
  if (electronLogFileContent.includes("'choco' is not recognized")) {
    chocoIsInstalled = false;
  }

  // robust presence probe (Windows: where, Unix: which)
  if (chocoIsInstalled)
    chocoIsInstalled =
      process.platform === 'win32'
        ? await commandExistsWindows('choco')
        : await execAsync('which choco')
          .then(() => true)
          .catch(() => false);

  if (electronLogFileContent.includes("'docker' is not recognized")) {
    dockerIsInstalled = false;
  }

  if (dockerIsInstalled)
    dockerIsInstalled =
      process.platform === 'win32'
        ? await commandExistsWindows('docker')
        : await execAsync('which docker')
          .then(() => true)
          .catch(() => false);

  // Prepare log lines once (safer splitting for CRLF)
  const logLines = electronLogFileContent.split(/\r?\n/).map((l) => l.trim());
  const firstNonEmptyLine = logLines.find((l) => l.length > 0) || '';

  // Extract Chocolatey version (probe first, fallback to log search)
  let chocoVersion = '';
  if (chocoIsInstalled) {
    const v = await getVersionFromCommand(
      'choco',
      process.platform === 'win32' ? '-v' : '--version',
    );
    if (v) {
      chocoVersion = v;
    } else {
      // search the whole log for a numeric token on a line referencing choco/chocolatey
      const chocoLine =
        logLines.find((l) => /choco|chocolatey/i.test(l)) || firstNonEmptyLine;
      const m = chocoLine.match(/(\d+(?:\.\d+){0,})/);
      chocoVersion = m ? m[1] : '';
    }
  } else {
    chocoVersion = '';
  }

  // Extract Docker version (probe first, fallback to log search across all lines)
  let dockerVersion = '';
  if (dockerIsInstalled) {
    const v = await getVersionFromCommand('docker', '--version');
    if (v) {
      dockerVersion = v;
    } else {
      // look for common Docker patterns anywhere in the log
      const dockerFullMatch =
        electronLogFileContent.match(/Docker version\s*([\d\.]+)/i) ||
        electronLogFileContent.match(/docker[^\d\n]*?(\d+(?:\.\d+){0,})/i);
      dockerVersion = dockerFullMatch ? dockerFullMatch[1] : '';
    }
  } else {
    dockerVersion = '';
  }

  // Extract Java version and decide compliance
  // prefer probing 'java -version' (captures stdout+stderr), fallback to rbsj-exe.log
  const javaVersionFromCmd = await getJavaVersionFromCommand();
  const javaVersion = javaVersionFromCmd || detectJavaVersion(rbsjExeLogFileContent);
  const javaMajor = parseJavaMajor(javaVersion);
  const isJavaOk = !Number.isNaN(javaMajor) && javaMajor >= 17;

  let isPortalProvisioned = false;
  try {
    await fs.promises.access(portalSageComposerLockFilePath);
    isPortalProvisioned = true;
  } catch {
    isPortalProvisioned = false;
  }

  const sysInfo = {
    chocolatey: {
      isChocoOk: chocoIsInstalled,
      version: chocoIsInstalled ? chocoVersion : '',
    },
    java: {
      isJavaOk: isJavaOk,
      version: isJavaOk ? javaVersion : '',
    },
    docker: {
      isDockerOk: dockerIsInstalled,
      version: dockerIsInstalled ? dockerVersion : '',
    },
    portal: {
      isProvisioned: isPortalProvisioned,
    },
    env: {
      PATH: process.env.PATH || '',
      JAVA_HOME: process.env.JAVA_HOME || '',
      JRE_HOME: process.env.JRE_HOME || '',
    },
  };

  //console.log(`_getSystemInfo: ${JSON.stringify(sysInfo)}`);

  return sysInfo;
}

function parseJavaMajor(version: string): number {
  if (!version) return NaN;
  // examples handled:
  // "17.0.8" -> 17
  // "11.0.12" -> 11
  // "1.8.0_261" -> 8 (legacy format)
  const cleaned = version.trim();
  if (cleaned.startsWith('1.')) {
    // legacy "1.x.y" => major = second token
    const parts = cleaned.split(/[._-]/);
    return parseInt(parts[1], 10);
  } else {
    const parts = cleaned.split(/[._-]/);
    return parseInt(parts[0], 10);
  }
}

// add near other helpers in the same file
async function getJavaVersionFromCommand(): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync('java -version');
    const out = `${stdout || ''}\n${stderr || ''}`;
    // try the robust detector first (handles full phrases), then fallback to numeric token
    const v = detectJavaVersion(out);
    if (v) return v;
    const m = out.match(/(\d+(?:\.\d+){0,})/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

// rename parameter for clarity (update any call sites above accordingly)
function detectJavaVersion(outputContent: string): string {
  let match = outputContent.match(/using Java ([\w\.]+)/i);
  if (match) return match[1].trim();

  match = outputContent.match(/(?:openjdk|java|adoptopenjdk|temurin)[^\n]*version\s+"([\d._]+)"/i);
  if (match) return match[1].trim();

  match = outputContent.match(/java version\s+"([\d._]+)"/i);
  if (match) return match[1].trim();

  match = outputContent.match(/version\s+"([\d._]+)"/i);
  if (match) return match[1].trim();

  match = outputContent.match(/openjdk\s+([\d._]+)/i);
  if (match) return match[1].trim();

  match = outputContent.match(/temurin-([\d._]+)/i);
  if (match) return match[1].trim();

  return '';
}

async function commandExistsWindows(cmd: string): Promise<boolean> {
  try {
    await execAsync(`where ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

async function getVersionFromCommand(cmd: string, args = '--version'): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(`${cmd} ${args}`);
    const out = `${stdout || ''}\n${stderr || ''}`;
    const m = out.match(/(\d+(?:\.\d+){0,})/); // first numeric token
    return m ? m[1] : out.split(/\r?\n/)[0].trim();
  } catch {
    return '';
  }
}

async function readLogFileSmart(filePath: string): Promise<string> {
  const encodings: BufferEncoding[] = ['utf8', 'utf16le', 'latin1'];
  for (const encoding of encodings) {
    try {
      const content = await fs.promises.readFile(filePath, { encoding });
      // If content is not empty and does not contain too many replacement chars, return it
      const replacementCharCount = (content.match(/\uFFFD/g) || []).length;
      if (content.trim().length > 0 && replacementCharCount < 3) {
        return content;
      }
    } catch (err) {
      // Try next encoding
    }
  }
  return '';
}

function writeBmpFromNativeImage(img: Electron.NativeImage, outPath: string): void {
  const { width, height } = img.getSize();

  // img.toBitmap() returns a Buffer (BGRA, row-major, top-down)
  const rawBuf: any = img.toBitmap();

  const rowBytes = width * 4;
  const pixelData: any = Buffer.alloc(rawBuf.length);

  // BMP requires rows bottom-up -> invert row order
  for (let y = 0; y < height; y++) {
    const srcStart = y * rowBytes;
    const dstStart = (height - 1 - y) * rowBytes;
    rawBuf.copy(pixelData, dstStart, srcStart, srcStart + rowBytes);
  }

  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const pixelDataOffset = fileHeaderSize + infoHeaderSize;
  const fileSize = pixelDataOffset + pixelData.length;

  const header = Buffer.alloc(fileHeaderSize + infoHeaderSize);

  // BITMAPFILEHEADER
  header.writeUInt16LE(0x4d42, 0); // 'BM'
  header.writeUInt32LE(fileSize, 2);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt32LE(pixelDataOffset, 10);

  // BITMAPINFOHEADER
  header.writeUInt32LE(infoHeaderSize, 14); // biSize
  header.writeInt32LE(width, 18); // biWidth
  header.writeInt32LE(height, 22); // biHeight (positive = bottom-up)
  header.writeUInt16LE(1, 26); // biPlanes
  header.writeUInt16LE(32, 28); // biBitCount (32 bits)
  header.writeUInt32LE(0, 30); // biCompression = BI_RGB
  header.writeUInt32LE(pixelData.length, 34); // biSizeImage
  header.writeInt32LE(0, 38); // biXPelsPerMeter
  header.writeInt32LE(0, 42); // biYPelsPerMeter
  header.writeUInt32LE(0, 46); // biClrUsed
  header.writeUInt32LE(0, 50); // biClrImportant

  const outBuf = Buffer.concat([header, pixelData]);
  fs.writeFileSync(outPath, outBuf as any);
}

async function generateSplashIfMissing(): Promise<void> {
  try {
    const outDir = path.resolve(__dirname, '../src/assets/images');
    const dark = path.join(outDir, 'splash-dark.bmp');

    if (fs.existsSync(dark)) return;

    sendSplashProgress({ text: 'Generating splash image (dark)…', progress: 16 });
    fs.mkdirSync(outDir, { recursive: true });

    // Capture scale: choose 2 or 3 depending how large/high-DPI you want the embedded BMP.
    const EMBED_SCALE = Number(process.env.SPLASH_EMBED_SCALE || 2);

    async function captureSplash(outFileFull: string, outFileSmall?: string, embedScale = 2) {
      const logicalW = 180;
      const logicalH = 150;
      const splashHtml = path.join(__dirname, 'splash-bmp.html'); // static small-mark page
      const pxW = Math.round(logicalW * embedScale);
      const pxH = Math.round(logicalH * embedScale);
      const bg = '#1f1f1f';

      const w = new BrowserWindow({
        width: logicalW,
        height: logicalH,
        useContentSize: true,
        show: false,
        frame: false,
        resizable: false,
        backgroundColor: bg,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      try {
        if (!fs.existsSync(splashHtml)) throw new Error('splash-bmp.html not found');
        const url = `file://${splashHtml.replace(/\\/g, '/')}`;
        await w.loadURL(url);

        // Force rasterization scale we want (embedded scale)
        try { w.webContents.setZoomFactor(embedScale); } catch { /* ignore */ }
        // Ensure CSS viewport matches logical size (no layout overflow)
        try { w.setContentSize(logicalW, logicalH); } catch { /* ignore */ }

        // Hide scrollbars/margins if any
        try {
          await w.webContents.executeJavaScript(
            `(() => {
           const s = document.createElement('style'); s.id='splash-capture-fix';
           s.textContent = 'html,body{overflow:hidden !important;margin:0 !important;padding:0 !important;height:100% !important} .viewport{width:${logicalW}px;height:${logicalH}px}';
           (document.head||document.documentElement).appendChild(s); return true;
         })();`,
            true,
          );
        } catch { /* ignore */ }

        // Short settle
        await new Promise(r => setTimeout(r, 120));

        // 1) Full canvas capture (device pixels: pxW x pxH)
        try {
          const fullImg = await w.webContents.capturePage({ x: 0, y: 0, width: pxW, height: pxH });
          writeBmpFromNativeImage(fullImg, outFileFull);
        } catch (e) {
          log.warn('Full splash capture failed', e);
        }

        // 2) Small crop around the "mark" (svg.dp or .mini), converted to device pixels
        if (outFileSmall) {
          try {
            // Get boundingClientRect and devicePixelRatio from the page
            const rect = await w.webContents.executeJavaScript(
              `(() => {
             const el = document.querySelector('svg.dp') || document.querySelector('.mini');
             if (!el) return null;
             const r = el.getBoundingClientRect();
             const dpr = window.devicePixelRatio || 1;
             return { x: r.x, y: r.y, w: r.width, h: r.height, dpr: dpr };
           })();`,
              true,
            );

            if (rect && rect.w > 0 && rect.h > 0) {
              const marginLogical = 6; // logical px margin around mark
              const deviceDpr = rect.dpr || 1;

              // Convert CSS rect to device pixels using page dpr (accounts for OS scale and page zoomFactor)
              let x = Math.floor((rect.x - marginLogical) * deviceDpr);
              let y = Math.floor((rect.y - marginLogical) * deviceDpr);
              let wPx = Math.ceil((rect.w + marginLogical * 2) * deviceDpr);
              let hPx = Math.ceil((rect.h + marginLogical * 2) * deviceDpr);

              // clamp to canvas bounds
              x = Math.max(0, Math.min(pxW - 1, x));
              y = Math.max(0, Math.min(pxH - 1, y));
              wPx = Math.max(1, Math.min(pxW - x, wPx));
              hPx = Math.max(1, Math.min(pxH - y, hPx));

              // Capture only the small box (this should be small)
              const cropped = await w.webContents.capturePage({ x, y, width: wPx, height: hPx });

              // Optional: resize small crop to a predictable small size (e.g., logical 84 × embedScale)
              const targetLogical = 84;
              const targetW = Math.round(targetLogical * embedScale);
              const aspect = wPx / hPx || 1;
              const targetH = Math.round(targetW / aspect);

              const resized = cropped.resize({ width: Math.max(1, targetW), height: Math.max(1, targetH) });
              writeBmpFromNativeImage(resized, outFileSmall);
              sendSplashProgress({ text: 'Saved small splash', progress: undefined });
            } else {
              sendSplashProgress({ text: 'No small element found; skipped small BMP', progress: undefined });
            }
          } catch (err) {
            log.warn('Small splash capture failed', err);
          }
        }

        sendSplashProgress({ text: 'Saved splash', progress: undefined });
      } finally {
        try { w.destroy(); } catch { }
      }
    }
    await captureSplash(dark);

    sendSplashProgress({ text: 'Splash image generated.', progress: 20 });
  } catch (err) {
    log.warn('generateSplashIfMissing failed', err);
    sendSplashProgress({ text: 'Failed to generate splash images', progress: undefined });
  }
}

// Central helper to show the main window when both UI and backend are ready
function showMainWindowIfBackendAndUIReady(source?: string) {
  if (!uiLoaded || !backendReady) return;
  log.info(`main: showMainWindowIfBackendAndUIReady (source=${source || 'unknown'})`);
  try { win?.show(); win?.focus(); } catch { }
  try { splashWindow?.close(); } catch { }
}

// Central helper when backend readiness changes
function setBackendReady(isReady: boolean, source?: string) {
  backendReady = !!isReady;
  log.info(`main: backendReady=${backendReady} (source=${source || 'unknown'})`);
  // broadcast to renderers like before
  try { BrowserWindow.getAllWindows().forEach((w) => { try { w.webContents.send('backend-ready'); } catch { } }); } catch (e) { }
  showMainWindowIfBackendAndUIReady(source);
}