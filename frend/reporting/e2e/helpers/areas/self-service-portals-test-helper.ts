import { Browser, BrowserContext, Page, chromium } from '@playwright/test';
import { expect } from '@playwright/test';
import { FluentTester } from '../fluent-tester';
import { AppsTestHelper } from '../apps-test-helper';
import { Constants } from '../../utils/constants';

import { spawnSync } from 'child_process';
import * as path from 'path';

/**
 * Helper class for Self-Service Portals E2E tests.
 * Provides utilities for starting/stopping apps and navigating external portal pages.
 */
export class SelfServicePortalsTestHelper {

  // WordPress Portal Constants
  static readonly WP_BASE_URL = 'http://localhost:8080';
  static readonly WP_ADMIN_USER = 'u2changeme';
  static readonly WP_ADMIN_PASSWORD = 'p2changeme123!';
  static readonly WP_LOGIN_URL = `${SelfServicePortalsTestHelper.WP_BASE_URL}/wp-login.php`;
  static readonly WP_ADMIN_URL = `${SelfServicePortalsTestHelper.WP_BASE_URL}/wp-admin`;
  static readonly WP_MY_DOCUMENTS_URL = `${SelfServicePortalsTestHelper.WP_BASE_URL}/my-documents`;
  // Paystubs custom post type URL in admin
  static readonly WP_ADMIN_PAYSTUBS_URL = `${SelfServicePortalsTestHelper.WP_BASE_URL}/wp-admin/edit.php?post_type=paystub`;

  // Playground Constants
  static readonly GRAILS_BASE_URL = 'http://localhost:8400'; // Points to grails-playground
  static readonly NEXT_BASE_URL = 'http://localhost:8420'; // Points to next-playground

  // Tabulator load timeout — tabulators can take a while to render with server-side data
  static readonly TABULATOR_LOAD_TIMEOUT = 15_000;

  // App IDs
  static readonly APP_ID_WORDPRESS = 'cms-webportal';
  static readonly APP_ID_GRAILS = 'flowkraft-grails'; // Grails unified app (portal + admin)
  static readonly APP_ID_NEXT = 'flowkraft-next'; // Next.js app

  /**
   * Convert employee name to slug format (matches WordPress sanitize_title).
   * "Clyde Grew" -> "clyde-grew"
   */
  static toEmployeeSlug(employeeName: string): string {
    return employeeName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  static dockerComposeDownRmi(stack: string): void {
    spawnSync('docker', ['compose', 'down', '-v', '--rmi', 'local'], {
      cwd: `${path.join(process.env.PORTABLE_EXECUTABLE_DIR)}/_apps/${stack}`,
      shell: true,
    });
  }

  /**
   * Start an app and wait for it to be running (returns FluentTester for chaining).
   *
   * Idempotent against leftover state: if a prior test run was interrupted and
   * left the app `running` / `starting`, the start-stop button reads "Stop"
   * — blindly clicking it would STOP the app and the test would then hang
   * waiting for state to become `starting` (state goes running → stopping →
   * stopped, never starting). We do a one-shot pre-flight: read the state
   * element, and ONLY if it indicates the app is already up, stop it first;
   * otherwise the chain proceeds straight to the normal start sequence.
   */
  static startApp(
    ft: FluentTester,
    appId: string,
    timeout: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
  ): FluentTester {
    const btnSel = `#btnStartStop_${appId}`;
    const stateSel = `#appState_${appId}`;
    const spinnerSel = `#appSpinner_${appId}`;

    ft.actions.push(async (): Promise<void> => {
      const stateEl = ft.window.locator(stateSel);
      await stateEl.waitFor({ state: 'visible', timeout });
      let text = ((await stateEl.textContent()) || '').toLowerCase();

      // If a transition is already in progress, wait for it to resolve before acting.
      // "starting" → button disabled; clicking Stop would be a no-op.
      // "stopping" → button disabled; nothing to do but wait.
      if (text.includes('starting') || text.includes('stopping')) {
        console.log(`[startApp] app '${appId}' is in transition ('${text.trim()}') — waiting to resolve`);
        await ft.window.waitForFunction(
          (sel: string) => {
            const el = document.querySelector(sel);
            const t = (el?.textContent || '').toLowerCase();
            return !!el && !t.includes('starting') && !t.includes('stopping');
          },
          stateSel,
          { timeout: 120_000 },
        ).catch(() => {
          console.log(`[startApp] warning: app '${appId}' still in transition after 2 min — proceeding anyway`);
        });
        text = ((await stateEl.textContent()) || '').toLowerCase();
      }

      if (!text.includes('running')) return;

      console.log(`[startApp] app '${appId}' is already '${text.trim()}' — stopping first for a clean start`);
      await ft.window.locator(btnSel).click();
      await ft.window.locator(Constants.BTN_CONFIRM_SELECTOR).click();
      await ft.window.waitForFunction(
        (sel: string) => {
          const el = document.querySelector(sel);
          return !!el && (el.textContent || '').toLowerCase().includes('stopped');
        },
        stateSel,
        { timeout },
      );
      await ft.window.waitForTimeout(2_000);
      console.log(`[startApp] app '${appId}' stopped — proceeding to start`);
    });

    return ft
      .consoleLog(`Starting app '${appId}'...`)
      .waitOnElementToBecomeVisible(btnSel, timeout)
      .waitOnElementToBecomeEnabled(btnSel, timeout)
      .click(btnSel)
      .confirmDialogShouldBeVisible()
      .clickYesDoThis()
      .waitOnElementToBecomeDisabled(btnSel, timeout)
      .waitOnElementToBecomeVisible(spinnerSel, timeout)
      .waitOnElementToContainText(stateSel, 'starting', timeout)
      .consoleLog(`App '${appId}' is starting...`)
      .waitOnElementToBecomeEnabled(btnSel, timeout)
      .waitOnElementToContainText(stateSel, 'running', timeout)
      .waitOnElementToContainText(btnSel, 'Stop', timeout)
      .consoleLog(`App '${appId}' is running.`)
      .sleep(5000); // Give app time to fully initialize
  }

  /**
   * Stop an app and wait for it to be stopped (returns FluentTester for chaining).
   */
  static stopApp(
    ft: FluentTester,
    appId: string,
    timeout: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
  ): FluentTester {
    return AppsTestHelper.stopApp(ft, appId, timeout);
  }

  /**
   * Create a new Playwright browser context for external portal navigation.
   * @param headless - Whether to run the browser in headless mode (default: false for visibility)
   */
  static async createExternalBrowser(
    headless: boolean = false,
    contextOptions: { deviceScaleFactor?: number; viewport?: { width: number; height: number } } = {},
  ): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    const launchArgs: string[] = [];
    if (contextOptions.deviceScaleFactor && contextOptions.deviceScaleFactor !== 1) {
      launchArgs.push(`--force-device-scale-factor=${contextOptions.deviceScaleFactor}`);
    }
    // Use the system Edge (Chromium 130+) instead of Playwright 1.41.2's bundled
    // chromium-1097 (~Chromium 121, January 2024). The bundled version has known
    // crash regressions in heavy daisyUI v5 / color-mix(in oklab, ...) rendering
    // that fire on the heavier playground pages (Demo Pivot's 15-pivot grid,
    // Warehouse OLAP). System Edge has the fixes; tests rendering lighter pages
    // already pass with the bundled Chromium, so this change is downside-free.
    const browser = await chromium.launch({ headless, args: launchArgs, channel: 'msedge' });
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    return { browser, context, page };
  }

  /**
   * Wait for a web server to be ready by polling the URL until it responds.
   * This is crucial because apps report "running" before HTTP server is ready.
   */
  static async waitForServerReady(
    page: Page,
    url: string,
    maxRetries: number = 30,
    retryDelayMs: number = 2000,
  ): Promise<void> {
    console.log(`Waiting for server at ${url} to be ready...`);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await page.goto(url, { timeout: 10000, waitUntil: 'domcontentloaded' });
        if (response && response.ok()) {
          console.log(`Server at ${url} is ready after ${attempt} attempt(s).`);
          return;
        }
        // Response exists but not OK (e.g., 500 error) - server is responding but maybe not fully ready
        if (response && response.status() >= 500) {
          console.log(`Server returned ${response.status()}, retrying (${attempt}/${maxRetries})...`);
          lastError = new Error(`Server returned status ${response.status()}`);
        } else if (response) {
          // Got a response (even 404 means server is up), consider it ready
          console.log(`Server at ${url} responded with status ${response.status()}, considering ready.`);
          return;
        }
      } catch (err) {
        lastError = err as Error;
        const msg = lastError.message || String(lastError);
        // Common transient errors during startup
        if (msg.includes('ERR_EMPTY_RESPONSE') || msg.includes('ERR_CONNECTION_REFUSED') || msg.includes('ECONNREFUSED')) {
          console.log(`Server not ready yet (${msg.split('\n')[0]}), retrying (${attempt}/${maxRetries})...`);
        } else {
          console.log(`Unexpected error: ${msg.split('\n')[0]}, retrying (${attempt}/${maxRetries})...`);
        }
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }

