import * as jetpack from 'fs-jetpack';
import * as path from 'path';

export async function takeScreenshotIfRequested(
  page: Page,
  screenshotName: string,
): Promise<void> {
  const takeScreenshots = process.env.TAKE_SCREENSHOTS === 'true';

  if (takeScreenshots) {
    const screenshotsDir = path.join(
      process.env.PORTABLE_EXECUTABLE_DIR,
      'e2e/screenshots',
    );
    await jetpack.dirAsync(screenshotsDir);

    const screenshotPath = path.join(screenshotsDir, `${screenshotName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    //console.log(`Screenshot saved: ${screenshotPath}`);
  }
}

import * as _ from 'lodash';

import * as PATHS from './paths';
import { Constants } from './constants';

import * as updaterHelpers from '../upgrade/updater.helpers';

const isElectron = process.env.TEST_ENV === 'electron';

import {
  Browser,
  BrowserContext,
  ElectronApplication,
  _electron as electron,
  chromium,
  Page,
} from '@playwright/test';

const findProcess = require('find-process');
const kill = require('tree-kill');
const slash = require('slash');

export class Helpers {
  static generateLetmeUpdateBaseline = async () => {
    //the baseline should always be generated starting from 8.7.2, the first version when auto-update was introduced
    //the baseline can be generated once and then can be source-controlled / storred on git
    let DOCUMENTBURSTER_BASELINE_VERSION = '8.7.2'.split('.').join('');

    const UPGRADE_DIR = 'testground/upgrade';

    await jetpack.dirAsync(UPGRADE_DIR, { empty: true });

    const baselineVersionFilePath = `${PATHS.E2E_RESOURCES_PATH}/upgrade/_baseline/db-baseline-8.7.2.zip`;
    //console.log(`baselineVersionFilePath = ${baselineVersionFilePath}`);
    await updaterHelpers.default.extractBaseLineAndCopyCustomConfigAndScriptFiles(
      UPGRADE_DIR,
      baselineVersionFilePath,
    );
  };

  static killHangingJavaProcesses = async () => {
    //kill "hanging" java processes
    let javaProcesses = await findProcess('name', 'java');

    if (!javaProcesses || javaProcesses.length == 0)
      javaProcesses = await findProcess('name', 'openjdk');

    if (javaProcesses && javaProcesses.length > 0) {
      //console.log(`Killing ${javaProcesses.length} Java Processes`);

      for (const javaProc of javaProcesses) {
        //console.log(`KILLED ${javaProc.name} with proc.pid ${javaProc.pid}`);
        await kill(javaProc.pid);
      }
    }
  };

  static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static deActivateLicenseKey = async () => {
    // de-activate the test license so that all tests will start from a 'demo' license
    // build src/dest reliably regardless of trailing slashes or leading slashes in PATHS constants
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (!portableDir) throw new Error('PORTABLE_EXECUTABLE_DIR is not set');

    const src = path.join(PATHS.E2E_RESOURCES_PATH, 'license', 'license-active.xml');
    // remove any leading slashes from PATHS.CONFIG_PATH so path.join keeps portableDir
    const configPathPart = PATHS.CONFIG_PATH.replace(/^[/\\]+/, '');
    const dest = path.join(portableDir, configPathPart, '_internal', 'license.xml');

    //console.log(`Copying license file from ${src} to ${dest}`);
    await jetpack.copyAsync(src, dest, { overwrite: true });

    await Helpers.setCiLicenseInstanceId(dest);

    // The running DataPallas deactivates it through the endpoint the UI's licence screen calls. That is the
    // same on Windows, Linux, Electron and the Docker server - where no CLI script sits next to the data
    // folders on the host.
    try {
      const response = await fetch('http://localhost:9090/api/system/license/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...Helpers.apiKeyHeader() },
        body: '{}',
        signal: AbortSignal.timeout(Constants.DELAY_HUNDRED_SECONDS),
      });
      if (!response.ok) {
        console.warn(`deActivateLicenseKey: POST /api/system/license/deactivate answered ${response.status}`);
      }
    } catch (err) {
      console.warn('deActivateLicenseKey: POST /api/system/license/deactivate failed:', err);
    }
  };

  /**
   * Linux CI (plan §4 D2): each run starts from a fresh testground, so the licence got a new random instance id
   * every time, and every run stopped between activate and deactivate left one activation of the test key on the
   * licence server (9 of them on 2026-09-15, limit 1 → activating logged a WARN). With E2E_LICENSE_INSTANCE_ID
   * (set only by asbl/ci/dp-ci.sh) every CI run is the same instance: a deactivation frees whatever an earlier run
   * left, and the next activation reuses that seat. Written by the clean-state restore, before any page loads the
   * licence — a page holding the licence without the id writes it back without it on its next save. Without the
   * variable (every run outside that script) nothing is written.
   */
  static setCiLicenseInstanceId = async (licenseXmlPath: string) => {
    const ciInstanceId = process.env.E2E_LICENSE_INSTANCE_ID;
    if (!ciInstanceId) return;
    const licenseXml = (await jetpack.readAsync(licenseXmlPath)) || '';
    if (!licenseXml.includes('</license>')) return;
    const element = `<instanceid>${ciInstanceId}</instanceid>`;
    await jetpack.writeAsync(
      licenseXmlPath,
      /<instanceid>[^<]*<\/instanceid>|<instanceid\/>/.test(licenseXml)
        ? licenseXml.replace(/<instanceid>[^<]*<\/instanceid>|<instanceid\/>/, element)
        : licenseXml.replace('</license>', `    ${element}\n</license>`),
    );
  };

  static currentElectronApp: ElectronApplication | null = null;
  static currentBrowser: Browser;
  static currentBrowserContext: BrowserContext;

  static firstPage: Page | null = null;

  static electronAppLaunch = async (
    relativePath: string,
    opts?: { javaMissing?: boolean },
  ): Promise<ElectronApplication> => {
    // If an Electron app is already running, return it
    if (this.currentElectronApp) {
      return this.currentElectronApp;
    }

    // Screenshot prereq states need a machine that genuinely has no Java. Instead
    // of a code seam in main.ts, we launch against a REAL no-Java environment:
    // strip java/jdk/jre out of PATH (whatever case the key uses on Windows) and
    // clear JAVA_HOME/JRE_HOME, so the app's UNTOUCHED `java -version` probe finds
    // nothing — identical to launching the .exe from a shell with Java removed.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORTABLE_EXECUTABLE_DIR: process.env.PORTABLE_EXECUTABLE_DIR,
      RUNNING_IN_E2E: 'true',
      SHOULD_SEND_STATS: 'false',
    };
    if (opts?.javaMissing) {
      for (const key of Object.keys(env)) {
        if (key.toLowerCase() === 'path') {
          env[key] = (env[key] || '')
            .split(path.delimiter)
            .filter((entry) => !/jdk|jre|java/i.test(entry))
            .join(path.delimiter);
        }
      }
      env.JAVA_HOME = '';
      env.JRE_HOME = '';
    }

    this.currentElectronApp = await electron.launch({
      args: [
        path.join(__dirname, `${relativePath}/app/main.js`),
        path.join(__dirname, `${relativePath}/app/package.json`),
        // Chromium refuses to start as root without --no-sandbox (the Linux CI runs Electron as root in a
        // container). Windows has no root user, so there the arguments stay as they are.
        ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      ],
      env: env as { [key: string]: string },
    });
    this.currentElectronApp.context().tracing.start({
      screenshots: true,
      snapshots: true,
    });
    this.firstPage = await this.currentElectronApp.firstWindow();
    await this.firstPage.waitForLoadState('domcontentloaded');
    return this.currentElectronApp;
  };

  static electronAppClose = async () => {
    // If there's no running Electron app, there's nothing to close
    if (!this.currentElectronApp) {
      return;
    }

    const traceDir = path.join(
      process.env.PORTABLE_EXECUTABLE_DIR,
      'e2e/tracing',
    );
    const tracePath = path.join(traceDir, 'trace.zip');

    try {
      await jetpack.dirAsync(traceDir);

      // Stop tracing and save the trace file
      await this.currentElectronApp.context().tracing.stop({ path: tracePath });
    } catch (error) {
      console.error('Error stopping tracing or saving trace file:', error);
    }

    for (const page of this.currentElectronApp.context().pages()) {
      await page.close();
    }

    await this.currentElectronApp.context().close();
    await this.currentElectronApp.close();
    // Set currentElectronApp to null
    this.currentElectronApp = null;
    this.firstPage = null;
  };

  static appRestart = async (): Promise<Page> => {
    if (isElectron) {
      await Helpers.electronAppRestart('../..');
    } else {
      await Helpers.browserRestart();
    }
    return this.firstPage;
  };

  static appStart = async (): Promise<Page> => {
    if (isElectron) {
      await Helpers.electronAppLaunch('../..');
    } else {
      await Helpers.browserLaunch();
    }
    return this.firstPage;
  };

  static appClose = async (): Promise<void> => {
    if (isElectron) {
      await Helpers.electronAppClose();
    } else {
      await Helpers.browserClose();
    }
  };

  static electronAppRestart = async (relativePath: string): Promise<Page> => {
    await Helpers.electronAppClose();
    await Helpers.electronAppLaunch(relativePath);
    return this.firstPage;
  };

  static async browserRestart(): Promise<Page> {
    await Helpers.browserClose();
    await Helpers.browserLaunch();
    return this.firstPage;
  }

  /**
   * `signIn: false` opens the app without signing in. The per-test fixture (common-setup.ts) uses it: it signs in
   * only AFTER restoreDocumentBursterCleanState, because a signed-in app loads the report settings at once, and a
   * load that lands while the clean state has emptied config/ fails and writes errors.log after it was cleared.
   */
  static async browserLaunch({ signIn = true }: { signIn?: boolean } = {}): Promise<{
    browser: Browser;
    context: BrowserContext;
  }> {
    this.currentBrowser = await chromium.launch();
    this.currentBrowserContext = await this.currentBrowser.newContext();
    //await context.tracing.start({
    //  screenshots: true,
    //  snapshots: true,
    //});
    this.firstPage = await this.currentBrowserContext.newPage(); // Create a new page in the context
    await this.firstPage.goto(process.env.E2E_BASE_URL || 'http://localhost:4201'); // Navigate to the URL
    await this.firstPage.waitForLoadState('domcontentloaded'); // Wait for the 'domcontentloaded' event
    await Helpers.waitForAppToBootstrap(this.firstPage);
    if (signIn) await Helpers.signInIfLoginFormIsShown(this.firstPage);

    const browser = this.currentBrowser;
    const context = this.currentBrowserContext;

    return { browser, context };
  }

  /**
   * Web target: the dev server serves the UI as hundreds of separate module requests. Once (processing-qa,
   * 2026-09-15, Linux CI) a few of them never got an answer, Angular never bootstrapped and the page showed
   * "Loading..." until the test timed out. Wait for the app to replace its "Loading..." placeholder; if it does not
   * within 90 s, reload the page once. An app that starts normally passes this at once.
   */
  static async waitForAppToBootstrap(page: Page): Promise<void> {
    const bootstrapped = () =>
      page.waitForFunction(() => (document.querySelector('app-root')?.children.length ?? 0) > 0, null, {
        timeout: 90_000,
      });
    try {
      await bootstrapped();
    } catch {
      console.warn('waitForAppToBootstrap: the app did not start within 90 s, reloading the page once');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await bootstrapped();
    }
  }

  /**
   * The installation's API key as a request header, for REST calls made outside the browser session.
   * A DataPallas Server refuses machine callers without it; Desktop ignores the header, so the same call
   * works on both. ApiKeyManager writes the file at boot; clean state keeps it (plan §4 D5).
   */
  static apiKeyHeader(): Record<string, string> {
    const keyFile = path.resolve(
      process.env.PORTABLE_EXECUTABLE_DIR || '',
      'config/_internal/api-key.txt',
    );
    const key = (jetpack.read(keyFile) || '').trim();
    return key ? { 'X-API-Key': key } : {};
  }

  /**
   * Signs in when the app asks for it. Every deployment authenticates, so what decides the form is the
   * CALLER, not the mode: Electron presents the installation's API key and walks in, while a plain
   * browser — the `web` target, or anyone opening the Docker bundle — holds no credential and meets
   * the login screen. The shipped administrator is `burst`/`burst`, the account the bundle's own
   * README tells the customer to use on first start, and it is seeded in every deployment.
   *
   * Answers whether it actually signed in, so a caller can tell "there was nothing to do" from "the
   * session had lapsed and now it is back" and act on the difference.
   */
  static async signInIfLoginFormIsShown(page: Page): Promise<boolean> {
    const username = page.locator('#loginUsername').first();
    if (!(await username.isVisible({ timeout: 2_000 }).catch(() => false))) return false;

    console.log('signInIfLoginFormIsShown: the app shows the login form — signing in as the shipped admin');
    await username.fill('burst');
    await page.locator('#loginPassword').first().fill('burst');
    await page.locator('#btnLogin').first().click();
    await page.locator('#userMenu').first().waitFor({ state: 'visible', timeout: 60_000 });
    return true;
  }

  /**
   * Gives a browser context a DataPallas session through the API, as a viewer who signed in has - for
   * the separate browsers that open dashboards and the AI Hub (cookies ignore the port, so one session
   * covers :9090 and :8440). Asks the backend first and signs in only when the answer is that nobody
   * is: a context that already carries a session cookie is left alone.
   */
  static async signInBrowserContext(context: BrowserContext, baseUrl = 'http://localhost:9090'): Promise<void> {
    const me = await context.request.get(`${baseUrl}/api/auth/me`);
    if (!me.ok() || (await me.json()).authenticated) return;

    // The Server checks CSRF on the login too: echo the XSRF-TOKEN cookie that call just set.
    const xsrf = (await context.cookies(baseUrl)).find((c) => c.name === 'XSRF-TOKEN')?.value;
    const res = await context.request.post(`${baseUrl}/api/auth/login`, {
      data: { username: 'burst', password: 'burst' },
      headers: xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {},
    });
    if (!res.ok()) throw new Error(`signInBrowserContext: login at ${baseUrl} answered ${res.status()}`);
  }

  static async browserClose(): Promise<void> {
    if (!this.currentBrowserContext || !this.currentBrowser) {
      return;
    }

    //await context.tracing.stop({ path: 'e2e/tracing/trace.zip' });

    await this.currentBrowserContext.close();
    await this.currentBrowser.close();

    this.currentBrowserContext = null;
    this.currentBrowser = null;
    this.firstPage = null;
  }

  /**
   * Empties `/config` the way `jetpack.dirAsync({empty:true})` would, except it leaves the IAM
   * SQLite store alone. The backend opens `config/_internal/iam.db` at boot and holds it (plus its
   * WAL sidecars) open for the whole worker, so on Windows unlinking it fails with EBUSY and the
   * clean-state loop never terminates. IAM state is auto-provisioned at boot, not fixture config,
   * so keeping the file across tests costs nothing.
   *
   * `api-key.txt` is kept for the same reason: ApiKeyManager writes it once at boot and the running
   * server then holds the key in memory, so wiping the file did not affect DataPallas itself — but the
   * playground apps read exactly this file to call DataPallas (RbUtils, rb-config), and an app started
   * by a later test got no key, no embed token, and every embedded component rendered empty
   * (analytics-olap "Demo Pivot [DuckDB]": grand total 0; plan §4 D5).
   */
  static emptyConfigFolderKeepingIamStore = async (configPath: string) => {
    const keptInInternal = (name: string) => name.startsWith('iam.db') || name === 'api-key.txt';

    const entries = (await jetpack.listAsync(configPath)) || [];

    for (const entry of entries) {
      if (entry !== '_internal') {
        await jetpack.removeAsync(`${configPath}/${entry}`);
        continue;
      }

      const internalEntries =
        (await jetpack.listAsync(`${configPath}/_internal`)) || [];

      for (const internalEntry of internalEntries) {
        if (keptInInternal(internalEntry)) continue;
        await jetpack.removeAsync(`${configPath}/_internal/${internalEntry}`);
      }
    }

    // Nothing but the IAM store may survive - anything else means the wipe silently failed.
    const leftovers = (await jetpack.listAsync(configPath)) || [];
    const unexpected = leftovers.filter((entry) => entry !== '_internal');

    if (unexpected.length > 0)
      throw new Error(
        `restoreDocumentBursterCleanState /config folder not empty: ${unexpected.join(', ')}`,
      );

    const internalLeftovers =
      (await jetpack.listAsync(`${configPath}/_internal`)) || [];
    const unexpectedInternal = internalLeftovers.filter(
      (entry) => !keptInInternal(entry),
    );

    if (unexpectedInternal.length > 0)
      throw new Error(
        `restoreDocumentBursterCleanState /config/_internal folder not empty: ${unexpectedInternal.join(', ')}`,
      );
  };

  static restoreDocumentBursterCleanState = async (
    shouldDeactivateLicense: boolean,
  ) => {
    /*
    console.log(
      `PATHS.E2E_ASSEMBLY_FOLDER_PATH: ${path.resolve(
        PATHS.E2E_ASSEMBLY_FOLDER_PATH
      )}`
    );
    */

    //copy back the default datapallas.bat file
    await jetpack.copyAsync(
      PATHS.E2E_RESOURCES_PATH +
      '/java-versions/documentburster-java-default.bat',
      process.env.PORTABLE_EXECUTABLE_DIR + '/datapallas.bat',
      { overwrite: true },
    );

    if (shouldDeactivateLicense) {
      await this.deActivateLicenseKey();
    }

    // payslips-template.docx
    await jetpack.dirAsync(
      `${process.env.PORTABLE_EXECUTABLE_DIR}/templates/reports/payslips`,
      {
        empty: true,
      },
    );

    // payslips-template.docx
    await jetpack.copyAsync(
      `${process.env.PORTABLE_EXECUTABLE_DIR}/samples/reports/payslips/payslips-template.docx`,
      `${process.env.PORTABLE_EXECUTABLE_DIR}/templates/reports/payslips/payslips-template.docx`,
    );

    // payslips-template.html
    await jetpack.copyAsync(
      `${process.env.PORTABLE_EXECUTABLE_DIR}/samples/reports/payslips/payslips-template.html`,
      `${process.env.PORTABLE_EXECUTABLE_DIR}/templates/reports/payslips/payslips-template.html`,
    );

    //await this.killHangingJavaProcesses();
    // empty and refresh config
    const verifiedDbFolder = await jetpack.findAsync(
      path.resolve(PATHS.E2E_ASSEMBLY_FOLDER_PATH),
      {
        matching: 'DataPallas*',
        files: false,
        directories: true,
        recursive: false,
      },
    );

    //console.log(
    //  `restoreDocumentBursterCleanState config_path: ${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}`
    //);

    let allCleared = false;
    // Linux CI (E2E_CLEAN_STATE_ATTEMPTS, plan §4 D0): give up after that many attempts instead of
    // retrying forever; unset, the loop retries until it succeeds, as before.
    const maxCleanStateAttempts = Number(process.env.E2E_CLEAN_STATE_ATTEMPTS) || 0;
    let cleanStateAttempts = 0;
    do {
      cleanStateAttempts++;
      try {
        //console.log('restoreDocumentBursterCleanState /config folder emptying');

        await this.emptyConfigFolderKeepingIamStore(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}`,
        );

        let configFiles: string[];

        await jetpack.copyAsync(
          verifiedDbFolder[0] + '/config',
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}`,
          { overwrite: true },
        );

        configFiles = await jetpack.listAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}`,
        );

        await Helpers.setCiLicenseInstanceId(
          path.join(process.env.PORTABLE_EXECUTABLE_DIR, PATHS.CONFIG_PATH.replace(/^[/\\]+/, ''), '_internal', 'license.xml'),
        );

        if (!configFiles && configFiles.length == 0) {
          throw new Error(
            `restoreDocumentBursterCleanState /config folder should not be empty`,
          );
        }

        // empty output
        await jetpack.dirAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/output`,
          {
            empty: true,
          },
        );

        // empty backup
        await jetpack.dirAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/backup`,
          {
            empty: true,
          },
        );

        // empty quarantine
        await jetpack.dirAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.QUARANTINE_PATH}`,
          { empty: true },
        );

        // empty temp
        await jetpack.dirAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.TEMP_PATH}`,
          {
            empty: true,
          },
        );

        //try {
        // empty logs
        //await jetpack.dirAsync(
        //  `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}`,
        //  {
        //    empty: true,
        //  }
        //);
        //} catch (err) {
        //console.error('jetpack.dirAsync empty logs:', err);

        await Helpers.clearLogFiles();

        await jetpack.writeAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/rbsj-exe.log`,
          `openjdk version "17.0.14" 2025-01-21
