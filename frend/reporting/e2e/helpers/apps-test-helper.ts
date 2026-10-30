import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { FluentTester } from './fluent-tester';
import { Constants } from '../utils/constants';
import { Helpers } from '../utils/helpers';
import * as PATHS from '../utils/paths';

const slash = require('slash');

// List of visible apps in TOP-TO-BOTTOM UI order (must match apps-manager.service.ts)
// Apps with launch: false have no Launch button (headless/API-only apps)
// 'name' is a minimal unique substring for resilience to minor UI text changes
export const VISIBLE_APPS = [
  { id: 'flowkraft-data-canvas', name: 'Explore Data' },
  { id: 'flowkraft-grails', name: 'Grails App' },
  { id: 'flowkraft-bkend-boot-groovy', name: 'Backend App', launch: false },
  { id: 'flowkraft-next', name: 'Next.js App' },
  { id: 'cms-webportal', name: 'WebPortal' },
  { id: 'cloudbeaver', name: 'CloudBeaver' },
  { id: 'rundeck', name: 'Rundeck' },
  { id: 'matomo', name: 'Matomo' },
  { id: 'docuseal', name: 'Docuseal' },
  { id: 'metabase', name: 'Metabase' },
];

// Sanitizes app id the same way as the component does (removes spaces only)
function sanitizeAppId(id: string): string {
  return (id || '').replace(/\s/g, '');
}

export class AppsTestHelper {

  /**
   * Stop a running app and wait for it to reach 'stopped' state.
   *
   * State detection uses only #appState_* element (reliable across all state transitions).
   * Playwright's built-in click actionability handles button enabled/visible checks.
   *
   * @param ft FluentTester instance
   * @param appId The app id (e.g., 'cms-webportal', 'cloudbeaver')
   * @param timeout Timeout for waiting on state changes
   */
  static stopApp(
    ft: FluentTester,
    appId: string,
    timeout: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
  ): FluentTester {
    const sanitizedId = sanitizeAppId(appId);
    const btnSel = `#btnStartStop_${sanitizedId}`;
    const stateSel = `#appState_${sanitizedId}`;
    let servicesLogOffset = 0;

    ft = ft
      .scrollIntoViewIfNeeded(btnSel)
      .consoleLog(`Stopping app '${appId}'...`);
    // The stop's own lines in services.log are the ones written past this point.
    ft.actions.push(async () => {
      servicesLogOffset = AppsTestHelper.servicesLogSize();
    });
    ft = ft
      .click(btnSel)
      .confirmDialogShouldBeVisible()
      .clickYesDoThis();

    // No intermediate "stopping" wait. The backend's state polling can miss the
    // transient "stopping" window entirely when Docker shutdown is fast (~2s) —
    // the state field updates running → stopped directly. Asserting "stopping"
    // here then hangs the test for the full `timeout` (5000s) waiting for a
    // string that never appears. Only the final "stopped" state is observable
    // reliably and is what actually proves the app stopped.
    ft.actions.push(() =>
      AppsTestHelper.waitUntilStopped(ft.window, appId, btnSel, stateSel, timeout),
    );
    ft.actions.push(() => AppsTestHelper.waitUntilComposeDown(appId, servicesLogOffset));

    return ft.consoleLog(`App '${appId}' is stopped.`);
  }

  /** The one file ServicesManager logs to (log4j2.xml's services-out). */
  private static servicesLogPath(): string {
    return path.resolve(slash(`${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/services.log`));
  }

  /** services.log's size in bytes, 0 while it does not exist yet. */
  private static servicesLogSize(): number {
    const file = AppsTestHelper.servicesLogPath();
    return fs.existsSync(file) ? fs.statSync(file).size : 0;
  }