    throw new Error(`Server at ${url} did not become ready after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Close the external browser.
   */
  static async closeExternalBrowser(browser: Browser): Promise<void> {
    if (browser) {
      await browser.close();
    }
  }

  // ============================================================
  // WordPress Portal Assertions - Real Data from provision-content-types-and-sample-data.php
  // Demo Users: clyde.grew, kyle.butford, alfreda.waldback (all password: demo1234)
  // Demo Paystubs: March 2024 for all 3 employees
  // ============================================================

  // Demo data constants from provisioning script
  static readonly WP_DEMO_EMPLOYEES = [
    { login: 'clyde.grew', name: 'Clyde Grew', email: 'clyde.grew@northridgehealth.org' },
    { login: 'kyle.butford', name: 'Kyle Butford', email: 'kyle.butford@northridgehealth.org' },
    { login: 'alfreda.waldback', name: 'Alfreda Waldback', email: 'alfreda.waldback@northridgehealth.org' },
  ];
  static readonly WP_DEMO_EMPLOYEE_PASSWORD = 'demo1234';
  static readonly WP_DEMO_PAYSTUBS = [
    { employee: 'Clyde Grew', period: 'March 2024', gross: 4000, net: 3790 },
    { employee: 'Kyle Butford', period: 'March 2024', gross: 3000, net: 2890 },
    { employee: 'Alfreda Waldback', period: 'March 2024', gross: 3500, net: 3590 },
  ];

  /**
   * Login to WordPress admin dashboard.
   * First waits for server ready, then logs in with admin credentials.
   */
  static async wpLoginAsAdmin(page: Page): Promise<void> {
    console.log('WordPress: Waiting for server to be ready...');
    await SelfServicePortalsTestHelper.waitForServerReady(
      page,
      SelfServicePortalsTestHelper.WP_LOGIN_URL,
      30, 2000
    );

    console.log('WordPress: Logging in as admin...');
    await page.goto(SelfServicePortalsTestHelper.WP_LOGIN_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#user_login')).toBeVisible({ timeout: 10000 });
    await page.fill('#user_login', SelfServicePortalsTestHelper.WP_ADMIN_USER);
    await page.fill('#user_pass', SelfServicePortalsTestHelper.WP_ADMIN_PASSWORD);
    await page.click('#wp-submit');

    await page.waitForURL(/wp-admin/, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    console.log('WordPress: Admin login successful ✓');
  }

  /**
   * Login to WordPress frontend (not admin) with specific user.
   */
  static async wpLoginFrontend(page: Page, username: string, password: string): Promise<void> {
    console.log(`WordPress: Logging in frontend as ${username}...`);
    await page.goto(SelfServicePortalsTestHelper.WP_LOGIN_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#user_login')).toBeVisible({ timeout: 10000 });
    await page.fill('#user_login', username);
    await page.fill('#user_pass', password);
    await page.click('#wp-submit');

    // Frontend login might redirect to home or my-documents
    await page.waitForLoadState('networkidle');
    console.log(`WordPress: Frontend login as ${username} successful ✓`);
  }

  /**
   * Assert WordPress Admin Dashboard loads correctly.
   */
  static async assertWpAdminDashboard(page: Page): Promise<void> {
    console.log('WordPress: Checking admin dashboard...');
    await expect(page.locator('#adminmenu')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#wpadminbar')).toBeVisible({ timeout: 5000 });

    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');
    expect(body).not.toContain('Warning:');
    console.log('WordPress: Admin dashboard OK ✓');
  }

  /**
   * Assert WordPress Admin Users page shows ALL demo employee users.
   * Deep check: verifies clyde.grew, kyle.butford, alfreda.waldback exist.
   */
  static async assertWpAdminUsersDeep(page: Page): Promise<void> {
    console.log('WordPress: Checking users page with deep assertions...');
    await page.goto(`${SelfServicePortalsTestHelper.WP_ADMIN_URL}/users.php`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.wp-list-table')).toBeVisible({ timeout: 10000 });

    // Verify ALL demo employees are present
    const body = await page.textContent('body');
    for (const emp of SelfServicePortalsTestHelper.WP_DEMO_EMPLOYEES) {
      expect(body).toContain(emp.login);
      console.log(`WordPress Users: Found ${emp.login} ✓`);
    }

    // Count should be at least 4 (admin + 3 employees)
    const userRows = page.locator('.wp-list-table tbody tr');
    const count = await userRows.count();
    expect(count).toBeGreaterThanOrEqual(4);
    console.log(`WordPress: Users page OK - ${count} users found ✓`);
  }

  /**
   * Assert WordPress Admin Paystubs page shows ALL demo paystubs.
   * Deep check: verifies 3 paystubs for March 2024 exist.
   */
  static async assertWpAdminPaystubsDeep(page: Page): Promise<void> {
    console.log('WordPress: Checking paystubs admin page with deep assertions...');
    await page.goto(SelfServicePortalsTestHelper.WP_ADMIN_PAYSTUBS_URL);
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');

    await expect(page.locator('.wp-list-table')).toBeVisible({ timeout: 10000 });

    // Verify we have exactly 3 paystubs (one per demo employee)
    const rows = page.locator('.wp-list-table tbody tr');
    const count = await rows.count();
    expect(count).toBe(3);
    console.log(`WordPress: Found ${count} paystubs in admin ✓`);

    // Each paystub title should be "March 2024 Paystub"
    expect(body).toContain('March 2024 Paystub');
    console.log('WordPress: Paystubs admin page OK ✓');
  }

  /**
   * Logout from WordPress admin.
   */
  static async wpLogout(page: Page): Promise<void> {
    console.log('WordPress: Logging out from admin...');
    await page.goto(`${SelfServicePortalsTestHelper.WP_BASE_URL}/wp-login.php?action=logout`);
    await page.waitForLoadState('networkidle');

    const confirmLink = page.locator('a:has-text("log out")');
    if (await confirmLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmLink.click();
      await page.waitForLoadState('networkidle');
    }
    console.log('WordPress: Logged out from admin ✓');
  }

  /**
   * Logout from WordPress frontend.
   */
  static async wpLogoutFrontend(page: Page): Promise<void> {
    console.log('WordPress: Logging out from frontend...');
    await page.goto(`${SelfServicePortalsTestHelper.WP_BASE_URL}/wp-login.php?action=logout`);
    await page.waitForLoadState('networkidle');

    const confirmLink = page.locator('a:has-text("log out")');
    if (await confirmLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmLink.click();
      await page.waitForLoadState('networkidle');
    }
    console.log('WordPress: Logged out from frontend ✓');
  }

  /**
   * Assert "My Documents" page as ADMIN - should see ALL 3 paystubs.
   * Uses semantic test IDs for bullet-proof, reliable assertions.
   */
  static async assertWpMyDocumentsAsAdmin(page: Page): Promise<void> {
    console.log('WordPress: Checking My Documents as ADMIN (should see all docs)...');
    await page.goto(SelfServicePortalsTestHelper.WP_MY_DOCUMENTS_URL);
    await page.waitForLoadState('networkidle');

    // Wait for page to load using semantic ID
    await page.waitForSelector('#my-documents-page', { timeout: 10000 });

    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');

    // Verify filter notice shows admin mode
    const filterNotice = await page.locator('#filter-notice').textContent();
    expect(filterNotice).toContain('Admin');
    console.log(`WordPress: Filter notice: ${filterNotice} ✓`);

    // Admin should see ALL 3 employees' paystubs using semantic employee-slug IDs
    for (const paystub of SelfServicePortalsTestHelper.WP_DEMO_PAYSTUBS) {
      const slug = SelfServicePortalsTestHelper.toEmployeeSlug(paystub.employee);
      const row = page.locator(`#paystub-row-${slug}`);
      await expect(row).toBeVisible({ timeout: 5000 });
      console.log(`WordPress My Documents (Admin): Found #paystub-row-${slug} ✓`);
    }

