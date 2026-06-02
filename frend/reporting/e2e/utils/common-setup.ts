import { exec } from 'child_process';
import {
  Browser,
  BrowserContext,
  ElectronApplication,
  Page,
  test as base,
} from '@playwright/test';

import { Helpers } from './helpers';
import { FluentTester } from '../helpers/fluent-tester';

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err);
  throw err;
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
  // Throw the error to get a stack trace
  throw reason;
});

const isElectron = process.env.TEST_ENV === 'electron';

// Surface renderer-side JS errors + console warnings/errors to the e2e stdout
// where they sit next to the trace. Without this, a renderer crash (signal-
// migration bug, NG0100, infinite CD, OOM) only shows as "Target page... has
// been closed" with no JS context. We mark each Page once because the Electron
// page is reused across tests and unmarked attachment would stack listeners.
function attachRendererCaptureOnce(page: Page) {
  const p = page as Page & { __rbRendererCaptureAttached?: boolean };
  if (p.__rbRendererCaptureAttached) return;
  p.__rbRendererCaptureAttached = true;

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      console.log(`[RENDERER ${t}] ${msg.text()}`);
      return;
    }
    // Surface opt-in diagnostic markers from the renderer to test stdout.
    // The source emits [RB-DIAG] lines from key paths (configuration.component
    // _initFromRouteParams, the save subscription, etc.). Without this filter,
    // type=='log' messages would be dropped and these traces invisible.
    const text = msg.text();
    if (text.startsWith('[RB-DIAG]')) {
      console.log(`[RENDERER ${t}] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[RENDERER pageerror] ${err.stack || err.message}`);
  });
  page.on('crash', () => {
    console.log('[RENDERER crash] page crashed');
  });
  page.on('close', () => {
    console.log('[RENDERER close] page closed');
  });
}

export const electronBeforeAfterAllTest = isElectron
  ? base.extend<
      {
        beforeAfterEach: Page;
        skipCleanState: boolean;
      },
      {
        beforeAfterAll: ElectronApplication;
      }
    >({
      // Opt-in switch: when `true`, the per-test restoreDocumentBursterCleanState
      // is skipped so the test inherits state from the previous one. Used by
      // shared-state describe.serial groups (e.g. algo-trading Blocks 2-5).
      skipCleanState: [false, { option: true }],

      beforeAfterAll: [
        async ({}, run) => {
          //console.log(
          //  `process.env.PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR}`,
          //);

          const electronApp = await Helpers.electronAppLaunch('../..');

          await run(electronApp);

          await Helpers.electronAppClose();
        },
        { scope: 'worker' },
      ],
      beforeAfterEach: [
        async ({ beforeAfterAll: electronApp, skipCleanState }, run) => {
          try {
            //console.log(
            //  `process.env.PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR}`,
            //);

            //const shouldDeactivateLicenseKey = true;
            const shouldDeactivateLicenseKey = false;

            //reload default "clean" configuration
            if (!skipCleanState) {
              await Helpers.restoreDocumentBursterCleanState(
                shouldDeactivateLicenseKey,
              );
            }

            const firstPage = await electronApp.firstWindow();

            //await firstPage.reload();

            attachRendererCaptureOnce(firstPage);

            const ft = new FluentTester(firstPage);

            await ft.gotoStartScreen();
            await run(firstPage);
          } catch (error) {
            // Rethrow the error to fail the test
            throw error;
          }
          //await Helpers.killHangingJavaProcesses();
        },
        { scope: 'test' },
      ],
    })
  : base.extend<
      {
        beforeAfterEach: Page;
        skipCleanState: boolean;
      },
      {
        beforeAfterAll: { browser: Browser; context: BrowserContext };
      }
    >({
      skipCleanState: [false, { option: true }],
      beforeAfterAll: [
        async ({}, run) => {
          const { browser, context } = await Helpers.browserLaunch();

          await run({ browser, context });

          await Helpers.browserClose();
        },
        { scope: 'worker' },
      ],
      beforeAfterEach: [
        async ({ beforeAfterAll: { browser, context }, skipCleanState }, run) => {
          const shouldDeactivateLicenseKey = false;

          if (!skipCleanState) {
            await Helpers.restoreDocumentBursterCleanState(
              shouldDeactivateLicenseKey,
            );
          }

          const [firstPage] = context.pages();

          attachRendererCaptureOnce(firstPage);

          const ft = new FluentTester(firstPage);

          await ft.gotoStartScreen();
          await run(firstPage);
        },
        { scope: 'test' },
      ],
    });

function findLockingProcess(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      `wmic process where "CommandLine Like '%${filePath}%'" get Commandline, ProcessId`,
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else if (stderr) {
          reject(new Error(stderr));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}
