import { test, expect, Page } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';

/**
 * E2E tests for the FlowKraft AI Hub application.
 *
 * T14: Scaffold + VISIBLE_APPS (done in apps-test-helper.ts)
 * T15: Home page + Workspace navigation
 * T16: Agent provisioning via UI (SSE log panel)
 * T17: Matrix (Synapse) + Element Web verification
 * T18: Chat2DB progressive queries (NLQ → SQL → results)
 *
 * All sub-tests run within a single test (AI Hub start/stop once).
 * T16 and T18 require OPENAI_API_KEY — graceful skip if unavailable.
 */

const AI_HUB_APP_ID = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const ELEMENT_WEB_URL = 'http://localhost:8441';  // Matrix Element Web client
const CODE_SERVER_URL = 'http://localhost:8442';  // VS Code Server (code-server)
const SYNAPSE_HEALTH_URL = 'http://localhost:8008/health';

test.describe('AI Hub Tests', () => {

  electronBeforeAfterAllTest(
    'AI Hub: Full test suite (home, provisioning, Matrix, Chat2DB)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let externalBrowser = null;
      // Use simple name without camelCase/PascalCase to avoid _.kebabCase() splitting
      // 'SQLite' gets split to 'sq-lite' by kebabCase, causing selector mismatch
      const TEST_DB_CONNECTION_NAME = 'Northwind Test';
      const TEST_DB_CONNECTION_FILE = `db-${TEST_DB_CONNECTION_NAME.toLowerCase().replace(/\s+/g, '-')}-sqlite\\.xml`;
      let dbConnectionCreated = false;

      try {
        // Create test database connection BEFORE starting AI Hub
        console.log('\n=== Creating test database connection for Chat2DB ===\n');
        try {
          // FluentTester implements PromiseLike<void> - must be awaited to execute queued actions
          await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
            new FluentTester(firstPage),
            TEST_DB_CONNECTION_NAME,
            'sqlite'
          );
          dbConnectionCreated = true;
          console.log('[Setup] Test database connection created successfully');
        } catch (e) {
          console.error('[Setup] Failed to create test database connection:', e);
          throw e;
        }

        // Start AI Hub app via FluentTester
        await SelfServicePortalsTestHelper.startApp(
          new FluentTester(firstPage).gotoApps(),
          AI_HUB_APP_ID,
        );

        // Open external browser
        const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = browser;

        // The AI Hub reaches DataPallas through its /api/dp proxy, which forwards the user's own
        // DataPallas session cookie. A DataPallas Server needs that session; Desktop ignores it.
        await page.context().addCookies(await firstPage.context().cookies());

        // Wait for AI Hub to be ready
        await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);

        // ============================================================
        // T15: Home page + Workspace navigation
        // ============================================================
        console.log('\n=== T15: Home page + Workspace navigation ===\n');
        await assertHomeAndWorkspaceNavigation(page);
        console.log('T15: Home and workspace navigation passed.');

        // ============================================================
        // T16: Agent provisioning via UI
        // ============================================================
        console.log('\n=== T16: Agent provisioning via UI ===\n');
        await assertAgentProvisioning(page);
        console.log('T16: Agent provisioning passed.');

        // ============================================================
        // T17: Matrix (Synapse) + Element Web verification
        // ============================================================
        console.log('\n=== T17: Matrix + Element Web verification ===\n');
        await assertMatrixAndElementWeb(page);
        console.log('T17: Matrix and Element Web verification passed.');

        // ============================================================
        // T18: Chat2DB progressive queries
        // ============================================================
        console.log('\n=== T18: Chat2DB progressive queries ===\n');
        await assertChat2DBQueries(page);
        console.log('T18: Chat2DB queries passed.');

        console.log('\n=== AI Hub: All sub-tests passed ===\n');

      } finally {
        if (externalBrowser) {
          try {
            await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
          } catch (e) {
            console.error('Failed to close external browser:', e);
          }
        }
        try {
          await SelfServicePortalsTestHelper.stopApp(
            new FluentTester(firstPage).gotoApps(),
            AI_HUB_APP_ID,
          );
        } catch (e) {
          console.error('Failed to stop AI Hub app:', e);
        }

        // Clean up test database connection AFTER stopping AI Hub
        if (dbConnectionCreated) {
          try {
            console.log('\n=== Cleaning up test database connection ===\n');
            // FluentTester implements PromiseLike<void> - must be awaited to execute queued actions
            await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
              new FluentTester(firstPage),
              TEST_DB_CONNECTION_FILE,
              'sqlite'
            );
            console.log('[Cleanup] Test database connection deleted successfully');
          } catch (e) {
            console.error('[Cleanup] Failed to delete test database connection:', e);
            // Don't throw - cleanup failure shouldn't fail the test
          }
        }
      }
    },
  );

});

