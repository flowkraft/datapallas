import * as jetpack from 'fs-jetpack';
import * as path from 'path';

import { spawnSync } from 'child_process';

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

    spawnSync('datapallas.bat', ['system', 'license', 'deactivate'], {
      cwd: path.join(process.env.PORTABLE_EXECUTABLE_DIR),
      shell: true,
    });
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

  static async browserLaunch(): Promise<{
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

    const browser = this.currentBrowser;
    const context = this.currentBrowserContext;

    return { browser, context };
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
    do {
      try {
        //console.log('restoreDocumentBursterCleanState /config folder emptying');

        await jetpack.dirAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}`,
          { empty: true },
        );

        let configFiles = await jetpack.listAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}`,
        );

        if (configFiles && configFiles.length > 0) {
          throw new Error(
            `restoreDocumentBursterCleanState /config folder not empty`,
          );
        }

        await jetpack.copyAsync(
          verifiedDbFolder[0] + '/config',
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}`,
          { overwrite: true },
        );

        configFiles = await jetpack.listAsync(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}`,
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
        await this.delay(Constants.DELAY_ONE_SECOND);
      }
    } while (!allCleared);

    // stop Test Email Server
    spawnSync('shutTestEmailServer.bat', ['/c'], {
      cwd: path.resolve(
        process.env.PORTABLE_EXECUTABLE_DIR + '/tools/test-email-server',
      ),
      shell: true,
    });
  };

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
}