  /** The lines services.log holds past `offset`; from its start when it is shorter (it rolled over). */
  private static servicesLogLinesFrom(offset: number): string[] {
    const file = AppsTestHelper.servicesLogPath();
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file);
    return content.subarray(content.length < offset ? 0 : offset).toString('utf8').split(/\r?\n/);
  }

  /**
   * Wait until the stop has really finished: 'stopped' on the screen can come before `docker compose
   * down` has returned, and the next test would then start on a half-stopped stack. ServicesManager's
   * doAppStop logs `handleAppStop: composePath=…` first and, once `docker compose down` has returned,
   * `Command exit code: N` as its last line. The anchor matters: another command logs the same
   * exit-code line. A non-zero N fails with that line and the "Failed to stop app …" after it. The
   * bound is that command's own timeout (ProcessExecutor, 300 s).
   */
  private static async waitUntilComposeDown(appId: string, offset: number): Promise<void> {
    const exitCode = /Command exit code: (-?\d+)/;
    const deadline = Date.now() + 300_000;
    let lines: string[] = [];

    while (Date.now() < deadline) {
      lines = AppsTestHelper.servicesLogLinesFrom(offset);
      const start = lines.findIndex((line) => line.includes('handleAppStop: composePath='));
      const exit = start < 0 ? -1 : lines.findIndex((line, i) => i > start && exitCode.test(line));
      if (exit >= 0) {
        if (lines[exit].match(exitCode)![1] === '0') return;
        // The ERROR follows the exit code; give it a moment to be written.
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        lines = AppsTestHelper.servicesLogLinesFrom(offset);
        const failed = lines.slice(exit + 1).find((line) => line.includes('Failed to stop app'));
        throw new Error(`stopApp: app '${appId}' did not stop: ${lines[exit]}${failed ? ` | ${failed}` : ''}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    const lastLine = lines.filter((line) => line.length > 0).pop() ?? '(nothing written)';
    throw new Error(
      `stopApp: app '${appId}': no 'Command exit code' after 'handleAppStop' in ${AppsTestHelper.servicesLogPath()} within 300 s; last line read: ${lastLine}`,
    );
  }

  /**
   * Wait for the app to reach 'stopped' - and survive a session that lapsed while the spec ran.
   *
   * A spec that runs for more than half an hour can outlive a DataPallas Server's idle session: the
   * Apps screen makes no calls of its own while it sits there, so nothing keeps the session warm.
   * The window still shows the signed-in application - the state element still reads 'running' -
   * until something calls the backend. The stop command then answers 401, the app goes to its Sign
   * In screen, 'stopped' never arrives, and the wait burns its whole timeout in front of a login
   * form. (F2 Linux CI, 2026-09-20: explore-data-use-cases spent 15 minutes exactly there, in its
   * afterAll, after the 22 tests before it had driven only the external browser for over an hour.)
   * Signing in and stopping the app again is what the person in front of the screen would do.
   *
   * An installation that shows no login form - every Desktop run, Electron and the dev chain - never
   * reaches the second half: the loop sees 'stopped' and returns, exactly as it always did.
   */
  private static async waitUntilStopped(
    page: Page,
    appId: string,
    btnSel: string,
    stateSel: string,
    timeout: number,
  ): Promise<void> {
    // One apps manager shows an app at a time (each area mounts its own, for its own apps), so
    // the state id names one element.
    // A short timeout: with none, one read blocked for 300 s (M105's teardown, run A).
    const isStopped = async (): Promise<boolean> =>
      ((await page.locator(stateSel).textContent({ timeout: 5_000 }).catch(() => '')) || '')
        .toLowerCase()
        .includes('stopped');

    const waitMs = Constants.capWait(timeout);
    const deadline = Date.now() + waitMs;
    let askedToSignIn = false;

    while (Date.now() < deadline) {
      if (await isStopped()) return;
      askedToSignIn = await page
        .locator('#loginUsername')
        .first()
        .isVisible()
        .catch(() => false);
      if (askedToSignIn) break;
      await page.waitForTimeout(1_000);
    }

    if (!askedToSignIn)
      throw new Error(`stopApp: app '${appId}' did not reach 'stopped' within ${waitMs} ms`);

    console.log(
      `[stopApp] app '${appId}': the server is asking for a sign-in - the session lapsed while the spec ran; signing in and stopping the app again`,
    );
    await Helpers.signInIfLoginFormIsShown(page);
    await new FluentTester(page).gotoApps();

    if (await isStopped()) {
      console.log(`[stopApp] app '${appId}' is already stopped - the command had gone through`);
      return;
    }

    await new FluentTester(page)
      .scrollIntoViewIfNeeded(btnSel)
      .click(btnSel)
      .confirmDialogShouldBeVisible()
      .clickYesDoThis()
      .waitOnElementToContainText(stateSel, 'stopped', timeout);
  }

  /**
   * Start an app, wait for it to be running, then stop it and wait for it to be stopped.
   * Works with the expandedList mode of apps-manager component.
   *
   * State detection uses only #appState_* element (reliable across all state transitions).
   * Playwright's built-in click actionability handles button enabled/visible checks.
   *
   * @param ft FluentTester instance
   * @param appId The app id (e.g., 'cms-webportal', 'cloudbeaver')
   * @param appName The display name of the app (for confirm dialog text matching)
   * @param timeout Timeout for waiting on state changes
   * @param hasLaunchButton Whether the app has a Launch button (default: true). Set to false for headless/API-only apps.
   */
  static startWaitStopWaitApp(
    ft: FluentTester,
    appId: string,
    appName: string,
    timeout: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
    hasLaunchButton: boolean = true,
  ): FluentTester {
    const sanitizedId = sanitizeAppId(appId);
    const btnSel = `#btnStartStop_${sanitizedId}`;
    const stateSel = `#appState_${sanitizedId}`;
    const startLines: ServicesLogMark = { offset: 0 };

    // --- START THE APP ---
    ft = ft
      .scrollIntoViewIfNeeded(btnSel)
      .consoleLog(`Starting app '${appName}' (${appId})...`)
      .waitOnElementToContainText(stateSel, 'stopped', timeout);
    ft = AppsTestHelper.markServicesLog(ft, startLines)
      .click(btnSel)
      .confirmDialogShouldBeVisible()
      .waitOnElementToContainText('#confirmDialog .modal-box', appName)
      .clickYesDoThis();

    // Wait for starting state
    ft = ft
      .waitOnElementToContainText(stateSel, 'starting', timeout)
      .consoleLog(`App '${appName}' is starting...`);

    // Wait for running state; a start the page shows failed ends it at once
    ft = AppsTestHelper.waitUntilRunningUnlessItsStartFailed(ft, appId, startLines, timeout)
      .waitOnElementToContainText(stateSel, 'running', timeout)
      .consoleLog(`App '${appName}' is running.`);

    // --- STOP THE APP ---
    ft = AppsTestHelper.stopApp(ft, appId, timeout);

    return ft;
  }

  /**
   * Takes `mark` at services.log's end when the chain gets there: put it just before an app's Start is clicked,
   * so waitUntilRunningUnlessItsStartFailed reads that start's own lines and no older ones.
   */
  static markServicesLog(ft: FluentTester, mark: ServicesLogMark): FluentTester {
    ft.actions.push(async () => {
      mark.offset = AppsTestHelper.servicesLogSize();
    });
    return ft;
  }

  /**
   * Wait for an app whose Start was just clicked to show 'running' - and end as soon as the page shows that the
   * start failed, with the server's reason in the error.
   *
   * The card alone never shows it. The server answers a start with "pending" and runs `docker compose up` by itself
   * (StarterPacksManagementService), so when compose fails the card stays on 'starting': the page holds a start in
   * flight (docker-lifecycle.service.ts resolveNextStatus) until its polling gives up, after 3 h. What the page does
   * show is the server's verdict: ServicesManager logs "Failed to start app" to errors.log and the status bar turns
   * into #btnErrors (status-bar.template.html). Chain a's AI Hub (3f5c21f0, 2026-10-25) showed it 6 min after Start
   * and its wait went on for 40 min more; chain b's (889001e6) spent 67 + 62 min there. A start the server refuses at
   * once marks the card instead: 'border-error' on #appPanel_<id> (isAppError, apps-manager.template.html).
   *
   * A red bar could also be another request's error, so the start's own lines decide, read past `startLines` as
   * waitUntilComposeDown reads a stop: 'handleAppStart: composePath=' and then a non-zero 'Command exit code: N'.
   * A red bar with no failed start there keeps the wait going.
   */
  static waitUntilRunningUnlessItsStartFailed(
    ft: FluentTester,
    appId: string,
    startLines: ServicesLogMark,
    timeout: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
  ): FluentTester {
    const sanitizedId = sanitizeAppId(appId);
    const stateSel = `#appState_${sanitizedId}`;
    const panelSel = `#appPanel_${sanitizedId}`;

    ft.actions.push(async () => {
      const page = ft.window;
      // A short timeout on each read, as waitUntilStopped's: with none, one read can block for 300 s.
      const textNow = async (sel: string): Promise<string> =>
        ((await page.locator(sel).first().textContent({ timeout: 5_000 }).catch(() => '')) || '').trim();
      const shown = async (sel: string): Promise<boolean> =>
        (await page.locator(sel).count().catch(() => 0)) > 0;
      const waitMs = Constants.capWait(timeout);
      const deadline = Date.now() + waitMs;
      let state = '';

      while (Date.now() < deadline) {
        state = (await textNow(stateSel)).toLowerCase();
        if (state.includes('running')) return;
        const cardMarkedError = await shown(`${panelSel}.border-error`);
        if (cardMarkedError || (await shown('#btnErrors'))) {
          const serverSays = AppsTestHelper.failedStartIn(AppsTestHelper.servicesLogLinesFrom(startLines.offset));
          if (cardMarkedError || serverSays) {
            const cardOutput = cardMarkedError ? await textNow(`${panelSel} pre`) : '';
            throw new Error(
              `startApp: app '${appId}' did not start, and the page shows it: ` +
                (cardMarkedError
                  ? `its card is marked as an error${cardOutput ? ` (${cardOutput})` : ''}`
                  : `the status bar's 'View Error(s)' while the card still says '${state}'`) +
                `. The server: ${serverSays || `no failed start in ${AppsTestHelper.servicesLogPath()} past the mark`}`,
            );
          }
        }
        await page.waitForTimeout(2_000);
      }

      throw new Error(`startApp: app '${appId}' did not reach 'running' within ${waitMs} ms; its card says '${state}'`);
    });
    return ft;
  }

  /**
   * The failed start in `lines` (services.log past a mark) as the server wrote it: docker's last lines before the
   * exit code (its own reason, e.g. "dependency failed to start: container ... is unhealthy"), the exit code and the
   * "Failed to start app" after it. Empty when no start failed there.
   */
  private static failedStartIn(lines: string[]): string {
    const exitCode = /Command exit code: (-?\d+)/;
    const start = lines.findIndex((line) => line.includes('handleAppStart: composePath='));
    const exit = start < 0 ? -1 : lines.findIndex((line, i) => i > start && exitCode.test(line));
    if (exit < 0 || lines[exit].match(exitCode)![1] === '0') return '';
    const dockerSays = lines.slice(start + 1, exit).filter((line) => line.trim()).slice(-5);
    const failed = lines.slice(exit + 1).find((line) => line.includes('Failed to start app'));
    return [...dockerSays, lines[exit], ...(failed ? [failed] : [])].join(' | ');
  }

}

/** A place in services.log (its size in bytes then), taken by AppsTestHelper.markServicesLog. */
export type ServicesLogMark = { offset: number };
