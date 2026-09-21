import { exec, spawnSync } from 'child_process';
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

/**
 * Fails the test IMMEDIATELY, and with the real reason, when the DataPallas Server container this run
 * tests against is no longer there.
 *
 * Without it, a server that goes away mid-run turns every remaining test into ERR_CONNECTION_REFUSED
 * and "fetch failed" after its own full timeout: F2 run 1 (2026-09-17) spent its last 44 minutes that
 * way and reported 211 failures that said nothing about the one thing that had happened. A container
 * that has gone is not a test failure to be analysed one by one - it is the environment, and every
 * result after it is noise.
 *
 * Only runs on the DataPallas Server target (E2E_DOCKER_SERVER names the container, set by
 * asbl/ci/dp-ci.sh). On Desktop / Electron, and on a plain web run, it is a no-op.
 */
function assertDockerServerStillRunning(): void {
  const container = process.env.E2E_DOCKER_SERVER;
  if (!container) return;

  const state = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', container], {
    encoding: 'utf-8',
    timeout: 30_000,
  });
  if (state.status === 0 && (state.stdout || '').trim() === 'true') return;

  throw new Error(
    `DATAPALLAS SERVER GONE: the container '${container}' this run tests against is not running ` +
      `(docker inspect: ${((state.stdout || '') + (state.stderr || '')).trim() || state.error}). ` +
      `Everything from here on would fail with ERR_CONNECTION_REFUSED for reasons that have nothing ` +
      `to do with the tests - find what stopped the container, not what this test was doing.`,
  );
}

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

            // Use the LIVE app, not the captured fixture value. A test may have
            // closed+relaunched the singleton (e.g. the screenshot prereq states
            // reboot per Java/Choco combination), which makes `electronApp` stale.
            // Helpers.currentElectronApp always points at the running app; fall
            // back to the fixture value when nothing relaunched (the common case,
            // where they are the same object → identical behaviour).
            const firstPage = await (
              Helpers.currentElectronApp ?? electronApp
            ).firstWindow();

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
          // No sign-in here: beforeAfterEach signs in after the clean state is restored (see browserLaunch).
          const { browser, context } = await Helpers.browserLaunch({ signIn: false });

          await run({ browser, context });

          await Helpers.browserClose();
        },
        { scope: 'worker' },
      ],
      beforeAfterEach: [
        async ({ beforeAfterAll: { browser, context }, skipCleanState }, run) => {
          // Before anything else - restoreDocumentBursterCleanState included, it talks to the server
          // too: is the server this run tests against still there? No-op off the DataPallas Server
          // target. A container that has gone must read as exactly that, once, not as N timeouts.
          assertDockerServerStillRunning();

          const shouldDeactivateLicenseKey = false;

          if (!skipCleanState) {
            await Helpers.restoreDocumentBursterCleanState(
              shouldDeactivateLicenseKey,
            );
          }

          const [firstPage] = context.pages();

          attachRendererCaptureOnce(firstPage);

          const ft = new FluentTester(firstPage);

          // Cheap check: on a DataPallas Server the session can be gone again (a restarted container, a long
          // run), and on Desktop there is no login form at all — then this does nothing.
          await ft.signInIfLoginFormIsShown().gotoStartScreen();
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
