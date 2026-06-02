import { test } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { AppsTestHelper, VISIBLE_APPS } from '../../helpers/apps-test-helper';

test.describe('Apps Manager Tests', () => {

  // Test 1: Navigate to Processing → Data Canvas tab and start/stop the featured app
  electronBeforeAfterAllTest(
    'should start and stop Data Canvas from Processing → Data Canvas tab',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      let ft = new FluentTester(firstPage);

      ft = ft.gotoDataCanvas();

      ft = AppsTestHelper.startWaitStopWaitApp(ft, 'flowkraft-data-canvas', 'Explore Data');

      await ft;
    },
  );

  // Test 2: Navigate to Apps tab and start/stop each visible app one by one
  electronBeforeAfterAllTest(
    'should start and stop all visible apps from Help → Apps tab',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      // Navigate to Apps tab (Help → Apps / Starter Packs / Extra Utils)
      ft = ft.gotoApps();

      // For each visible app, start it, wait for running, stop it, wait for stopped
      for (const app of VISIBLE_APPS) {
        ft = AppsTestHelper.startWaitStopWaitApp(
          ft,
          app.id,
          app.name,
          Constants.DELAY_FIVE_THOUSANDS_SECONDS,
          app.launch !== false, // hasLaunchButton - false for headless apps
        );
      }

      await ft;
    },
  );

  // Test 3: Navigate to Starter Packs tab, start and stop Redis
  electronBeforeAfterAllTest(
    'should start and stop Redis from Starter Packs',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const timeout = Constants.DELAY_FIVE_THOUSANDS_SECONDS;
      const PACK_ID = 'db-redis';
      const BTN_SEL = `#btnStartStop_${PACK_ID}`;
      const ICON_SEL = `${BTN_SEL} #starterPackIcon_${PACK_ID}`;
      const SPINNER_SEL = `${BTN_SEL} #starterPackSpinner_${PACK_ID}`;

      let ft = new FluentTester(firstPage)
        .consoleLog('\n=== Redis Starter Pack: start/stop lifecycle ===\n');

      // ── Navigate to Starter Packs tab ──
      ft = ft
        .gotoStarterPacks()
        .setValue('#packSearch', 'redis')
        .sleep(400) // debounce in component is 300ms; add small buffer
        .waitOnElementToBecomeVisible(BTN_SEL)
        .consoleLog('  Navigate to Starter Packs PASSED')
        .consoleLog('  #btnStartStop_db-redis visible PASSED');

      // ── Verify initial state: stopped ──
      ft = ft
        .waitOnElementToBecomeEnabled(BTN_SEL, timeout)
        .waitOnElementToHaveText(BTN_SEL, 'Start', timeout)
        .waitOnElementToBecomeVisible(ICON_SEL, timeout)
        .consoleLog('  Redis initial state: stopped PASSED');

      // ── START ──
      ft = ft
        .click(BTN_SEL)
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .consoleLog('  Redis start requested PASSED');

      // Wait: starting (button disabled, spinner visible, text = "Starting")
      ft = ft
        .waitOnElementToBecomeDisabled(BTN_SEL, timeout)
        .waitOnElementToBecomeVisible(SPINNER_SEL, timeout)
        .waitOnElementToHaveText(BTN_SEL, 'Starting', timeout)
        .consoleLog('  Redis state: starting PASSED');

      // Wait: running (button enabled, text = "Stop", icon visible)
      ft = ft
        .waitOnElementToBecomeEnabled(BTN_SEL, timeout)
        .waitOnElementToHaveText(BTN_SEL, 'Stop', timeout)
        .waitOnElementToBecomeVisible(ICON_SEL, timeout)
        .consoleLog('  Redis state: running PASSED');

      // ── STOP ──
      ft = ft
        .click(BTN_SEL)
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .consoleLog('  Redis stop requested PASSED');

      // Wait: stopping (button disabled, spinner visible, text = "Stopping")
      ft = ft
        .waitOnElementToBecomeDisabled(BTN_SEL, timeout)
        .waitOnElementToBecomeVisible(SPINNER_SEL, timeout)
        .waitOnElementToHaveText(BTN_SEL, 'Stopping', timeout)
        .consoleLog('  Redis state: stopping PASSED');

      // Wait: stopped (button enabled, text = "Start", icon visible)
      ft = ft
        .waitOnElementToBecomeEnabled(BTN_SEL, timeout)
        .waitOnElementToHaveText(BTN_SEL, 'Start', timeout)
        .waitOnElementToBecomeVisible(ICON_SEL, timeout)
        .consoleLog('  Redis state: stopped PASSED')
        .consoleLog('\n=== Redis Starter Pack: ALL PASSED ===\n');

      await ft;
    },
  );

});