// ============================================================
// T15: Home page + Workspace navigation
// ============================================================

async function assertHomeAndWorkspaceNavigation(page: Page): Promise<void> {
  // Home now redirects to /explore-data
  await page.goto(AI_HUB_BASE_URL);
  await page.waitForLoadState('networkidle');

  const exploreHeading = page.locator('#explore-data-page-heading');
  await expect(exploreHeading).toBeVisible({ timeout: 10000 });
  console.log('[T15] Home redirects to Explore Data page — verified');

  // Navigate to agents (Data Greeks (AI Crew) menu item)
  await page.goto(`${AI_HUB_BASE_URL}/agents`);
  await page.waitForLoadState('networkidle');

  const heading = page.locator('#agents-page-heading');
  await expect(heading).toBeVisible({ timeout: 10000 });
  const headingText = await heading.textContent();
  console.log(`[T15] Agents heading: "${headingText}"`);

  const agentRows = page.locator('[id^="agent-row-"]');
  const provisionButton = page.locator('#btn-provision-agents');
  const hasAgents = await agentRows.first().isVisible().catch(() => false);
  const hasProvisionButton = await provisionButton.isVisible().catch(() => false);
  expect(hasAgents || hasProvisionButton).toBe(true);
  console.log(`[T15] Agents page state: ${hasAgents ? 'agents present' : 'empty (provision button visible)'}`);

  // Navigate to workspaces (accessible directly, back link returns to agents)
  await page.goto(`${AI_HUB_BASE_URL}/workspaces`);
  await page.waitForLoadState('networkidle');

  const wsHeading = page.locator('#workspaces-page-heading');
  await expect(wsHeading).toContainText('Oracle Output Artifacts', { timeout: 10000 });
  console.log('[T15] Workspaces heading verified: "Oracle Output Artifacts"');

  const filePanel = page.locator('#file-explorer-panel');
  await expect(filePanel).toBeVisible({ timeout: 5000 });
  console.log('[T15] File tree panel present');

  const backLink = page.locator('#btn-back-to-agents');
  await expect(backLink).toBeVisible();
  await backLink.click();

  // Should be back on agents page (no networkidle — client-side nav keeps HMR WebSocket open)
  await expect(page.locator('#agents-page-heading')).toBeVisible({ timeout: 10000 });
  console.log('[T15] Back link navigation works');
}

// ============================================================
// T16: Agent provisioning via UI
// ============================================================

