import { FluentTester } from './fluent-tester';
import { Constants } from '../utils/constants';

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

    ft = ft
      .scrollIntoViewIfNeeded(btnSel)
      .consoleLog(`Stopping app '${appId}'...`)
      .click(btnSel)
      .confirmDialogShouldBeVisible()
      .clickYesDoThis();

    // No intermediate "stopping" wait. The backend's state polling can miss the
    // transient "stopping" window entirely when Docker shutdown is fast (~2s) —
    // the state field updates running → stopped directly. Asserting "stopping"
    // here then hangs the test for the full `timeout` (5000s) waiting for a
    // string that never appears. Only the final "stopped" state is observable
    // reliably and is what actually proves the app stopped.
    ft = ft
      .waitOnElementToContainText(stateSel, 'stopped', timeout)
      .consoleLog(`App '${appId}' is stopped.`);

    return ft;
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

    // --- START THE APP ---
    ft = ft
      .scrollIntoViewIfNeeded(btnSel)
      .consoleLog(`Starting app '${appName}' (${appId})...`)
      .waitOnElementToContainText(stateSel, 'stopped', timeout)
      .click(btnSel)
      .confirmDialogShouldBeVisible()
      .waitOnElementToContainText('#confirmDialog .modal-box', appName)
      .clickYesDoThis();

    // Wait for starting state
    ft = ft
      .waitOnElementToContainText(stateSel, 'starting', timeout)
      .consoleLog(`App '${appName}' is starting...`);

    // Wait for running state
    ft = ft
      .waitOnElementToContainText(stateSel, 'running', timeout)
      .consoleLog(`App '${appName}' is running.`);

    // --- STOP THE APP ---
    ft = AppsTestHelper.stopApp(ft, appId, timeout);

    return ft;
  }

}