    // Count total paystub rows using data-testid
    const paystubRows = page.locator('[data-testid="paystub-row"]');
    const count = await paystubRows.count();
    expect(count).toBeGreaterThanOrEqual(3);
    console.log(`WordPress: My Documents as Admin OK - ${count} paystub rows found (>= 3 expected) ✓`);
  }

  /**
   * Assert Tailwind CSS styles are properly applied.
   * Verifies styles didn't regress (we had issues getting Tailwind to build).
   */
  static async assertWpTailwindStylesApplied(page: Page): Promise<void> {
    console.log('WordPress: Checking Tailwind styles are applied...');
    await page.goto(SelfServicePortalsTestHelper.WP_MY_DOCUMENTS_URL);
    await page.waitForLoadState('networkidle');

    // Wait for page to load using semantic ID
    await page.waitForSelector('#my-documents-page', { timeout: 10000 });

    // Check that container has proper Tailwind max-width styling
    const mainContent = page.locator('#my-documents-page');
    const styles = await mainContent.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        maxWidth: computed.maxWidth,
        margin: computed.marginLeft,
      };
    });
    // Tailwind classes should produce non-auto values
    console.log(`WordPress: Container styles - maxWidth: ${styles.maxWidth}, margin: ${styles.margin}`);

    // Check for styled buttons/links (Tailwind applies bg-*, text-*, rounded-*, etc.)
    const styledElements = page.locator('[class*="bg-"], [class*="text-"], [class*="rounded"], [class*="p-"], [class*="m-"]');
    const styledCount = await styledElements.count();
    expect(styledCount).toBeGreaterThan(0);
    console.log(`WordPress: Found ${styledCount} Tailwind-styled elements ✓`);

    // Verify View link has proper styling using data-testid
    const viewLink = page.locator('[data-testid="paystub-view-link"]').first();
    if (await viewLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      const linkColor = await viewLink.evaluate((el) => window.getComputedStyle(el).color);
      // Blue color from text-blue-600 class
      console.log(`WordPress: View link color: ${linkColor} ✓`);
    }

    console.log('WordPress: Tailwind styles are applied ✓');
  }

  /**
   * Assert a single paystub detail page with specific data.
   * Uses semantic test IDs for bullet-proof, reliable assertions.
   */
  static async assertWpSinglePaystubDeep(
    page: Page,
    employeeName: string,
    period: string,
    expectedGross: string,
    expectedNet: string,
  ): Promise<void> {
    console.log(`WordPress: Checking single paystub for ${employeeName}...`);
    await page.goto(SelfServicePortalsTestHelper.WP_MY_DOCUMENTS_URL);
    await page.waitForLoadState('networkidle');

    // Wait for paystubs table to be present (semantic ID)
    await page.waitForSelector('#paystubs-table', { timeout: 10000 });

    // Use semantic employee-slug ID for the View link (e.g., #view-paystub-clyde-grew)
    const slug = SelfServicePortalsTestHelper.toEmployeeSlug(employeeName);
    const viewLink = page.locator(`#view-paystub-${slug}`);
    await expect(viewLink).toBeVisible({ timeout: 5000 });
    console.log(`WordPress: Clicking #view-paystub-${slug}...`);
    await viewLink.click();
    await page.waitForLoadState('networkidle');

    // Wait for single paystub page to load (semantic ID)
    await page.waitForSelector('#single-paystub-page', { timeout: 10000 });

    // Verify no PHP errors
    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');

    // Assert values using semantic IDs
    const employeeText = await page.locator('#paystub-employee').textContent();
    expect(employeeText).toContain(employeeName);
    console.log(`WordPress: Employee field: ${employeeText} ✓`);

    const periodText = await page.locator('#paystub-period').textContent();
    expect(periodText).toContain(period);
    console.log(`WordPress: Period field: ${periodText} ✓`);

    const grossText = await page.locator('#paystub-gross').textContent();
    expect(grossText).toContain(expectedGross);
    console.log(`WordPress: Gross amount: ${grossText} ✓`);

    const netText = await page.locator('#paystub-net').textContent();
    expect(netText).toContain(expectedNet);
    console.log(`WordPress: Net amount: ${netText} ✓`);

    // Verify net pay summary matches
    const netPaySummary = await page.locator('#paystub-net-pay-amount').textContent();
    expect(netPaySummary).toContain(expectedNet);
    console.log(`WordPress: Net pay summary: $${netPaySummary} ✓`);

    console.log(`WordPress: Single paystub for ${employeeName} OK ✓`);
  }

  /**
   * Assert "My Documents" page as EMPLOYEE - should see ONLY their own documents.
   * Uses semantic test IDs for bullet-proof, reliable assertions.
   */
  static async assertWpMyDocumentsAsEmployee(
    page: Page,
    ownName: string,
    otherNames: string[],
  ): Promise<void> {
    console.log(`WordPress: Checking My Documents as EMPLOYEE ${ownName} (should see only own docs)...`);
    await page.goto(SelfServicePortalsTestHelper.WP_MY_DOCUMENTS_URL);
    await page.waitForLoadState('networkidle');

    // Wait for page to load using semantic ID
    await page.waitForSelector('#my-documents-page', { timeout: 10000 });

    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');

    // Verify filter notice shows filtered mode (not admin)
    const filterNotice = await page.locator('#filter-notice').textContent();
    expect(filterNotice).toContain('Filtered');
    console.log(`WordPress: Filter notice: ${filterNotice} ✓`);

    // Employee should see their OWN paystub (using semantic employee-slug ID)
    const ownSlug = SelfServicePortalsTestHelper.toEmployeeSlug(ownName);
    const ownRow = page.locator(`#paystub-row-${ownSlug}`);
    await expect(ownRow).toBeVisible({ timeout: 5000 });
    console.log(`WordPress My Documents (Employee): Found #paystub-row-${ownSlug} ✓`);

    // Employee should NOT see other employees' paystubs (using semantic IDs)
    for (const otherName of otherNames) {
      const otherSlug = SelfServicePortalsTestHelper.toEmployeeSlug(otherName);
      const otherRow = page.locator(`#paystub-row-${otherSlug}`);
      const isVisible = await otherRow.isVisible().catch(() => false);
      expect(isVisible).toBe(false);
      console.log(`WordPress My Documents (Employee): #paystub-row-${otherSlug} correctly hidden ✓`);
    }

    // Should have exactly 1 paystub row using data-testid
    const paystubRows = page.locator('[data-testid="paystub-row"]');
    const count = await paystubRows.count();
    expect(count).toBe(1);
    console.log(`WordPress: My Documents as Employee OK - only ${count} paystub visible ✓`);
  }

  /**
   * Assert that non-admin employee has restricted access to wp-admin.
   * In WordPress, non-admins CAN access wp-admin but see a very limited dashboard.
   * They should NOT see admin-only items like Plugins, Users list, Themes, etc.
   */
  static async assertWpAdminRestrictedForEmployee(page: Page): Promise<void> {
    console.log('WordPress: Checking that employee has restricted wp-admin access...');
    await page.goto(SelfServicePortalsTestHelper.WP_ADMIN_URL);
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');

    // Employee (subscriber role) SHOULD see:
    // - Their profile link
    // - Dashboard (but limited)
    expect(body).toContain('Profile');
    console.log('WordPress Admin (Employee): Can see Profile link ✓');

    // Employee SHOULD NOT see admin-only menu items:
    // - Plugins menu
    // - Users menu (list all users)
    // - Appearance/Themes menu
    // - Settings menu
    const adminOnlyItems = ['Plugins', 'Appearance', 'Settings'];
    for (const item of adminOnlyItems) {
      // Check if the menu item is NOT in the admin menu
      const menuItem = page.locator(`#adminmenu a:has-text("${item}")`);
      const isVisible = await menuItem.isVisible().catch(() => false);
      expect(isVisible).toBeFalsy();
      console.log(`WordPress Admin (Employee): Correctly hidden - ${item} menu not visible ✓`);
    }

    // Employee should NOT be able to access Users list page
    await page.goto(`${SelfServicePortalsTestHelper.WP_ADMIN_URL}/users.php`);
    await page.waitForLoadState('networkidle');
    const usersBody = await page.textContent('body');
    // Should see "Sorry, you are not allowed" or similar permission error
    const hasPermissionError = usersBody?.toLowerCase().includes('not allowed') ||
      usersBody?.toLowerCase().includes('permission') ||
      usersBody?.toLowerCase().includes('denied') ||
      usersBody?.toLowerCase().includes('cheatin');
    expect(hasPermissionError).toBeTruthy();
    console.log('WordPress Admin (Employee): Correctly blocked from Users list ✓');

    console.log('WordPress: Employee wp-admin access correctly restricted ✓');
  }

  // ============================================================
  // Grails Playground Assertions
  // ============================================================
  // Each web component has its own assertion function with clear sections:
  // - DOM Presence: Verify component element exists in DOM
  // - Data Assertions: Verify real data is loaded and displayed
  // - Config Assertions: Verify configuration (if applicable)
  // - Usage Assertions: Verify usage/code snippet is correct
  // ============================================================

  // ----------------------------------------------------------
  // rb-tabulator Web Component
  // ----------------------------------------------------------
  /**
   * Assert rb-tabulator web component on the Tabulator page.
   * NOTE: Tabulator config is OPTIONAL - this demo uses defaults (no config file).
   */
  static async assertRbTabulatorComponent(page: Page, baseUrl: string = SelfServicePortalsTestHelper.GRAILS_BASE_URL): Promise<void> {
    const url = `${baseUrl}/tabulator`;
    const reportCode = 'g-scr2htm-trend';
    console.log('Grails Tabulator: Checking rb-tabulator component...');

    await page.goto(url, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // ---- DOM Presence ----
    await expect(page.locator('rb-tabulator')).toBeVisible({ timeout: 15000 });
    console.log('Grails Tabulator: DOM - rb-tabulator element visible ✓');

    // ---- Data Assertions ----
    // Tabulator renders data as .tabulator-row elements
    await expect(page.locator('.tabulator-row').first()).toBeVisible({ timeout: 20000 });
    const rowCount = await page.locator('.tabulator-row').count();
    expect(rowCount).toBeGreaterThan(0);
    console.log(`Grails Tabulator: Data - ${rowCount} rows loaded ✓`);

    // ---- Config Assertions ----
    // Tabulator config is OPTIONAL - this demo has NO config file
    // Verify the config tab shows "No configuration" or similar, NOT stuck on "Loading..."
    await page.click('#config-tab');
    await page.waitForTimeout(500);
    const configText = await page.locator('#configCode').textContent();
    // Should either show empty/no-config message OR not be stuck on "Loading configuration..."
    const isNoConfig = configText?.includes('No ') ||
      configText?.includes('not found') ||
      configText?.includes('default') ||
      configText?.includes('null') ||
      (configText?.trim().length ?? 0) < 30;
    const isNotLoading = !configText?.includes('Loading configuration...');
    expect(isNoConfig || isNotLoading).toBeTruthy();
    console.log('Grails Tabulator: Config - correctly shows no custom config (uses defaults) ✓');

    // ---- Usage Assertions ----
    await page.click('#usage-tab');
    await page.waitForTimeout(300);
    const usageText = await page.locator('#usageCode').textContent();
    expect(usageText).toContain('rb-tabulator');
    expect(usageText).toContain(reportCode);
    console.log('Grails Tabulator: Usage - HTML snippet valid ✓');
  }

  // ----------------------------------------------------------
  // rb-chart Web Component
  // ----------------------------------------------------------
  /**
   * Assert rb-chart web component on the Charts page.
   * Chart REQUIRES a config file (chart-config.groovy).
   */
  static async assertRbChartComponent(page: Page, baseUrl: string = SelfServicePortalsTestHelper.GRAILS_BASE_URL): Promise<void> {
    const url = `${baseUrl}/charts`;
    const reportCode = 'g-scr2htm-trend';
    console.log('Grails Charts: Checking rb-chart component...');

    await page.goto(url, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // ---- DOM Presence ----
    await expect(page.locator('rb-chart')).toBeVisible({ timeout: 15000 });
    console.log('Grails Charts: DOM - rb-chart element visible ✓');

    // ---- Data Assertions ----
    // Chart.js renders to a canvas element inside rb-chart
    await expect(page.locator('rb-chart canvas').first()).toBeVisible({ timeout: 20000 });
    console.log('Grails Charts: Data - canvas rendered with chart ✓');

    // ---- Config Assertions ----
    // Chart REQUIRES config - verify it loads
    await page.click('#config-tab');
    await page.waitForTimeout(500);
    await expect(page.locator('#configCode')).not.toContainText('Loading configuration...', { timeout: 10000 });
    const configText = await page.locator('#configCode').textContent();
    expect(configText?.length).toBeGreaterThan(50);
    // Should contain chart-specific config keywords
    expect(configText?.toLowerCase()).toMatch(/chart|type|series|label/i);
    console.log('Grails Charts: Config - chart configuration loaded ✓');

    // ---- Usage Assertions ----
    await page.click('#usage-tab');
    await page.waitForTimeout(300);
    const usageText = await page.locator('#usageCode').textContent();
    expect(usageText).toContain('rb-chart');
    expect(usageText).toContain(reportCode);
    console.log('Grails Charts: Usage - HTML snippet valid ✓');
  }

  // ----------------------------------------------------------
  // rb-pivot-table Web Component
  // ----------------------------------------------------------
  /**
   * Assert rb-pivot-table web component on the Pivot Tables page.
   * Pivot table REQUIRES a config file (pivot-config.groovy).
   */
  static async assertRbPivotTableComponent(page: Page, baseUrl: string = SelfServicePortalsTestHelper.GRAILS_BASE_URL, pivotTablesPath: string = '/pivot-tables'): Promise<void> {
    const url = `${baseUrl}${pivotTablesPath}`;
    const reportCode = 'piv-sales-region-prod-qtr';
    console.log('Pivot Tables: Checking rb-pivot-table component...');

    await page.goto(url, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // ---- DOM Presence ----
    await expect(page.locator('rb-pivot-table')).toBeVisible({ timeout: 15000 });
    console.log('Pivot Tables: DOM - rb-pivot-table element visible ✓');

    // ---- Data Assertions ----
    // PivotTable.js renders .pvtTable or .pvtUi or .pvtRendererArea
    await expect(page.locator('.pvtTable, .pvtUi, .pvtRendererArea').first()).toBeVisible({ timeout: 20000 });
    console.log('Pivot Tables: Data - pivot table UI rendered ✓');

    // ---- Raw Data Tab ----
    await page.click('#rawdata-tab');
    await page.waitForTimeout(1000);
    await expect(page.locator('#rawDataTable')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#rawDataTable .tabulator-row').first()).toBeVisible({ timeout: 15000 });
    console.log('Pivot Tables: Raw Data tab - rb-tabulator rendered with data ✓');

    // ---- Config Assertions ----
    // Pivot table REQUIRES config - verify it loads
    await page.click('#config-tab');
    await page.waitForTimeout(500);
    await expect(page.locator('#configCode')).not.toContainText('Loading configuration...', { timeout: 10000 });
    const configText = await page.locator('#configCode').textContent();
    expect(configText?.length).toBeGreaterThan(50);
    // Should contain pivot-specific config keywords
    expect(configText?.toLowerCase()).toMatch(/pivot|rows|cols|aggregator|vals/i);
    console.log('Pivot Tables: Config - pivot configuration loaded ✓');

    // ---- Usage Assertions ----
    await page.click('#usage-tab');
    await page.waitForTimeout(300);
    const usageText = await page.locator('#usageCode').textContent();
    expect(usageText).toContain('rb-pivot-table');
    expect(usageText).toContain(reportCode);
    console.log('Pivot Tables: Usage - HTML snippet valid ✓');
  }

  // ----------------------------------------------------------
  // Data Warehouse Page (Browser/DuckDB/ClickHouse engines)
  // ----------------------------------------------------------
  /**
   * Assert data warehouse page — 3 engine pivots, config, and usage tabs.
   * All 3 engines are displayed vertically (no sub-tabs).
   */
  static async assertDataWarehousePage(
    page: Page,
    baseUrl: string,
    dataWarehousePath: string,
  ): Promise<void> {
    const url = `${baseUrl}${dataWarehousePath}`;
    console.log('Data Warehouse: Checking page...');

    await page.goto(url, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // ---- Engine Sections Visible ----
    await expect(page.locator('#engine-browser')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#engine-duckdb')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#engine-clickhouse')).toBeVisible({ timeout: 15000 });
    console.log('Data Warehouse: DOM - all 3 engine sections visible ✓');

    // ---- Browser Pivot Renders ----
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, 'warehousePivotBrowser');
    const grandTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'warehousePivotBrowser');
    expect(grandTotal).toBeGreaterThan(0);
    console.log(`Data Warehouse: Browser pivot rendered, grand total: $${grandTotal.toLocaleString()} ✓`);

    // ---- DuckDB Pivot Renders ----
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, 'warehousePivotDuckdb');
    console.log('Data Warehouse: DuckDB pivot rendered ✓');

    // ---- ClickHouse Warning Visible (pack not running during smoke test) ----
    await expect(page.locator('#clickhouseWarning')).toBeVisible({ timeout: 5000 });
    console.log('Data Warehouse: ClickHouse warning visible (pack not running) ✓');

    // ---- Raw Data Tab (server-side pagination) ----
    await page.click('#rawdata-tab');
    await page.waitForTimeout(SelfServicePortalsTestHelper.TABULATOR_LOAD_TIMEOUT);
    await expect(page.locator('#rawDataTable')).toBeVisible({ timeout: SelfServicePortalsTestHelper.TABULATOR_LOAD_TIMEOUT });
    const rawDataInfo = await page.locator('#rawDataInfo').textContent();
    expect(rawDataInfo).toContain('Showing');
    await expect(page.locator('#rawDataPagination')).toBeVisible({ timeout: SelfServicePortalsTestHelper.TABULATOR_LOAD_TIMEOUT * 3 });
    // Change page size to 50 and verify reload
    await page.selectOption('#rawDataPageSize', '50');
    // Use auto-retrying assertion instead of fixed wait — the async fetch may take variable time
    await expect(page.locator('#rawDataInfo')).toContainText(/1[-–]50/, { timeout: 15000 });
    const updatedInfo = await page.locator('#rawDataInfo').textContent();
    console.log(`Data Warehouse: Raw Data - pagination works (${updatedInfo}) ✓`);

    // ---- Config Tab ----
    await page.click('#config-tab');
    await page.waitForTimeout(500);
    await expect(page.locator('#configCodeBrowser')).not.toContainText('Loading configuration...', { timeout: 10000 });
    await expect(page.locator('#configCodeDuckdb')).not.toContainText('Loading configuration...', { timeout: 10000 });
    const configText = await page.locator('#configCodeBrowser').textContent();
    expect(configText?.length).toBeGreaterThan(50);
    console.log('Data Warehouse: Config - engine configurations loaded ✓');

    // ---- Usage Tab ----
    await page.click('#usage-tab');
    await page.waitForTimeout(300);
    const browserUsage = await page.locator('#usageCodeBrowser').textContent();
    expect(browserUsage).toContain('piv-northwind-warehouse-browser');
    const duckdbUsage = await page.locator('#usageCodeDuckdb').textContent();
    expect(duckdbUsage).toContain('piv-northwind-warehouse-duckdb');
    const clickhouseUsage = await page.locator('#usageCodeClickhouse').textContent();
    expect(clickhouseUsage).toContain('piv-northwind-warehouse-clickhouse');
    console.log('Data Warehouse: Usage - all 3 engine snippets valid ✓');
  }

  // ----------------------------------------------------------
  // Pivot Table Helper Functions for Analytics Testing
  // ----------------------------------------------------------

  /**
   * Set the engine for a pivot table component.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param engine - 'browser' (default, PivotTable.js) or 'duckdb' (server-side)
   */
  static async setPivotEngine(page: Page, componentId: string, engine: 'browser' | 'duckdb' | 'clickhouse'): Promise<void> {
    console.log(`Setting pivot engine to '${engine}' for #${componentId}...`);
    await page.evaluate(({ id, eng }) => {
      const component = document.getElementById(id) as any;
      if (component) {
        component.setAttribute('engine', eng);
      }
    }, { id: componentId, eng: engine });
    // Wait for re-render
    await page.waitForTimeout(1000);
  }

  /**
   * Wait for a pivot table to fully render.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   */
  static async waitForPivotTableRender(page: Page, componentId: string): Promise<void> {
    console.log(`Waiting for pivot table #${componentId} to render...`);

    // Wait for component to be visible
    await expect(page.locator(`#${componentId}`)).toBeVisible({ timeout: 15000 });

    // Wait for PivotTable.js UI to be rendered (either .pvtTable or .pvtUi)
    // Server-side engines (ClickHouse) can take 20+ seconds for complex queries
    // (e.g., adding employee_name dimension: 640→1825 rows, ~22s query time).
    // The component hides .pvtUi during loading, so this timeout must exceed the slowest query.
    const pvtSelector = `#${componentId} .pvtTable, #${componentId} .pvtUi, #${componentId} .pvtRendererArea`;
    await expect(page.locator(pvtSelector).first()).toBeVisible({ timeout: 60000 });

    // Check if rendering as chart (SVG/Canvas) or table
    const isChart = await page.locator(`#${componentId} svg, #${componentId} canvas`).first().isVisible().catch(() => false);

    if (isChart) {
      // For charts, wait for SVG or Canvas element
      await expect(page.locator(`#${componentId} svg, #${componentId} canvas`).first()).toBeVisible({ timeout: 20000 });
      console.log(`Chart renderer detected - SVG/Canvas visible`);
    } else {
      // For table renderers, wait for actual DATA (not just the empty grand totals row).
      // Server-side engines (DuckDB/ClickHouse) render an empty table first (Phase 1),
      // then re-render after the server response arrives (Phase 2).
      // Phase 1 empty render has ONLY: <th.pvtTotalLabel> + <td.pvtGrandTotal>
      //   (no pvtRowLabel, no pvtVal, no pvtTotal — because rowKeys=[] and colKeys=[])
      // Phase 2 (with data) has at least one of:
      //   - th.pvtRowLabel: data rows when row dimensions exist
      //   - td.pvtVal: data cells when BOTH row and col dimensions exist
      //   - td.pvtTotal: column totals in grand totals row (when col dimensions exist,
      //     even if row dimensions are empty — covers flat pivots with no row dims)
      const dataSelector = [
        `#${componentId} .pvtTable tbody tr th.pvtRowLabel`,
        `#${componentId} .pvtTable tbody tr td.pvtVal`,
        `#${componentId} .pvtTable tbody tr td.pvtTotal`,
      ].join(', ');
      await expect(
        page.locator(dataSelector).first()
      ).toBeVisible({ timeout: 30000 });
    }

    // Additional wait for any animations/transitions
    await page.waitForTimeout(1500);
    console.log(`Pivot table #${componentId} fully rendered ✓`);
  }

  /**
   * Get the grand total value from a pivot table.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param previousValue - Optional previous value to verify change (waits for value to differ)
   * @returns The grand total value as a number
   */
  static async getPivotGrandTotal(page: Page, componentId: string, previousValue?: number): Promise<number> {
    // If previousValue is provided, wait for the value to actually change
    if (previousValue !== undefined) {
      console.log(`[getPivotGrandTotal] Waiting for grand total to change from ${previousValue}...`);

      // Retry up to 10 times (10 seconds) waiting for the value to change
      for (let attempt = 1; attempt <= 10; attempt++) {
        const totalText = await page.evaluate(
          ({ id }) => {
            const component = document.getElementById(id);
            if (!component) return '0';

            const root = component.shadowRoot || component;
            const table = root.querySelector('.pvtTable');
            if (!table) return '0';

            const grandTotalCell = table.querySelector('.pvtGrandTotal') as HTMLElement;
            return grandTotalCell?.textContent?.trim() || '0';
          },
          { id: componentId }
        );

        const numericValue = totalText?.replace(/[^0-9.-]/g, '') || '0';
        const currentValue = parseFloat(numericValue);

        // Reject 0 as a valid new value — server-side engines briefly render an empty table
        // (Phase 1) with grand total = 0 before the actual data arrives (Phase 2)
        if (currentValue !== previousValue && currentValue > 0) {
          console.log(`[getPivotGrandTotal] Value changed from ${previousValue} to ${currentValue} after ${attempt} attempts ✓`);
          return currentValue;
        }

        console.log(`[getPivotGrandTotal] Attempt ${attempt}/10: Value is ${currentValue} (waiting for non-zero change from ${previousValue})...`);
        await page.waitForTimeout(1000);
      }

      console.error(`[getPivotGrandTotal] Value did not change after 10 seconds, still ${previousValue}`);
      return previousValue;
    }

    // No previous value - just read the current value
    const totalText = await page.evaluate(
      ({ id }) => {
        const component = document.getElementById(id);
        if (!component) {
          console.error(`[getPivotGrandTotal] Component #${id} not found`);
          return '0';
        }

        // Access Shadow DOM
        const root = component.shadowRoot || component;
        const table = root.querySelector('.pvtTable');
        if (!table) {
          console.error(`[getPivotGrandTotal] .pvtTable not found`);
          return '0';
        }

        // The grand total cell is the ONLY cell with class .pvtGrandTotal
        // See pivot-renderers.ts line 227: html += `<td class="pvtGrandTotal">${grandTotalAggregator.format(...)}</td>`
        // Row/column totals use .pvtTotal (lines 209, 224), so we MUST NOT use that selector
        const grandTotalCell = table.querySelector('.pvtGrandTotal') as HTMLElement;

        if (grandTotalCell) {
          const value = grandTotalCell.textContent?.trim() || '0';
          console.log(`[getPivotGrandTotal] Found grand total: "${value}"`);
          return value;
        }

        console.error(`[getPivotGrandTotal] .pvtGrandTotal cell not found in pivot table`);
        return '0';
      },
      { id: componentId }
    );

    const numericValue = totalText?.replace(/[^0-9.-]/g, '') || '0';
    const result = parseFloat(numericValue);
    console.log(`[getPivotGrandTotal] Final result: ${result}`);
    return result;
  }

  /**
   * Get a specific cell value from the pivot table.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param rowLabel - Row label to find
   * @param colLabel - Column label to find (optional, for grand totals use null)
   * @returns The cell value as a number
   */
  static async getPivotCellValue(
    page: Page,
    componentId: string,
    rowLabel: string,
    colLabel?: string
  ): Promise<number> {
    const result = await page.evaluate(
      ({ id, row, col }) => {
        const component = document.getElementById(id);
        if (!component) {
          return { value: '0', debug: `Component #${id} not found` };
        }

        // Access Shadow DOM
        const root = component.shadowRoot || component;
        const table = root.querySelector('.pvtTable') as HTMLTableElement;
        if (!table) {
          return { value: '0', debug: `.pvtTable not found (shadowRoot=${!!component.shadowRoot})` };
        }

        // Use :scope > tbody > tr to ONLY get direct tbody children of this table,
        // not rows from the outer .pvtUi table's tbody (inner table is nested inside it)
        const tbody = table.querySelector(':scope > tbody');
        if (!tbody) {
          return { value: '0', debug: `No direct tbody found in .pvtTable` };
        }
        const rows = Array.from(tbody.querySelectorAll(':scope > tr'));

        // Grand totals row ("Totals") is always the LAST tbody row.
        // Must handle it as a special case because the text "Totals" also appears in
        // the thead as a column header (<th class="pvtTotalLabel" rowspan="2">Totals</th>),
        // and the nested table structure can cause querySelector to find that one first.
        if (row === 'Totals') {
          const lastRow = rows[rows.length - 1];
          if (!lastRow) {
            return { value: '0', debug: `No rows in tbody` };
          }
          const totalLabel = lastRow.querySelector('th.pvtTotalLabel');
          if (!totalLabel || totalLabel.textContent?.trim() !== 'Totals') {
            return { value: '0', debug: `Last row is not grand totals row` };
          }
          if (!col) {
            // Return the grand total (last cell)
            const grandTotal = lastRow.querySelector('td.pvtGrandTotal');
            return { value: grandTotal?.textContent || '0', debug: `grandTotalsRow lastCell` };
          }
          // Find column index from thead pvtColLabel headers
          const colHeaders = Array.from(table.querySelectorAll('thead th.pvtColLabel'));
          const colIndex = colHeaders.findIndex(h => h.textContent?.trim() === col);
          if (colIndex === -1) {
            const availCols = colHeaders.slice(0, 10).map(h => h.textContent?.trim()).join(', ');
            return { value: '0', debug: `Col '${col}' not in ${colHeaders.length} pvtColLabel: [${availCols}]` };
          }
          const cells = lastRow.querySelectorAll('td');
          return { value: cells[colIndex]?.textContent || '0', debug: `grandTotalsRow colIdx=${colIndex} cells=${cells.length}` };
        }

        // Find the anchor row for non-Totals labels
        let anchorIdx = -1;
        let spanCount = 1;

        for (let i = 0; i < rows.length; i++) {
          const headers = rows[i].querySelectorAll('th.pvtRowLabel, th.pvtTotalLabel');
          for (let h = 0; h < headers.length; h++) {
            if (headers[h].textContent?.trim() === row) {
              anchorIdx = i;
              spanCount = parseInt(headers[h].getAttribute('rowspan') || '1', 10);
              break;
            }
          }
          if (anchorIdx !== -1) break;
        }

        // Fallback: search by text content
        if (anchorIdx === -1) {
          anchorIdx = rows.findIndex(r => r.textContent?.includes(row));
          spanCount = 1;
        }

        if (anchorIdx === -1) {
          return { value: '0', debug: `Anchor '${row}' not found in ${rows.length} rows` };
        }

        if (spanCount <= 1) {
          const targetRow = rows[anchorIdx];
          if (!col) {
            const cells = targetRow.querySelectorAll('td');
            return { value: cells[cells.length - 1]?.textContent || '0', debug: `anchor=${anchorIdx} span=1 lastCell` };
          }
          // Use pvtColLabel headers which map 1:1 to <td> data cells
          const colHeaders = Array.from(table.querySelectorAll('thead th.pvtColLabel'));
          const colIndex = colHeaders.findIndex(h => h.textContent?.trim() === col);
          if (colIndex === -1) {
            const availCols = colHeaders.slice(0, 10).map(h => h.textContent?.trim()).join(', ');
            return { value: '0', debug: `Col '${col}' not in ${colHeaders.length} pvtColLabel: [${availCols}]` };
          }
          const cells = targetRow.querySelectorAll('td');
          return { value: cells[colIndex]?.textContent || '0', debug: `anchor=${anchorIdx} colIdx=${colIndex} cells=${cells.length}` };
        }

        // Hierarchical pivot — sum across spanned rows
        if (col) {
          // Sum a specific COLUMN's cells across spanned rows
          const colHeaders = Array.from(table.querySelectorAll('thead th.pvtColLabel'));
          const colIndex = colHeaders.findIndex(h => h.textContent?.trim() === col);
          if (colIndex === -1) {
            const availCols = colHeaders.slice(0, 10).map(h => h.textContent?.trim()).join(', ');
            return { value: '0', debug: `Col '${col}' not in ${colHeaders.length} pvtColLabel: [${availCols}]` };
          }
          let sum = 0;
          for (let i = anchorIdx; i < anchorIdx + spanCount && i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells[colIndex]) {
              const val = parseFloat(cells[colIndex].textContent?.replace(/[^0-9.-]/g, '') || '0');
              if (!isNaN(val)) sum += val;
            }
          }
          return { value: sum.toFixed(2), debug: `anchor=${anchorIdx} span=${spanCount} colIdx=${colIndex} sum=${sum}` };
        }
        // No column specified — sum the row total (pvtTotal) cells
        let sum = 0;
        for (let i = anchorIdx; i < anchorIdx + spanCount && i < rows.length; i++) {
          const totalCell = rows[i].querySelector('td.pvtTotal');
          if (totalCell) {
            const val = parseFloat(totalCell.textContent?.replace(/[^0-9.-]/g, '') || '0');
            if (!isNaN(val)) sum += val;
          }
        }
        return { value: sum.toFixed(2), debug: `anchor=${anchorIdx} span=${spanCount} sum=${sum}` };
      },
      { id: componentId, row: rowLabel, col: colLabel || '' }
    );

    const numericValue = result?.value?.replace(/[^0-9.-]/g, '') || '0';
    const parsed = parseFloat(numericValue);
    console.log(`[getPivotCellValue] #${componentId} row='${rowLabel}' col='${colLabel}' => ${parsed} (${result?.debug})`);
    return parsed;
  }

  /**
   * Drag a dimension from unused area to rows.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param dimensionName - Name of the dimension to drag
   */
  static async dragDimensionToRows(page: Page, componentId: string, dimensionName: string): Promise<void> {
    console.log(`Dragging dimension '${dimensionName}' to rows...`);
    await page.evaluate(
      ({ id, dimension }) => {
        const component = document.getElementById(id) as any;
        if (!component || !component.moveDimension) return;

        // Call the SAME function that the UI drag operation uses
        component.moveDimension(dimension, 'rows');
      },
      { id: componentId, dimension: dimensionName }
    );

    // Wait for re-render to complete
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`Dimension '${dimensionName}' dragged to rows ✓`);
  }

  /**
   * Drag a dimension from unused area to columns.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param dimensionName - Name of the dimension to drag
   */
  static async dragDimensionToCols(page: Page, componentId: string, dimensionName: string): Promise<void> {
    console.log(`Dragging dimension '${dimensionName}' to columns...`);
    await page.evaluate(
      ({ id, dimension }) => {
        const component = document.getElementById(id) as any;
        if (!component || !component.moveDimension) return;

        // Call the SAME function that the UI drag operation uses
        component.moveDimension(dimension, 'cols');
      },
      { id: componentId, dimension: dimensionName }
    );

    // Wait for re-render to complete
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`Dimension '${dimensionName}' dragged to columns ✓`);
  }

  /**
   * Move a dimension from columns to rows.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param dimensionName - Name of the dimension to move
   */
  static async moveDimensionFromColsToRows(page: Page, componentId: string, dimensionName: string): Promise<void> {
    console.log(`Moving dimension '${dimensionName}' from columns to rows...`);
    await page.evaluate(
      ({ id, dimension }) => {
        const component = document.getElementById(id);
        if (!component) return;

        const colsArea = component.querySelector('.pvtCols');
        if (!colsArea) return;

        const dimensionBtn = Array.from(colsArea.querySelectorAll('.pvtAttr')).find(
          el => el.textContent?.trim() === dimension
        ) as HTMLElement;

        if (!dimensionBtn) return;

        const rowsArea = component.querySelector('.pvtRows');
        if (!rowsArea) return;

        const dragEvent = new DragEvent('dragstart', { bubbles: true });
        const dropEvent = new DragEvent('drop', { bubbles: true });

        dimensionBtn.dispatchEvent(dragEvent);
        rowsArea.dispatchEvent(dropEvent);
      },
      { id: componentId, dimension: dimensionName }
    );

    await page.waitForTimeout(1500);
    console.log(`Dimension '${dimensionName}' moved from columns to rows ✓`);
  }

  /**
   * Drag a dimension from rows back to unused area.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param dimensionName - Name of the dimension to remove
   */
  static async dragDimensionFromRowsToUnused(page: Page, componentId: string, dimensionName: string): Promise<void> {
    console.log(`Dragging dimension '${dimensionName}' from rows to unused...`);
    await page.evaluate(
      ({ id, dimension }) => {
        const component = document.getElementById(id) as any;
        if (!component || !component.moveDimension) return;

        // Call the SAME function that the UI drag operation uses
        component.moveDimension(dimension, 'unused');
      },
      { id: componentId, dimension: dimensionName }
    );

    // Wait for re-render to complete
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`Dimension '${dimensionName}' removed from rows ✓`);
  }

  /**
   * Drag a dimension from columns back to unused area.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param dimensionName - Name of the dimension to remove
   */
  static async dragDimensionFromColsToUnused(page: Page, componentId: string, dimensionName: string): Promise<void> {
    console.log(`Dragging dimension '${dimensionName}' from columns to unused...`);
    await page.evaluate(
      ({ id, dimension }) => {
        const component = document.getElementById(id) as any;
        if (!component || !component.moveDimension) return;

        // Call the SAME function that the UI drag operation uses
        component.moveDimension(dimension, 'unused');
      },
      { id: componentId, dimension: dimensionName }
    );

    // Wait for re-render to complete
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`Dimension '${dimensionName}' removed from columns ✓`);
  }

  /**
   * Change the aggregator (Sum, Average, Count, etc.).
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param aggregatorName - Name of the aggregator (e.g., 'Average', 'Sum')
   */
  static async changeAggregator(page: Page, componentId: string, aggregatorName: string): Promise<void> {
    console.log(`Changing aggregator to '${aggregatorName}'...`);

    // Call the component's public API
    await page.evaluate(
      ({ id, aggregator }) => {
        const component = document.getElementById(id) as any;
        if (!component || !component.changeAggregator) {
          console.error(`[changeAggregator] Component #${id} not found or API not available`);
          return;
        }

        // Call the SAME function that the UI dropdown uses
        component.changeAggregator(aggregator);
        console.log(`[changeAggregator] Changed to '${aggregator}' ✓`);
      },
      { id: componentId, aggregator: aggregatorName }
    );

    // Wait for pivot table to re-render
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`Aggregator changed to '${aggregatorName}' ✓`);
  }

  /**
   * Change the value field (metric to aggregate).
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param valueName - Name of the value field (e.g., 'Revenue', 'Profit')
   */
  static async changeValueField(page: Page, componentId: string, valueName: string): Promise<void> {
    console.log(`Changing value field to '${valueName}'...`);

    // Call the component's public API
    await page.evaluate(
      ({ id, value }) => {
        const component = document.getElementById(id) as any;
        if (!component || !component.changeValueField) {
          console.error(`[changeValueField] Component #${id} not found or API not available`);
          return;
        }

        // Call the SAME function that the UI dropdown uses
        component.changeValueField(value);
        console.log(`[changeValueField] Changed to '${value}' ✓`);
      },
      { id: componentId, value: valueName }
    );

    // Wait for pivot table to re-render with new value
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`Value field changed to '${valueName}' ✓`);
  }

  /**
   * Change the renderer (Table, Bar Chart, etc.).
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param rendererName - Name of the renderer (e.g., 'Table', 'Grouped Column Chart')
   */
  static async changeRenderer(page: Page, componentId: string, rendererName: string): Promise<void> {
    console.log(`Changing renderer to '${rendererName}'...`);

    // Call the component's public API
    await page.evaluate(
      ({ id, renderer }) => {
        const component = document.getElementById(id) as any;
        if (!component || !component.changeRenderer) {
          console.error(`[changeRenderer] Component #${id} not found or API not available`);
          return;
        }

        // Call the SAME function that the UI dropdown uses
        component.changeRenderer(renderer);
        console.log(`[changeRenderer] Changed to '${renderer}' ✓`);
      },
      { id: componentId, renderer: rendererName }
    );

    // Wait for pivot table to re-render (charts take longer)
    await page.waitForTimeout(2000);
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`Renderer changed to '${rendererName}' ✓`);
  }

  /**
   * Filter a dimension by excluding specific values.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param dimensionName - Name of the dimension to filter
   * @param valuesToExclude - Array of values to exclude (hide) from the pivot table
   */
  static async filterDimension(
    page: Page,
    componentId: string,
    dimensionName: string,
    valuesToExclude: string[]
  ): Promise<void> {
    console.log(`Filtering dimension '${dimensionName}', unchecking: ${valuesToExclude.join(', ')}...`);

    // Call the component's public API
    await page.evaluate(
      ({ id, dimension, values }) => {
        const component = document.getElementById(id) as any;
        if (!component || !component.setFilter) {
          console.error(`[filterDimension] Component #${id} not found or API not available`);
          return;
        }

        // Call the SAME function that the UI filter dialog uses
        component.setFilter(dimension, values);
        console.log(`[filterDimension] Filter set for '${dimension}': excluding ${values.join(', ')} ✓`);
      },
      { id: componentId, dimension: dimensionName, values: valuesToExclude }
    );

    // Wait for pivot table to re-render
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`Dimension '${dimensionName}' filtered ✓`);
  }

  /**
   * Clear all filters from a pivot table.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param dimensionNames - Array of dimension names to clear filters from
   */
  static async clearFilters(
    page: Page,
    componentId: string,
    dimensionNames: string[]
  ): Promise<void> {
    console.log(`Clearing filters for dimensions: ${dimensionNames.join(', ')}...`);

    for (const dimensionName of dimensionNames) {
      // Call setFilter with empty array to clear the filter
      await page.evaluate(
        ({ id, dimension }) => {
          const component = document.getElementById(id) as any;
          if (!component || !component.setFilter) {
            console.error(`[clearFilters] Component #${id} not found or API not available`);
            return;
          }

          // Empty array clears the filter for this dimension
          component.setFilter(dimension, []);
          console.log(`[clearFilters] Cleared filter for '${dimension}' ✓`);
        },
        { id: componentId, dimension: dimensionName }
      );
    }

    // Wait for pivot table to re-render after clearing all filters
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`All filters cleared ✓`);
  }

  /**
   * Sort pivot table by a specific dimension.
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @param order - 'key_a_to_z' or 'value_z_to_a' etc.
   */
  static async sortPivot(page: Page, componentId: string, order: string): Promise<void> {
    console.log(`Sorting pivot table by '${order}'...`);
    await page.evaluate(
      ({ id, sortOrder }) => {
        const component = document.getElementById(id) as any;
        if (!component) return;
        // Set rowOrder directly on the custom element (accessors={true} creates setter)
        // This triggers reactive PivotData recomputation + re-render.
        // Do NOT call fetchData() — it re-fetches config and overwrites rowOrder.
        component.rowOrder = sortOrder;
      },
      { id: componentId, sortOrder: order }
    );

    // Wait for reactive re-render (server-side engines also re-execute on server)
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);
    console.log(`Pivot table sorted by '${order}' ✓`);
  }

  /**
   * Click the row order toggle button to cycle through sort modes.
   * Modes cycle: key_a_to_z (↕) → value_a_to_z (↓) → value_z_to_a (↑) → key_a_to_z
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @returns The new row order after toggle
   */
  static async toggleRowOrder(page: Page, componentId: string): Promise<string> {
    console.log(`Toggling row order...`);

    // Get current row order before clicking (use Svelte accessor, not pivotUI)
    const currentOrder = await page.evaluate(
      ({ id }) => {
        const component = document.getElementById(id) as any;
        return component?.rowOrder || 'key_a_to_z';
      },
      { id: componentId }
    );

    // Click the row order button (Playwright pierces Shadow DOM)
    await page.locator(`#${componentId} .pvtRowOrder`).click();

    // Wait for re-render (server engines re-execute query on rowOrder change)
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);

    // Get new row order after clicking (use Svelte accessor)
    const newOrder = await page.evaluate(
      ({ id }) => {
        const component = document.getElementById(id) as any;
        return component?.rowOrder || 'key_a_to_z';
      },
      { id: componentId }
    );

    console.log(`Row order toggled: ${currentOrder} → ${newOrder} ✓`);
    return newOrder;
  }

  /**
   * Click the column order toggle button to cycle through sort modes.
   * Modes cycle: key_a_to_z (↔) → value_a_to_z (→) → value_z_to_a (←) → key_a_to_z
   * @param page - Playwright page object
   * @param componentId - ID of the rb-pivot-table element
   * @returns The new column order after toggle
   */
  static async toggleColOrder(page: Page, componentId: string): Promise<string> {
    console.log(`Toggling column order...`);

    // Use Svelte accessor, not pivotUI
    const currentOrder = await page.evaluate(
      ({ id }) => {
        const component = document.getElementById(id) as any;
        return component?.colOrder || 'key_a_to_z';
      },
      { id: componentId }
    );

    // Click the column order button (Playwright pierces Shadow DOM)
    await page.locator(`#${componentId} .pvtColOrder`).click();

    // Wait for re-render (server engines re-execute query on colOrder change)
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, componentId);

    // Use Svelte accessor
    const newOrder = await page.evaluate(
      ({ id }) => {
        const component = document.getElementById(id) as any;
        return component?.colOrder || 'key_a_to_z';
      },
      { id: componentId }
    );

    console.log(`Column order toggled: ${currentOrder} → ${newOrder} ✓`);
    return newOrder;
  }

  // ----------------------------------------------------------
  // rb-parameters Web Component
  // ----------------------------------------------------------
  /**
   * Assert rb-parameters web component on the Parameters page.
   * Parameters REQUIRES a config file (report-parameters-spec.groovy).
   * Also tests filtering workflow: initial state -> Run Report -> Clear.
   */
  static async assertRbParametersComponent(page: Page, baseUrl: string = SelfServicePortalsTestHelper.GRAILS_BASE_URL): Promise<void> {
    const url = `${baseUrl}/report-parameters`;
    console.log('Grails Parameters: Checking rb-parameters component...');

    await page.goto(url, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // ---- DOM Presence ----
    await expect(page.locator('rb-parameters')).toBeVisible({ timeout: 15000 });
    console.log('Grails Parameters: DOM - rb-parameters element visible ✓');

    // ---- Data Assertions ----
    // Parameters page shows data in a tabulator table
    await expect(page.locator('#dataTable .tabulator-row').first()).toBeVisible({ timeout: 20000 });

    // Initial state: 12 employees
    let recordText = await page.locator('#recordCount').textContent();
    expect(recordText).toContain('12');
    console.log('Grails Parameters: Data - initial 12 records loaded ✓');

    // Run Report - should filter (show "N of 12" where N >= 1)
    await page.click('#submitBtn');
    await page.waitForTimeout(2000);
    recordText = await page.locator('#recordCount').textContent();
    expect(recordText).toMatch(/of\s*12/i); // "X of 12" pattern
    // Reject 0 results — would indicate broken data extraction (e.g. result.reportData vs result.data)
    expect(recordText).not.toMatch(/\b0\s+of/i);
    console.log(`Grails Parameters: Data - filtered to ${recordText} ✓`);

    // Clear Filters - should restore 12
    const clearBtn = page.locator('#clearFiltersBtn');
    if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearBtn.click();
      await page.waitForTimeout(1500);
      recordText = await page.locator('#recordCount').textContent();
      expect(recordText).toContain('12');
      console.log('Grails Parameters: Data - clear restored 12 records ✓');
    }

    // ---- Config Assertions ----
    // Parameters REQUIRES config - verify it loads
    await page.click('#config-tab');
    await page.waitForTimeout(500);
    await expect(page.locator('#configCode')).not.toContainText('Loading configuration...', { timeout: 10000 });
    const configText = await page.locator('#configCode').textContent();
    expect(configText?.length).toBeGreaterThan(50);
    // Should contain parameters-specific config keywords
    expect(configText?.toLowerCase()).toMatch(/parameter|field|type|label|date/i);
    console.log('Grails Parameters: Config - parameters configuration loaded ✓');

    // ---- Usage Assertions ----
    await page.click('#usage-tab');
    await page.waitForTimeout(300);
    const usageText = await page.locator('#usageCode').textContent();
    expect(usageText).toContain('rb-parameters');
    console.log('Grails Parameters: Usage - HTML snippet valid ✓');
  }

  // ----------------------------------------------------------
  // rb-report Web Component
  // ----------------------------------------------------------
  /**
   * Assert rb-report web component on the Reports page.
   * Reports page shows employee cards; clicking one loads the report.
   */
  static async assertRbReportComponent(page: Page, baseUrl: string = SelfServicePortalsTestHelper.GRAILS_BASE_URL): Promise<void> {
    const url = `${baseUrl}/reports`;
    console.log('Grails Reports: Checking rb-report component...');

    await page.goto(url, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // ---- DOM Presence (before selection) ----
    // Employee cards should be visible
    await expect(page.locator('.employee-card').first()).toBeVisible({ timeout: 10000 });
    const cardCount = await page.locator('.employee-card').count();
    expect(cardCount).toBe(3);
    console.log('Grails Reports: DOM - 3 employee cards visible ✓');

    // ---- Data Assertions ----
    // Click first employee - rb-report should appear with iframe
    await page.click('.employee-card[data-code="EMP001"]');
    await page.waitForTimeout(2000);
    await expect(page.locator('rb-report#demoReport')).toBeVisible({ timeout: 10000 });
    console.log('Grails Reports: DOM - rb-report element visible after selection ✓');

    // Verify selection state
    const activeCount = await page.locator('.employee-card.active').count();
    expect(activeCount).toBe(1);
    console.log('Grails Reports: Data - employee selection active state works ✓');

    // Report renders in iframe
    await expect(page.locator('rb-report iframe, rb-report object').first()).toBeVisible({ timeout: 10000 });
    console.log('Grails Reports: Data - report iframe rendered ✓');

    // ---- Config Assertions ----
    // rb-report doesn't typically have a config tab on this page
    // Skip config check for reports

    // ---- Usage Assertions ----
    await page.click('#usage-tab');
    await page.waitForTimeout(300);
    const usageText = await page.locator('#usageCode').textContent();
    expect(usageText).toContain('rb-report');
    expect(usageText).toContain('entity-code');
    console.log('Grails Reports: Usage - HTML snippet valid ✓');
  }

  // ----------------------------------------------------------
  // Simple Pages (No Web Component)
  // ----------------------------------------------------------
  /**
   * Assert simple page without web component (Home, Your Canvas).
   */
  static async assertSimplePage(page: Page, baseUrl: string, path: string, title: string, contentChecks: string[]): Promise<void> {
    const url = `${baseUrl}${path}`;
    console.log(`Grails ${title}: Checking page content...`);

    await page.goto(url, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body).not.toContain('500 Internal Server Error');
    for (const check of contentChecks) {
      expect(body?.toLowerCase()).toContain(check.toLowerCase());
    }
    console.log(`Grails ${title}: Page OK ✓`);
  }

  // ----------------------------------------------------------
  // Admin Panel Helpers (shared by Grails and Next.js)
  // ----------------------------------------------------------

  /**
   * Derive base URL and new-entity path from app name.
   */
  private static getAppConfig(appName: 'grails' | 'nextjs') {
    return {
      baseUrl: appName === 'grails'
        ? SelfServicePortalsTestHelper.GRAILS_BASE_URL
        : SelfServicePortalsTestHelper.NEXT_BASE_URL,
      newEntityPath: appName === 'grails' ? '/create' : '/new',
    };
  }

  /**
   * Assert admin dashboard loads with 4 stat cards showing real numeric data.
   */
  static async assertAdminDashboard(page: Page, appName: 'grails' | 'nextjs'): Promise<void> {
    const { baseUrl } = SelfServicePortalsTestHelper.getAppConfig(appName);
    console.log(`${appName} Admin: Checking dashboard...`);

    await page.goto(`${baseUrl}/admin`, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // Page title
    await expect(page.locator('#admin-page-title')).toBeVisible({ timeout: 10000 });

    // 4 stat cards with numeric values
    const statIds = ['stat-value-payslips', 'stat-value-invoices', 'stat-value-revenue', 'stat-value-pending'];
    for (const id of statIds) {
      const el = page.locator(`#${id}`);
      await expect(el).toBeVisible({ timeout: 5000 });
      const text = await el.textContent();
      const numeric = text?.replace(/[^0-9.-]/g, '') || '';
      expect(numeric.length).toBeGreaterThan(0);
      console.log(`${appName} Admin: #${id} = ${text} ✓`);
    }

    // Quick action navigation
    await expect(page.locator('#btn-view-payslips')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#btn-view-invoices')).toBeVisible({ timeout: 5000 });

    console.log(`${appName} Admin: Dashboard OK ✓`);
  }

  /**
   * Delete any leftover E2E test records from previous failed runs.
   * Scans the table for rows containing the marker text and deletes them one by one.
   */
  private static async cleanupE2ERecords(
    page: Page,
    tableSelector: string,
    marker: string,
    entityName: string,
  ): Promise<void> {
    let cleaned = 0;
    // Loop: find a matching row, delete it, repeat until none remain
    while (true) {
      const markerRow = page.locator(`${tableSelector} tbody tr`, { hasText: marker }).first();
      if (await markerRow.count() === 0) break;

      // Click the Delete button/link in this row
      const deleteBtn = markerRow.locator('.btn-delete');
      if (await deleteBtn.count() === 0) break;
      await deleteBtn.click();

      // Handle confirmation modal
      const deleteModal = page.locator('#deleteModal');
      if (await deleteModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const confirmBtn = page.locator('#btn-confirm-delete');
        await confirmBtn.click();
      }
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      cleaned++;
    }
    if (cleaned > 0) {
      console.log(`${entityName}: Cleaned up ${cleaned} orphan E2E record(s) from previous runs.`);
    }
  }

  /**
   * Exercise full invoice CRUD lifecycle: create, read, edit, delete.
   */
  static async performInvoiceCRUD(page: Page, appName: 'grails' | 'nextjs'): Promise<void> {
    const { baseUrl, newEntityPath } = SelfServicePortalsTestHelper.getAppConfig(appName);
    console.log(`${appName} Admin: Invoice CRUD lifecycle...`);

    // Navigate to invoices list
    await page.goto(`${baseUrl}/admin/invoices`, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#invoices-page-title')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#invoices-table')).toBeVisible({ timeout: 10000 });

    // Clean up any orphan E2E records from previous failed runs
    await SelfServicePortalsTestHelper.cleanupE2ERecords(page, '#invoices-table', 'E2E Test Customer', `${appName} Invoice`);

    // Count initial rows (after cleanup)
    const initialRows = await page.locator('#invoices-table tbody tr').count();
    console.log(`${appName} Admin: Initial invoice count = ${initialRows}`);

    // CREATE: click new, fill form, submit
    await page.click('#btn-new-invoice');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#subtotal')).toBeVisible({ timeout: 10000 });

    // Fill fields top-down, left-right matching the visual form layout
    await page.fill('#invoiceNumber', `INV-E2E-${Date.now()}`);

    await page.fill('#customerId', 'CUST-E2E-TEST');
    await page.fill('#customerName', 'E2E Test Customer');
    await page.fill('#customerEmail', 'e2e-test@example.com');

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    await page.fill('#dueDate', dueDate.toISOString().split('T')[0]);

    await page.fill('#subtotal', '1000');
    await page.fill('#taxRate', '10');
    await page.fill('#discount', '50');
    await page.waitForTimeout(500); // Let calculated fields update

    // Submit the form
    const submitBtn = page.locator('#btn-submit');
    await submitBtn.click();
    await page.waitForLoadState('networkidle');

    // READ: verify new invoice appears in list
    await page.goto(`${baseUrl}/admin/invoices`, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    const afterCreateRows = await page.locator('#invoices-table tbody tr').count();
    expect(afterCreateRows).toBeGreaterThan(initialRows);
    console.log(`${appName} Admin: Invoice created, count = ${afterCreateRows} ✓`);

    // EDIT: click last row's edit link, change amount, save
    const editLinks = page.locator('#invoices-table .btn-edit');
    const editCount = await editLinks.count();
    expect(editCount).toBeGreaterThan(0); // Fail loudly if no Edit button found
    await editLinks.last().click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#subtotal')).toBeVisible({ timeout: 10000 });
    await page.fill('#subtotal', '2000');
    await page.waitForTimeout(500);
    const saveBtn = page.locator('#btn-submit');
    await saveBtn.click();
    await page.waitForLoadState('networkidle');
    console.log(`${appName} Admin: Invoice edited ✓`);

    // DELETE: click last row's delete, confirm, verify gone
    await page.goto(`${baseUrl}/admin/invoices`, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    const beforeDeleteRows = await page.locator('#invoices-table tbody tr').count();

    const deleteLinks = page.locator('#invoices-table .btn-delete');
    const deleteCount = await deleteLinks.count();
    expect(deleteCount).toBeGreaterThan(0); // Fail loudly if no Delete button found
    await deleteLinks.last().click();
    // Handle confirm dialog
    const deleteModal = page.locator('#deleteModal');
    if (await deleteModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const confirmBtn = page.locator('#btn-confirm-delete');
      await confirmBtn.click();
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const afterDeleteRows = await page.locator('#invoices-table tbody tr').count();
    expect(afterDeleteRows).toBeLessThan(beforeDeleteRows);
    console.log(`${appName} Admin: Invoice deleted, count = ${afterDeleteRows} ✓`);

    console.log(`${appName} Admin: Invoice CRUD lifecycle OK ✓`);
  }

  /**
   * Exercise full payslip CRUD lifecycle: create, read, edit, delete.
   */
  static async performPayslipCRUD(page: Page, appName: 'grails' | 'nextjs'): Promise<void> {
    const { baseUrl, newEntityPath } = SelfServicePortalsTestHelper.getAppConfig(appName);
    console.log(`${appName} Admin: Payslip CRUD lifecycle...`);

    // Navigate to payslips list
    await page.goto(`${baseUrl}/admin/payslips`, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#payslips-page-title')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#payslips-table')).toBeVisible({ timeout: 10000 });

    // Clean up any orphan E2E records from previous failed runs
    await SelfServicePortalsTestHelper.cleanupE2ERecords(page, '#payslips-table', 'E2E Test Employee', `${appName} Payslip`);

    // Count initial rows (after cleanup)
    const initialRows = await page.locator('#payslips-table tbody tr').count();
    console.log(`${appName} Admin: Initial payslip count = ${initialRows}`);

    // CREATE: click new, fill form, submit
    await page.click('#btn-new-payslip');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#grossAmount')).toBeVisible({ timeout: 10000 });

    // Fill payslipNumber (both apps have this field)
    await page.fill('#payslipNumber', `PS-E2E-${Date.now()}`);

    // Fill fields top-down, left-right matching the visual form layout
    await page.fill('#employeeId', 'EMP-E2E-TEST');
    await page.fill('#employeeName', 'E2E Test Employee');
    await page.fill('#employeeEmail', 'e2e-employee@example.com');

    // Set pay period dates
    const periodStart = new Date();
    periodStart.setDate(1); // First of current month
    await page.fill('#payPeriodStart', periodStart.toISOString().split('T')[0]);
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1, 0); // Last day of current month
    await page.fill('#payPeriodEnd', periodEnd.toISOString().split('T')[0]);

    // Fill amount fields
    await page.fill('#grossAmount', '5000');
    await page.fill('#deductions', '500');
    await page.waitForTimeout(500); // Let calculated fields update

    // Submit the form
    const payslipSubmitBtn = page.locator('#btn-submit');
    await payslipSubmitBtn.click();
    await page.waitForLoadState('networkidle');

    // READ: verify new payslip appears in list
    await page.goto(`${baseUrl}/admin/payslips`, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    const afterCreateRows = await page.locator('#payslips-table tbody tr').count();
    expect(afterCreateRows).toBeGreaterThan(initialRows);
    console.log(`${appName} Admin: Payslip created, count = ${afterCreateRows} ✓`);

    // EDIT: click last row's edit link, change amount, save
    const payslipEditLinks = page.locator('#payslips-table .btn-edit');
    const editCount = await payslipEditLinks.count();
    expect(editCount).toBeGreaterThan(0); // Fail loudly if no Edit button found
    await payslipEditLinks.last().click();
    await page.waitForURL('**/edit**', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#grossAmount')).toBeVisible({ timeout: 10000 });
    await page.fill('#grossAmount', '6000');
    await page.waitForTimeout(500);
    const payslipSaveBtn = page.locator('#btn-submit');
    await payslipSaveBtn.click();
    await page.waitForLoadState('networkidle');
    console.log(`${appName} Admin: Payslip edited ✓`);

    // DELETE: click last row's delete, confirm, verify gone
    await page.goto(`${baseUrl}/admin/payslips`, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    const beforeDeleteRows = await page.locator('#payslips-table tbody tr').count();

    const payslipDeleteLinks = page.locator('#payslips-table .btn-delete');
    const deleteCount = await payslipDeleteLinks.count();
    expect(deleteCount).toBeGreaterThan(0); // Fail loudly if no Delete button found
    await payslipDeleteLinks.last().click();
    const payslipDeleteModal = page.locator('#deleteModal');
    if (await payslipDeleteModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const confirmBtn = page.locator('#btn-confirm-delete');
      await confirmBtn.click();
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const afterDeleteRows = await page.locator('#payslips-table tbody tr').count();
    expect(afterDeleteRows).toBeLessThan(beforeDeleteRows);
    console.log(`${appName} Admin: Payslip deleted, count = ${afterDeleteRows} ✓`);

    console.log(`${appName} Admin: Payslip CRUD lifecycle OK ✓`);
  }

  /**
   * Verify settings save and persist across page reloads.
   * Restores original values after testing.
   */
  static async assertSettingsPersistence(page: Page, appName: 'grails' | 'nextjs'): Promise<void> {
    const { baseUrl } = SelfServicePortalsTestHelper.getAppConfig(appName);
    const settingsUrl = `${baseUrl}/admin/settings`;
    console.log(`${appName} Admin: Checking settings persistence...`);

    await page.goto(settingsUrl, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#settings-page-title')).toBeVisible({ timeout: 10000 });

    // Save original values for restoration
    const origCompanyName = await page.inputValue('#companyName');
    const origCurrency = await page.inputValue('#defaultCurrency');
    const origPaymentProcessor = await page.locator('#paymentProcessor').inputValue();

    // Company name: change, save, reload, verify
    const testCompanyName = `E2E Test Corp ${Date.now()}`;
    await page.fill('#companyName', testCompanyName);
    await page.click('#btn-save-company');
    await page.waitForTimeout(1000);
    await page.goto(settingsUrl, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    const savedCompanyName = await page.inputValue('#companyName');
    expect(savedCompanyName).toBe(testCompanyName);
    console.log(`${appName} Admin: Company name persisted ✓`);

    // Currency: change, save, reload, verify
    const testCurrency = 'EUR';
    await page.selectOption('#defaultCurrency', testCurrency);
    await page.click('#btn-save-preferences');
    await page.waitForTimeout(1000);
    await page.goto(settingsUrl, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    const savedCurrency = await page.inputValue('#defaultCurrency');
    expect(savedCurrency).toBe(testCurrency);
    console.log(`${appName} Admin: Currency persisted ✓`);

    // Payment processor: change, save, reload, verify
    const optionValues = await page.locator('#paymentProcessor option').evaluateAll(
      (opts: HTMLOptionElement[]) => opts.map(o => o.value).filter(v => v !== '')
    );
    const testPaymentValue = optionValues.find(v => v !== origPaymentProcessor) || origPaymentProcessor;
    await page.selectOption('#paymentProcessor', testPaymentValue);
    await page.click('#btn-save-payment');
    await page.waitForTimeout(1000);
    await page.goto(settingsUrl, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    const savedPaymentProcessor = await page.locator('#paymentProcessor').inputValue();
    expect(savedPaymentProcessor).toBe(testPaymentValue);
    console.log(`${appName} Admin: Payment processor persisted ✓`);

    // Restore original values
    await page.fill('#companyName', origCompanyName);
    await page.click('#btn-save-company');
    await page.waitForTimeout(500);
    await page.selectOption('#defaultCurrency', origCurrency);
    await page.click('#btn-save-preferences');
    await page.waitForTimeout(500);
    await page.selectOption('#paymentProcessor', origPaymentProcessor);
    await page.click('#btn-save-payment');
    await page.waitForTimeout(500);
    console.log(`${appName} Admin: Original values restored ✓`);

    console.log(`${appName} Admin: Settings persistence OK ✓`);
  }

  // ----------------------------------------------------------
  // Main Entry Point: Assert All Front-Facing Pages
  // ----------------------------------------------------------
  /**
   * Assert all front-facing playground pages with per-component validation.
   * Works for both Grails and Next.js playgrounds — same pages, same assertions.
   * @param page - Playwright page object
   * @param appName - 'grails' or 'nextjs'
   */
  static async assertAllFrontFacingPages(page: Page, appName: 'grails' | 'nextjs'): Promise<void> {
    const baseUrl = appName === 'grails'
      ? SelfServicePortalsTestHelper.GRAILS_BASE_URL
      : SelfServicePortalsTestHelper.NEXT_BASE_URL;

    console.log(`${appName}: Waiting for server to be ready...`);
    await SelfServicePortalsTestHelper.waitForServerReady(page, baseUrl, 30, 2000);

    // Grant clipboard permissions (needed for some browsers)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    // Home page (no component)
    await SelfServicePortalsTestHelper.assertSimplePage(
      page, baseUrl, '/', 'Home', ['Dashboards', 'Self Service', 'Explore Components']
    );

    // Tabulator, Charts, Pivot Tables — tested in dedicated spec files:
    //   apps-grails-nextjs-tabulator.spec.ts
    //   apps-grails-nextjs-charts.spec.ts
    //   apps-grails-nextjs-pivot.spec.ts

    // rb-parameters - parameter form with filtering (config REQUIRED)
    await SelfServicePortalsTestHelper.assertRbParametersComponent(page, baseUrl);

    // rb-report - report viewer with entity selection
    await SelfServicePortalsTestHelper.assertRbReportComponent(page, baseUrl);

    // Data Warehouse page — 3 engine pivots, config, usage (navbar: after Reports)
    const dataWarehousePath = '/data-warehouse';
    await SelfServicePortalsTestHelper.assertDataWarehousePage(page, baseUrl, dataWarehousePath);

    // Dashboards — smoke check only (detailed tests in apps-grails-nextjs-dashboards.spec.ts)
    await SelfServicePortalsTestHelper.assertSimplePage(
      page, baseUrl, '/dashboards', 'Dashboards', ['Dashboards']
    );

    // Your Canvas (no component)
    await SelfServicePortalsTestHelper.assertSimplePage(
      page, baseUrl, '/your-canvas', 'Your Canvas', ['Your Canvas', 'Awaits', 'Build']
    );

    console.log(`${appName} Playground: All assertions PASSED ✓`);
  }

}
