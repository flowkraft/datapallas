import { test } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';

// ============================================================
// DUAL PLAYGROUND TESTS
// One test per app: start once, run all sub-tests, stop once.
// ============================================================

// Set to true to run ALL tests (T11/T12/T13) on BOTH apps.
// When false (default), uses daily rotation to alternate assignments.
const RUN_ALL_TESTS = true;

// Daily seed for randomizing CRUD/settings assignment across apps.
// Over 2 consecutive runs, ALL app+capability combinations are covered.
const today = process.env.E2E_ROTATION_DATE || new Date().toISOString().split('T')[0];
const dailySeed = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);
const isEvenDay = dailySeed % 2 === 0;

// Cross-assignment: invoices+settings on one app, payslips on the other
const invoiceApp = isEvenDay ? 'grails' : 'nextjs';
const payslipApp = isEvenDay ? 'nextjs' : 'grails';
const settingsApp = invoiceApp;

console.log(`Daily seed: ${dailySeed} (${isEvenDay ? 'even' : 'odd'}) — Invoice CRUD→${invoiceApp}, Payslip CRUD→${payslipApp}, Settings→${settingsApp}`);

const PLAYGROUND_APPS = [
  {
    appId: SelfServicePortalsTestHelper.APP_ID_GRAILS,
    appName: 'grails' as const,
    name: 'Grails',
  },
  {
    appId: SelfServicePortalsTestHelper.APP_ID_NEXT,
    appName: 'nextjs' as const,
    name: 'Next.js',
  },
];

test.describe('Dual Playground Tests', () => {

  for (const app of PLAYGROUND_APPS) {
    electronBeforeAfterAllTest(
      `${app.name} Playground: Full test suite (front-facing + admin)`,
      async ({ beforeAfterEach: firstPage }) => {
        test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

        let externalBrowser = null;

        try {
          // Start the playground app
          await SelfServicePortalsTestHelper.startApp(
            new FluentTester(firstPage).gotoApps(),
            app.appId,
          );

          // Open external browser
          const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
          externalBrowser = browser;

          const baseUrl = app.appName === 'grails'
            ? SelfServicePortalsTestHelper.GRAILS_BASE_URL
            : SelfServicePortalsTestHelper.NEXT_BASE_URL;

          await SelfServicePortalsTestHelper.waitForServerReady(page, baseUrl);

          // ============================================================
          // FRONT-FACING AREA — navbar pages (follows navbar order)
          // Covers: Home, Parameters, Reports, Data Warehouse,
          //         Dashboards (smoke), Your Canvas
          // Note: Tabulator, Charts, Pivot Tables tested in dedicated
          //       spec files (not here).
          // ============================================================

          // ============================================================
          // T08: Front-facing all-pages smoke test
          // ============================================================
          console.log(`\n=== [${app.name}] T08: Front-facing all-pages smoke test ===\n`);
          await SelfServicePortalsTestHelper.assertAllFrontFacingPages(page, app.appName);
          console.log(`[${app.name}] T08: All front-facing pages passed.`);

          // ============================================================
          // ADMIN AREA — /admin tests
          // ============================================================

          // ============================================================
          // T10: Admin dashboard stats verification
          // ============================================================
          console.log(`\n=== [${app.name}] T10: Admin dashboard stats ===\n`);
          await SelfServicePortalsTestHelper.assertAdminDashboard(page, app.appName);
          console.log(`[${app.name}] T10: Admin dashboard stats passed.`);

          // ============================================================
          // T11: Payslip CRUD lifecycle (randomized — one app per day)
          // ============================================================
          if (RUN_ALL_TESTS || payslipApp === app.appName) {
            console.log(`\n=== [${app.name}] T11: Payslip CRUD lifecycle ===\n`);
            await SelfServicePortalsTestHelper.performPayslipCRUD(page, app.appName);
            console.log(`[${app.name}] T11: Payslip CRUD passed.`);
          } else {
            console.log(`[${app.name}] T11: Payslip CRUD — skipped (assigned to ${payslipApp} today)`);
          }

          // ============================================================
          // T12: Invoice CRUD lifecycle (randomized — one app per day)
          // ============================================================
          if (RUN_ALL_TESTS || invoiceApp === app.appName) {
            console.log(`\n=== [${app.name}] T12: Invoice CRUD lifecycle ===\n`);
            await SelfServicePortalsTestHelper.performInvoiceCRUD(page, app.appName);
            console.log(`[${app.name}] T12: Invoice CRUD passed.`);
          } else {
            console.log(`[${app.name}] T12: Invoice CRUD — skipped (assigned to ${invoiceApp} today)`);
          }

          // ============================================================
          // T13: Admin settings persistence (randomized — one app per day)
          // ============================================================
          if (RUN_ALL_TESTS || settingsApp === app.appName) {
            console.log(`\n=== [${app.name}] T13: Admin settings persistence ===\n`);
            await SelfServicePortalsTestHelper.assertSettingsPersistence(page, app.appName);
            console.log(`[${app.name}] T13: Admin settings persistence passed.`);
          } else {
            console.log(`[${app.name}] T13: Settings persistence — skipped (assigned to ${settingsApp} today)`);
          }

          console.log(`\n=== [${app.name}] All dual-playground sub-tests passed ===\n`);

        } finally {
          // Close external browser
          if (externalBrowser) {
            try {
              await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
            } catch (e) {
              console.error('Failed to close external browser:', e);
            }
          }
          // Stop the playground app
          try {
            await SelfServicePortalsTestHelper.stopApp(
              new FluentTester(firstPage).gotoApps(),
              app.appId,
            );
          } catch (e) {
            console.error(`Failed to stop ${app.name} app:`, e);
          }
        }
      },
    );
  }

});