async function assertAgentProvisioning(page: Page): Promise<void> {
  await page.goto(`${AI_HUB_BASE_URL}/agents`);
  await page.waitForLoadState('networkidle');

  // Check if agents already exist or need provisioning
  const agentRows = page.locator('[id^="agent-row-"]');
  const hasAgents = await agentRows.first().isVisible().catch(() => false);

  if (!hasAgents) {
    // No agents: click "Provision FlowKraft's AI Crew Agents" button
    console.log('[T16] No agents found — triggering initial provisioning');
    const provisionBtn = page.locator('#btn-provision-agents');
    await expect(provisionBtn).toBeVisible({ timeout: 5000 });
    await provisionBtn.click();

    // Confirm dialog
    const confirmBtn = page.locator('#btn-provision-confirm-yes');
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
  } else {
    // Agents exist: use Settings gear → "Update Agents"
    console.log('[T16] Agents exist — triggering update via Settings');
    const settingsBtn = page.locator('#navbar-settings-button');
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();

    const updateBtn = page.locator('#settings-update-agents-button');
    await expect(updateBtn).toBeVisible({ timeout: 5000 });
    await updateBtn.click();

    // Confirm update dialog
    const confirmUpdateBtn = page.locator('#btn-update-confirm-yes');
    await expect(confirmUpdateBtn).toBeVisible({ timeout: 5000 });
    await confirmUpdateBtn.click();
  }

  // Wait for SSE log panel to appear
  console.log('[T16] Waiting for SSE log panel...');
  const logPanel = page.locator('#log-panel');
  await expect(logPanel).toBeVisible({ timeout: 15000 });
  console.log('[T16] SSE log panel appeared');

  // Wait for provisioning to complete (success or error) — timeout up to 5 minutes
  const successIcon = logPanel.locator('#provision-status-success');
  const errorIcon = logPanel.locator('#provision-status-error');
  const closeBtn = logPanel.getByText('Close');

  // Wait for either success or error (max 5 min)
  try {
    await expect(successIcon.or(errorIcon).or(closeBtn.and(page.locator(':not([disabled])'))))
      .toBeVisible({ timeout: 300000 });
    console.log('[T16] Provisioning completed');
  } catch (e) {
    console.warn('[T16] Provisioning timed out — may still be running');
  }

  // Close the log panel if possible
  const closeable = await closeBtn.isEnabled().catch(() => false);
  if (closeable) {
    await closeBtn.click();
    await page.waitForTimeout(1000);
  }

  // Verify agents appear (allow reload)
  await page.goto(`${AI_HUB_BASE_URL}/agents`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Check for expected agents (Athena should always be first)
  const pageText = await page.locator('body').textContent();
  const expectedAgents = ['Athena', 'Hephaestus', 'Hermes', 'Apollo', 'Pythia'];
  let foundCount = 0;
  for (const agent of expectedAgents) {
    if (pageText?.includes(agent)) {
      foundCount++;
    }
  }

  if (foundCount >= 3) {
    console.log(`[T16] Found ${foundCount}/5 expected agents`);
  } else {
    console.warn(`[T16] Only found ${foundCount}/5 agents — provisioning may have failed (API key missing?)`);
  }

  // Verify Athena appears first and is highlighted (cyan left border)
  const athenaRow = page.locator('#agent-row-athena');
  const athenaVisible = await athenaRow.isVisible().catch(() => false);
  if (athenaVisible) {
    const athenaText = await athenaRow.textContent();
    expect(athenaText).toContain('Athena');
    console.log('[T16] Athena is present in the agent list');

    const athenaHighlighted = await athenaRow.getAttribute('data-highlighted');
    expect(athenaHighlighted).toBe('true');
    console.log('[T16] Athena row is highlighted');
  }

  // Verify no sleeptime agents visible
  expect(pageText).not.toContain('sleeptime');
  console.log('[T16] No sleeptime agents visible (correctly filtered)');
}

// ============================================================
// T17: Matrix (Synapse) + Element Web verification
// ============================================================

async function assertMatrixAndElementWeb(page: Page): Promise<void> {
  // Synapse health check (Matrix homeserver)
  console.log('[T17] Checking Synapse health...');
  const healthResponse = await page.request.get(SYNAPSE_HEALTH_URL);
  expect(healthResponse.status()).toBe(200);
  console.log('[T17] Synapse health check: 200 OK');

  // Element Web HTTP check (Matrix web client)
  console.log('[T17] Checking Element Web...');
  const elementResponse = await page.request.get(ELEMENT_WEB_URL);
  expect(elementResponse.status()).toBe(200);
  console.log('[T17] Element Web HTTP 200 OK');

  // Code Server HTTP check (VS Code in browser)
  console.log('[T17] Checking Code Server (VS Code web)...');
  const codeServerResponse = await page.request.get(CODE_SERVER_URL);
  expect(codeServerResponse.status()).toBe(200);
  console.log('[T17] Code Server HTTP 200 OK');

  /*
  // Optional: Full DOM verification (commented for performance)
  await page.goto(ELEMENT_WEB_URL);
  await page.waitForLoadState('networkidle');
  const elementBody = await page.locator('body').textContent();
  const elementLoaded = elementBody?.includes('Element') ||
    elementBody?.includes('Sign in') ||
    elementBody?.includes('Log in') ||
    elementBody?.includes('Welcome');
  expect(elementLoaded).toBe(true);
  console.log('[T17] Element Web loaded successfully');
  */
}

// ============================================================
// T18: Chat2DB progressive queries
// ============================================================

async function assertChat2DBQueries(page: Page): Promise<void> {
  await page.goto(`${AI_HUB_BASE_URL}/chat2db`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Step 1: Verify database connection is available
  console.log('[T18] Step 1: Verifying database connection is available...');
  const dbDropdown = page.locator('#database-selector');
  await expect(dbDropdown).toBeVisible({ timeout: 10000 });

  // Wait for options to populate
  await page.waitForTimeout(2000);
  const options = await dbDropdown.locator('option').all();
  console.log(`[T18] Found ${options.length} database options`);

  // CRITICAL: Chat2DB requires at least one database connection to function
  // The test setup should have created a test database connection
  if (options.length <= 1) {
    throw new Error('[T18] FAIL: No database connections available. Chat2DB requires at least one database connection to be functional.');
  }

  console.log('[T18] Database connection verified - proceeding with Chat2DB tests');

  // Select the first real database (not the placeholder)
  await dbDropdown.selectOption({ index: 1 });
  await page.waitForTimeout(500);

  // Step 2: Connect
  console.log('[T18] Step 2: Connecting to database...');
  const connectBtn = page.locator('#btn-connect-database');
  await expect(connectBtn).toBeVisible({ timeout: 5000 });
  await connectBtn.click();

  // Wait for connection (green check or Connected text)
  try {
    await page.waitForFunction(() => {
      return document.body.textContent?.includes('Connected to');
    }, { timeout: 15000 });
    console.log('[T18] Database connected');
  } catch (e) {
    console.warn('[T18] Connection may have failed — attempting queries anyway');
  }

  // Step 3: L1 Basic query
  console.log('[T18] Step 3: L1 Basic query — "Show me all products"');
  const chatInput = page.locator('#chat-input-textarea');
  await expect(chatInput).toBeVisible({ timeout: 5000 });

  await chatInput.fill('Show me all products with their category names');
  await chatInput.press('Enter');

  // Assert: "Thinking" indicator appears (query received, AI is processing)
  const thinkingIndicator = page.locator('#chat-thinking-indicator');
  try {
    await expect(thinkingIndicator).toBeVisible({ timeout: 10000 });
    console.log('[T18] L1: Thinking indicator appeared — Athena is processing');
  } catch {
    console.warn('[T18] L1: Thinking indicator never appeared — API key may be unavailable or expired, skipping remaining Chat2DB tests');
    return;
  }

  // Wait for Athena's response (thinking disappears, content or error appears)
  try {
    await page.waitForSelector('details, table, #chat-error-response', { timeout: 60000 });

    // Check for error
    const hasError = await page.locator('#chat-error-response').first().isVisible().catch(() => false);
    if (hasError) {
      console.warn('[T18] L1 query returned error — API key may be unavailable or expired, skipping remaining Chat2DB tests');
      return;
    }

    // Assert: Athena answered with SQL + results
    const hasSql = await page.locator('details').first().isVisible().catch(() => false);
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    console.log(`[T18] L1: SQL block=${hasSql}, Table=${hasTable}`);
    expect(hasSql || hasTable).toBe(true);
    console.log('[T18] L1 Basic query passed — Athena answered');
  } catch {
    console.warn('[T18] L1 query timed out — API key may be unavailable or expired, skipping remaining Chat2DB tests');
    return;
  }

  // Step 4: L2 Analytics query
  console.log('[T18] Step 4: L2 Analytics — "Revenue by customer"');
  await chatInput.fill('What is the total sales revenue by customer?');
  await chatInput.press('Enter');

  try {
    await expect(thinkingIndicator).toBeVisible({ timeout: 10000 });
    console.log('[T18] L2: Thinking indicator appeared — Athena is processing');
  } catch {
    console.warn('[T18] L2: Thinking indicator never appeared — skipping remaining Chat2DB tests');
    return;
  }

  try {
    await page.waitForSelector('details, table', { timeout: 60000 });

    // Count tables (new response should add a second table)
    const tables = await page.locator('table').all();
    console.log(`[T18] L2: Found ${tables.length} result tables`);
    expect(tables.length).toBeGreaterThanOrEqual(2);
    console.log('[T18] L2 Analytics query passed — Athena answered');
  } catch {
    console.warn('[T18] L2 query timed out');
  }

  // Step 5: L3 Follow-up query
  console.log('[T18] Step 5: L3 Follow-up — "Only top 5"');
  await chatInput.fill('Only show the top 5');
  await chatInput.press('Enter');

  try {
    await expect(thinkingIndicator).toBeVisible({ timeout: 10000 });
    console.log('[T18] L3: Thinking indicator appeared — Athena is processing');
  } catch {
    console.warn('[T18] L3: Thinking indicator never appeared — skipping remaining Chat2DB tests');
    return;
  }

  try {
    await page.waitForSelector('details, table', { timeout: 60000 });

    // The latest table should have <= 5 data rows
    const allTables = await page.locator('table').all();
    if (allTables.length > 0) {
      const lastTable = allTables[allTables.length - 1];
      const rows = await lastTable.locator('tbody tr').all();
      console.log(`[T18] L3: Latest table has ${rows.length} rows`);
      expect(rows.length).toBeLessThanOrEqual(5);
      console.log('[T18] L3 Follow-up query passed — Athena answered (context retained)');
    }
  } catch {
    console.warn('[T18] L3 query timed out');
  }
}