OpenJDK Runtime Environment Temurin-17.0.14+7 (build 17.0.14+7)
OpenJDK 64-Bit Server VM Temurin-17.0.14+7 (build 17.0.14+7, mixed mode, sharing)
Started ServerApplication with PID 13404`,
        );
        //}

        allCleared = true;
        //console.log(
        //  `restoreDocumentBursterCleanState /config is now emptied, waiting ${Constants.DELAY_ONE_SECOND / 1000
        //  }  seconds ...`,
        //);

        await this.delay(Constants.DELAY_ONE_SECOND);
      } catch (err) {
        console.error('An error occurred:', err);
        allCleared = false;
        if (maxCleanStateAttempts > 0 && cleanStateAttempts >= maxCleanStateAttempts) {
          throw new Error(
            `restoreDocumentBursterCleanState gave up after ${cleanStateAttempts} attempts; last error: ${err}`,
          );
        }
        await this.delay(Constants.DELAY_ONE_SECOND);
      }
    } while (!allCleared);

    // stop Test Email Server - through DataPallas, like the Stop button on the Quality Assurance tab: it runs
    // shutTestEmailServer.bat or .sh wherever DataPallas itself runs (on the Docker server: in its container)
    try {
      await fetch('http://localhost:9090/api/system/test-email-server/stop', {
        method: 'POST',
        headers: Helpers.apiKeyHeader(),
        signal: AbortSignal.timeout(Constants.DELAY_HUNDRED_SECONDS),
      });
    } catch (err) {
      console.warn('restoreDocumentBursterCleanState: stopping the test email server failed:', err);
    }
  };

  /**
   * The installation's scripts ship twice - `<name>.bat` for Windows, `<name>.sh` for every other OS - and this
   * is the one place the tests choose between them. `scriptPath` is the path without the extension.
   */
  static installationScript(scriptPath: string): { file: string; command: string[] } {
    return process.platform === 'win32'
      ? { file: `${scriptPath}.bat`, command: ['cmd', '/c', `${scriptPath}.bat`] }
      : { file: `${scriptPath}.sh`, command: ['bash', `${scriptPath}.sh`] };
  }

  /**
   * A Chromium for pages outside the app (portals, PDF viewers): the browser E2E_CHROMIUM_EXECUTABLE names when it
   * is set (the Linux CI's Chrome for Testing), else the system Edge when there is one, else Playwright's bundled
   * Chromium - which has rendering regressions on the heavier playground pages, hence the preference.
   */
  static async launchChromium(options: Parameters<typeof chromium.launch>[0] = {}): Promise<Browser> {
    if (process.env.E2E_CHROMIUM_EXECUTABLE)
      return chromium.launch({ ...options, executablePath: process.env.E2E_CHROMIUM_EXECUTABLE });
    try {
      return await chromium.launch({ ...options, channel: 'msedge' });
    } catch {
      return chromium.launch(options);
    }
  }

  static setupConfigurationTemplate = async (
    templateName: string,
    mailMergeCapability?: string,
  ) => {
    if (mailMergeCapability) {
      await jetpack.dirAsync(
        `${process.env.PORTABLE_EXECUTABLE_DIR}/config/reports/${templateName.toLowerCase()}`,
        { empty: true },
      );

      await jetpack.copyAsync(
        `${PATHS.E2E_ASSEMBLY_FOLDER_PATH}/DataPallas/config/_defaults/settings.xml`,
        `${process.env.PORTABLE_EXECUTABLE_DIR}/config/reports/${templateName.toLowerCase()}/settings.xml`,
      );

      await jetpack.copyAsync(
        `${PATHS.E2E_ASSEMBLY_FOLDER_PATH}/DataPallas/config/_defaults/reporting.xml`,
        `${process.env.PORTABLE_EXECUTABLE_DIR}/config/reports/${templateName.toLowerCase()}/reporting.xml`,
      );

      let fileContent = await jetpack.readAsync(
        `${process.env.PORTABLE_EXECUTABLE_DIR}/config/reports/${templateName.toLowerCase()}/settings.xml`,
      );

      if (fileContent) {
        fileContent = fileContent.replace(
          /<template>[^<]*<\/template>/g,
          `<template>${templateName}</template>`,
        );

        fileContent = fileContent.replace(
          /\<reportgenerationmailmerge\>false\<\/reportgenerationmailmerge\>/g,
          `<reportgenerationmailmerge>true</reportgenerationmailmerge>`,
        );

        // Write the new content back to the file
        await jetpack.writeAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/config/reports/${templateName.toLowerCase()}/settings.xml`,
          fileContent,
        );
      }

      fileContent = await jetpack.readAsync(
        `${process.env.PORTABLE_EXECUTABLE_DIR}/config/reports/${templateName.toLowerCase()}/reporting.xml`,
      );

      if (fileContent) {
        fileContent = fileContent.replace(
          /\<outputtype\>output.none\<\/outputtype\>/g,
          `<outputtype>output.docx</outputtype>`,
        );

        fileContent = fileContent.replace(
          /\<documentpath\/\>/g,
          `<documentpath>templates/reports/payslips/payslips-template.docx</documentpath>`,
        );

        // Write the new content back to the file
        await jetpack.writeAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/config/reports/${templateName.toLowerCase()}/reporting.xml`,
          fileContent,
        );
      }
    }
  };

  static arrayEquals = (a: any[], b: any[]) => {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((val, index) => val === b[index])
    );
  };

  static arrayRemoveDuplicates = (a: any[], condition) => {
    return a.filter((e, i) => a.findIndex((e2) => condition(e, e2)) === i);
  };

  static delay = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  static generateRandomLogFiles = async () => {
    const howManyFiles = Math.floor(Math.random() * 3) + 1;

    const randomLogFiles = _.sampleSize(
      ['errors.log', 'info.log', 'warnings.log'],
      howManyFiles,
    );

    randomLogFiles.forEach(async (logFile) => {
      if (logFile.includes('errors')) {
        await jetpack.copyAsync(
          `${PATHS.E2E_RESOURCES_PATH}/logs/errors-with-data.log`,
          path.resolve(
            slash(
              `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/errors.log`,
            ),
          ),
          { overwrite: true },
        );
      }
      if (logFile.includes('info')) {
        await jetpack.copyAsync(
          `${PATHS.E2E_RESOURCES_PATH}/logs/info-with-data.log`,
          path.resolve(
            slash(
              `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
            ),
          ),
          { overwrite: true },
        );
      }
      if (logFile.includes('warnings')) {
        await jetpack.copyAsync(
          `${PATHS.E2E_RESOURCES_PATH}/logs/warnings-with-data.log`,
          path.resolve(
            slash(
              `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
            ),
          ),
          { overwrite: true },
        );
      }
    });

    return randomLogFiles;
  };

  static clearLogFiles = async () => {
    const logFiles = ['info.log', 'errors.log', 'warnings.log'];
    const logsPath = `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}`;

    await Promise.all(
      logFiles.map(file => jetpack.writeAsync(`${logsPath}/${file}`, ''))
    );
  };

  /**
   * What the app is complaining about, read from the two files its status bar reports on.
   *
   * The counterpart of clearLogFiles above, and deliberately the same way of reaching them — the installation
   * folder. Wherever a test can empty these files it can read them back: Electron, the dev chain, the shipped
   * Server in Docker, a Server on a host JVM. Nothing here asks which of those it is.
   *
   * Empty string when both files are empty, so a caller can tell "the app has nothing to say" from "the app
   * said this" and keep its own error when there is nothing to add.
   */
  static readAppLogComplaints = async (): Promise<string> => {
    const logsPath = `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}`;
    const parts: string[] = [];

    for (const file of ['errors.log', 'warnings.log']) {
      const content = ((await jetpack.readAsync(`${logsPath}/${file}`)) || '').trim();
      if (content) {
        // The first lines, not the last: the earliest complaint is usually the one that explains the rest.
        const lines = content.split('\n');
        // A Java stack trace is mostly frames, and the sentence that actually explains it is on the
        // "Caused by:" lines — which sit well below the fortieth. Keeping those few lines is the difference
        // between "a query failed" and "nothing is listening on that port".
        const causes = lines.slice(40).filter((line) => line.includes('Caused by:')).slice(0, 10);
        parts.push(`--- ${file} ---\n${lines.slice(0, 40).concat(causes).join('\n')}`);
      }
    }

    return parts.join('\n\n');
  };
}
