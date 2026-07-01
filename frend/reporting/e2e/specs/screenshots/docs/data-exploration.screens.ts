// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — Data Exploration docs (data-exploration/index.mdx, canvas.mdx,
//               chat2db-ai.mdx)  — Chat2DB AI flow against the bundled Northwind
// ═══════════════════════════════════════════════════════════════════════════════
//
// This spec captures the screenshots the three Data-Exploration docs need that are
// NOT already produced elsewhere — i.e. the Chat2DB AI flow. The canvas shots are
// already captured by canvas.screens.ts and are only CROSS-REFERENCED here (see the
// "CANVAS CROSS-REFS" comment block in BLOCK A).
//
// ── FULL INVENTORY (which spec owns which shot) ─────────────────────────────────
//
//   canvas.mdx + index.mdx — Explore Data Canvas (ALREADY captured by canvas.screens.ts):
//     300_05_apps-launch.png · 300_10_canvas-empty.png · 300_20_drop-cube-widget.png ·
//     300_00_explore-data-canvas-overview.png
//       → run `canvas.screens.ts` for these (do NOT duplicate here).
//
//   chat2db-ai.mdx — Chat2DB setup screens (THIS spec, BLOCK A) under artificial-intelligence/:
//     000_00 / 000_01 goto-chat2db-app · 000_02 start-chat2db-app · 000_03 api_key ·
//     000_05 update-agents · 000_10 provisioning-complete · 000_20 flowkrafts-ai-crew ·
//     000_40 chat2db-sqlite-test-db-connection · 000_50 chat2db-sqlite-db-schema
//
//   chat2db-ai.mdx + index.mdx — Chat2DB conversations (THIS spec, BLOCK B):
//     The 11 <ChatDemo variant="explore-*"> turns are currently inline React/SVG
//     reconstructions. BLOCK B drives the REAL Chat2DB app (Athena) and captures each
//     turn as a real screenshot (250_*). Two of them are the index.mdx heroes that
//     already exist as PNGs: 250_00_chat2db-er-diagram-light, 250_05_chat2db-pie-chart-light.
//
// ── DETERMINISM / WHY -dp ───────────────────────────────────────────────────────
// AI output is non-deterministic, so BLOCK B is a "run → review → commit" flow, NOT
// a CI-idempotent capture like the others. Every shot is written with a `-dp` suffix
// (next to any existing original) so you compare/approve before dropping the suffix —
// same convention as samples.screens.ts / quickstart.screens.ts.
//
// ── z.ai (Athena's model) ───────────────────────────────────────────────────────
// Athena is provisioned through the AI Hub's "API Provider" form with a z.ai
// (GLM, OpenAI-compatible) key. Provide it via env at run time — NEVER hard-code it:
//     cross-env ZAI_API_KEY=<key> ZAI_MODEL=glm-4.6 ZAI_PROVIDER_ID=zai-credits ...
// (db_query stays OFF — Athena reasons over the schema only; the Chat2DB UI runs the
// SQL it writes against your connection, so results still render. That's the privacy
// model the doc describes.)
//
// HOW TO RUN (only this spec):
//   cd frend/reporting
//   # set E2E_SPEC="data-exploration.screens.ts" + ZAI_API_KEY/ZAI_MODEL in
//   # custom:start-server-and-e2e-electron-screens-grep, then:
//   npm run custom:start-server-and-e2e-electron-screens-grep
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, Browser, Page } from '@playwright/test';
import * as path from 'path';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotWithHighlights,
  hideToastsForScreenshots,
} from '../../../utils/docs-screenshot-helper';

// ── AI HUB ──────────────────────────────────────────────────────────────────────
const AI_HUB_APP_ID = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const CHAT2DB_URL = `${AI_HUB_BASE_URL}/chat2db`;
const AGENTS_URL = `${AI_HUB_BASE_URL}/agents`;

// ── OUTPUT DIRS ───────────────────────────────────────────────────────────────
// 000_* live under public/images/docs/artificial-intelligence/, the 250_* under
// public/images/docs/ (root).
const AI_DIR = path.join(DOCS_IMAGES_DIR, 'artificial-intelligence');

// ── z.ai PROVIDER (Athena's LLM) ────────────────────────────────────────────────
// Provider ids (lib/llm-providers.ts): 'zai' = Coding Plan (base
// https://api.z.ai/api/coding/paas/v4), 'zai-credits' = API Credits (base
// https://api.z.ai/api/paas/v4). Base URL is pre-filled+locked by the form, so we
// only choose the provider, paste the key, and pick the model.
const ZAI_PROVIDER_ID = process.env.ZAI_PROVIDER_ID || 'zai-credits';
const ZAI_MODEL = process.env.ZAI_MODEL || 'glm-4.6';
const ZAI_API_KEY = process.env.ZAI_API_KEY || ''; // ← supply at run time; empty = skip Block B

// Bundled Northwind SQLite connection name used for the Chat2DB story. We create a
// fresh one so the "Create Database Connection" + "Database Schema" shots (000_40 /
// 000_50) show the real user-facing create flow (mirrors apps-ai-hub.spec.ts).
const DB_CONNECTION_NAME = 'Northwind Test';
const DB_CONNECTION_FILE = `db-${DB_CONNECTION_NAME.toLowerCase().replace(/\s+/g, '-')}-sqlite\\.xml`;

const VIEWPORT = { width: 1500, height: 980 };

// Every shot is written next to its original as `<name>-dp.png` for review; drop the
// suffix once approved (samples.screens.ts / quickstart.screens.ts convention).
const dp = (base: string) => `${base}-dp.png`;

// ── THE CONVERSATION (the 11 <ChatDemo variant> turns, in order) ────────────────
// `capture` = output basename (root images/docs). The two index.mdx heroes keep
// their existing names (250_00 / 250_05). `reply` drives the per-turn wait. The
// session boundary (welcome-back) clears the chat first — Athena recalls via its
// persistent Letta memory, the "deliberately stopped and restarted" narrative.
interface Turn {
  variant: string;
  prompt: string;
  capture: string;
  reply: 'text' | 'diagram' | 'table' | 'chart';
  newSession?: boolean;
}

const CONVERSATION: Turn[] = [
  // ── Session 1 ──────────────────────────────────────────────────────────────
  { variant: 'explore-greeting', reply: 'text',
    prompt: 'Athena, good afternoon! Are you there?',
    capture: '250_10_chat2db-greeting-light' },
  { variant: 'explore-er-diagram', reply: 'diagram',
    prompt: 'Could you draw me an ER diagram of the Northwind database? I want to understand its structure.',
    capture: '250_00_chat2db-er-diagram-light' }, // index.mdx hero
  { variant: 'explore-top-customers', reply: 'table',
    prompt: "Nice, I see tables for Customers and Orders — can you show me our top 3 customers? Maybe I won't need to write any SQL myself.",
    capture: '250_20_chat2db-top-customers-light' },
  { variant: 'explore-session1-end', reply: 'text',
    prompt: 'Athena, you indeed know your stuff!',
    capture: '250_30_chat2db-session1-end-light' },
  // ── Session 2 (new session — Athena recalls from memory) ────────────────────
  { variant: 'explore-welcome-back', reply: 'text', newSession: true,
    prompt: "Athena, I'm back. Could you remind me what we were working on?",
    capture: '250_40_chat2db-welcome-back-light' },
  { variant: 'explore-pie-chart', reply: 'chart',
    prompt: "Right, I remember now — you showed the top 3 customers but without a chart. Was that because a chart doesn't make sense for only three rows, or because you can't create visualizations? Show me a pie chart for those top three customers.",
    capture: '250_05_chat2db-pie-chart-light' }, // index.mdx hero
  { variant: 'explore-virgil', reply: 'text',
    prompt: 'Wow! Athena, I like you more and more — my name is Virgil, did I tell you this before?',
    capture: '250_50_chat2db-virgil-light' },
  { variant: 'explore-ideas', reply: 'text',
    prompt: "I'd like to keep exploring the Northwind data, but I'm out of ideas. What else could we analyze or visualize?",
    capture: '250_60_chat2db-ideas-light' },
  { variant: 'explore-trends-fail', reply: 'table',
    prompt: 'Ok, let\'s try the first one — "Monthly Revenue Trends"',
    capture: '250_70_chat2db-trends-fail-light' },
  { variant: 'explore-trends-fix', reply: 'chart',
    prompt: 'Nope, the grouping didn\'t work — it shows "NaT" instead of actual dates. I think SQLite stores dates differently than you assumed. Check the existing DataPallas sample reports — they handle SQLite dates correctly and you could learn from them.',
    capture: '250_80_chat2db-trends-fix-light' },
  { variant: 'explore-final-goodbye', reply: 'text',
    prompt: 'I\'m done for today. Tomorrow, can you help me build a PRD for our new "Billing Portal" — automating bills delivery so we get paid faster?',
    capture: '250_90_chat2db-final-goodbye-light' },
];

electronBeforeAfterAllTest(
  'Data Exploration — Chat2DB setup + conversations (chat2db-ai.mdx + index.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let externalBrowser: Browser | null = null;
    let dbConnectionCreated = false;

    try {
      // ───────────────────────────────────────────────────────────────────────
      // BLOCK 0 — canvas.mdx walkthrough (captured by canvas.screens.ts, NOT here).
      // Listed as explicit steps so this file is a complete map of EVERY
      // Data-Exploration screenshot. canvas.screens.ts drives the same
      // flowkraft-data-canvas app at :8440/explore-data via the explore-data-test-helper
      // helpers (createFreshCanvas, addCubeToCanvas, selectCubeFields, …).
      // ───────────────────────────────────────────────────────────────────────
      //
      // STEP (canvas · Step 1 "Start the Canvas App and Launch It")
      //   300_05_apps-launch.png
      //   → run canvas.screens.ts ("Canvas — docs screenshots") to generate 300_05_apps-launch.png
      //
      // STEP (canvas · Step 1 "Launch → blank canvas")
      //   300_10_canvas-empty.png
      //   → run canvas.screens.ts to generate 300_10_canvas-empty.png
      //
      // STEP (canvas · Step 2 "Drop a Sample Cube")
      //   300_20_drop-cube-widget.png
      //   → run canvas.screens.ts to generate 300_20_drop-cube-widget.png
      //
      // STEP (canvas · Step 5 "Add a Second Widget"; also the index.mdx hero)
      //   300_00_explore-data-canvas-overview.png
      //   → run canvas.screens.ts to generate 300_00_explore-data-canvas-overview.png

      // ───────────────────────────────────────────────────────────────────────
      // BLOCK A — setup screens (000_*)
      // ───────────────────────────────────────────────────────────────────────

      // ── 000_40 / 000_50 — DataPallas (Electron): create the Northwind SQLite
      //    connection + view its schema. Mirrors apps-ai-hub.spec.ts setup. The
      //    create flow + schema tab are standard Connections-area screens; we drive
      //    them with the Connections helper and capture along the way.
      console.log('[A] Creating Northwind SQLite connection');
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage),
        DB_CONNECTION_NAME,
        'sqlite',
      );
      dbConnectionCreated = true;
      await hideToastsForScreenshots(firstPage);
      // Open the connection in edit mode, TEST it so the schema is fetched, then view
      // the Database Schema tab. Mirrors the create→edit→Test→schema flow in
      // connections.spec.ts EXACTLY — including the confirm dialog that Test pops for
      // ALL vendors, and using the schema-tab placeholder VANISHING as the success
      // signal (SQLite is file-based → it skips the server info/clear-logs dance).
      const connCode = `db-${DB_CONNECTION_NAME.toLowerCase().replace(/\s+/g, '-')}-sqlite`;
      await new FluentTester(firstPage)
        .gotoConnections()
        .waitOnElementToBecomeVisible(`#${connCode}\\.xml`)
        .clickAndSelectTableRow(`#${connCode}\\.xml`)
        .waitOnElementToBecomeEnabled('#btnEdit')
        .click('#btnEdit')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeEnabled('#dbConnectionName')             // modal fully loaded
        .waitOnInputToHaveValue('#dbConnectionName', DB_CONNECTION_NAME);
      // ── 000_40 — Connection Details tab (the SQLite Northwind connection config).
      await captureDocsScreenshot(firstPage, dp('000_40_chat2db-sqlite-test-db-connection'), AI_DIR);
      console.log(`[A] artificial-intelligence/${dp('000_40_chat2db-sqlite-test-db-connection')}`);
      // Test → confirm dialog (fires for all vendors) → schema tab. The placeholder
      // "To load the schema…" vanishing is the reliable success signal; the picklist
      // then renders. (Earlier this went straight to the schema tab without testing,
      // so the picklist never appeared → the run hung here.)
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnTestDbConnection')
        .click('#btnTestDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#tab-btn-databaseSchemaTab')
        .waitOnElementToBecomeInvisible(
          'span:has-text("To load the schema, please ensure your connection details are configured")',
        )
        .waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer');
      // ── 000_50 — Database Schema tab (the fetched Northwind tables).
      await captureDocsScreenshot(firstPage, dp('000_50_chat2db-sqlite-db-schema'), AI_DIR);
      console.log(`[A] artificial-intelligence/${dp('000_50_chat2db-sqlite-db-schema')}`);
      // Close the modal before navigating on.
      await new FluentTester(firstPage)
        .click('#btnCloseDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

      // ── 000_00 / 000_01 — DataPallas (Electron): the "Explore Data & Build
      //    Dashboards" tab where the Chat2DB / AI Hub app card lives (the entry
      //    point). Ring the tab + the app card + the Start button.
      await new FluentTester(firstPage)
        .gotoDataCanvas() // top menu → Processing → Explore Data tab
        .waitOnElementToBecomeVisible(`#appName_${AI_HUB_APP_ID}`);
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshotWithHighlights(firstPage, dp('000_00_goto-chat2db-app'), [
        { selector: '#tab-btn-cmsWebPortalTab', inset: true },
        `#appName_${AI_HUB_APP_ID}`,
        `#btnStartStop_${AI_HUB_APP_ID}`,
      ], AI_DIR);
      console.log(`[A] artificial-intelligence/${dp('000_00_goto-chat2db-app')}`);
      // 000_01 is a second framing of the same entry point — same tab, capture plain
      // (the doc shows two consecutive shots of reaching the app).
      await captureDocsScreenshot(firstPage, dp('000_01_goto-chat2db-app'), AI_DIR);
      console.log(`[A] artificial-intelligence/${dp('000_01_goto-chat2db-app')}`);

      // ── Start the AI Hub (boots the container; waits "running") ──────────────
      await SelfServicePortalsTestHelper.startApp(
        new FluentTester(firstPage),
        AI_HUB_APP_ID,
      );
      await new FluentTester(firstPage).waitOnElementToBecomeVisible(`#btnLaunch_${AI_HUB_APP_ID}`);
      await hideToastsForScreenshots(firstPage);
      // 000_02 — the running app card (Electron). The AI Hub's own Chat2DB tab is
      // captured from the browser below.
      await captureDocsScreenshot(firstPage, dp('000_02_start-chat2db-app'), AI_DIR);
      console.log(`[A] artificial-intelligence/${dp('000_02_start-chat2db-app')}`);

      // ── External browser → AI Hub (:8440) ───────────────────────────────────
      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, {
        viewport: VIEWPORT,
      });
      externalBrowser = ext.browser;
      const page = ext.page;
      await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);

      // ── Navigate to /agents FIRST — the ONLY page where the Settings dialog's
      //    provisioning listener is mounted (agents/page.tsx listens for the
      //    `trigger-update-agents` window event the navbar gear dispatches). On
      //    /explore-data the gear does nothing → the dialog never opens. THAT was the
      //    hang. apps-ai-hub.spec.ts navigates to /agents for the same reason.
      await page.goto(AGENTS_URL, { waitUntil: 'networkidle' });
      await page.locator('#agents-page-heading').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});

      // ── Open the Settings dialog by dispatching the event directly (reliable),
      //    then capture the API-key + Update-Agents forms.
      const settingsOpen = await openSettingsDialog(page);
      if (settingsOpen) {
        // ── 000_03 — API Provider tab: z.ai provider + key (masked) + model, Save.
        await configureZaiProvider(page);
        await captureDocsScreenshot(page, dp('000_03_api_key'), AI_DIR);
        console.log(`[A] artificial-intelligence/${dp('000_03_api_key')}`);

        // ── 000_05 — back on the Update Agents tab (db_query OFF, per the doc).
        await page.getByRole('button', { name: /^Update Agents$/ }).first().click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(500);
        await ensureDbQueryOff(page);
        await captureDocsScreenshot(page, dp('000_05_update-agents'), AI_DIR);
        console.log(`[A] artificial-intelligence/${dp('000_05_update-agents')}`);

        if (ZAI_API_KEY) {
          // ── Provision + 000_10 — "Yes, Update Agents" → wait for the SSE log panel
          //    to reach success. With a key set, provisioning MUST work — so we ASSERT
          //    each milestone (throw, don't warn) rather than let a broken provision
          //    slip through as a green pass.
          await page.locator('#btn-update-confirm-yes').click({ timeout: 5000 }).catch(() => {});
          const logAppeared = await page
            .locator('#log-panel')
            .waitFor({ state: 'visible', timeout: 20_000 })
            .then(() => true)
            .catch(() => false);
          if (!logAppeared) {
            throw new Error(
              'Provisioning never started — the SSE log panel (#log-panel) never appeared ' +
              'after clicking "Yes, Update Agents". The Settings dialog / z.ai config is broken.',
            );
          }
          await page
            .locator('#provision-status-success, #provision-status-error')
            .first()
            .waitFor({ state: 'visible', timeout: 300_000 })
            .catch(() => {});
          await page.waitForTimeout(1000);
          // Capture 000_10 BEFORE asserting, so a failed run still leaves the error
          // screenshot for debugging.
          await captureDocsScreenshot(page, dp('000_10_provisioning-complete'), AI_DIR);
          console.log(`[A] artificial-intelligence/${dp('000_10_provisioning-complete')}`);
          const provisioned = await page.locator('#provision-status-success').isVisible().catch(() => false);
          if (!provisioned) {
            throw new Error(
              'Agent provisioning did NOT reach success (error or timeout) — check the z.ai ' +
              'key/model. Athena is unavailable, so the Chat2DB conversations cannot run.',
            );
          }
          await page.locator('#log-panel-close-button').click({ timeout: 3000 }).catch(() => {});
        } else {
          // No key → provisioning would fail. We captured the 000_03/000_05 forms;
          // close the dialog and let the hard failure land at Block B below (so the
          // run can't report a misleading green pass without a key).
          console.warn('[A] ZAI_API_KEY empty — captured 000_03/000_05 forms; provisioning skipped.');
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        }
      } else {
        console.warn('[A] Settings dialog did not open — skipping 000_03/000_05/000_10.');
      }

      // ── 000_20 — the AI Crew (populated only if provisioning succeeded above) ──
      await page.goto(AGENTS_URL, { waitUntil: 'networkidle' });
      await page.locator('#agents-page-heading').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await captureDocsScreenshot(page, dp('000_20_flowkrafts-ai-crew'), AI_DIR);
      console.log(`[A] artificial-intelligence/${dp('000_20_flowkrafts-ai-crew')}`);

      // ───────────────────────────────────────────────────────────────────────
      // BLOCK B — the 11 real Chat2DB conversation captures (250_*)
      // ───────────────────────────────────────────────────────────────────────
      // The conversations ARE the point of this spec. If we can't run them, FAIL —
      // never report a green pass for a run that skipped them.
      if (!ZAI_API_KEY) {
        throw new Error(
          'ZAI_API_KEY is not set — provisioning + the 11 Chat2DB conversations (the entire ' +
          'point of this spec) did NOT run. The setup shots (000_00–000_05) were captured; ' +
          're-run with ZAI_API_KEY=<key> (ZAI_MODEL/ZAI_PROVIDER_ID optional) to provision ' +
          'Athena and capture the 250_* conversations.',
        );
      }
      await connectChat2db(page);
      let repliesCaptured = 0;
      for (let i = 0; i < CONVERSATION.length; i++) {
        const turn = CONVERSATION[i];
        // Best-effort per turn: one failed/odd AI reply must not abort the rest —
        // but we TRACK whether Athena actually answered so we can fail the run if she
        // effectively never did.
        try {
          if (turn.newSession) {
            console.log('[B] session boundary — clearing chat (Athena recalls via memory)');
            await clearChat(page);
          }
          console.log(`[B] turn ${i + 1}/${CONVERSATION.length} (${turn.variant})`);
          const replied = await sendPromptAndWaitReply(page, turn);
          if (replied) repliesCaptured++;
          await scrollLatestExchangeIntoView(page);
          await captureDocsScreenshot(page, dp(turn.capture)); // root images/docs
          console.log(`[B] ${dp(turn.capture)}${replied ? '' : ' (no reply detected!)'}`);
        } catch (e) {
          console.error(`[B] turn ${i + 1} (${turn.variant}) failed — continuing:`, (e as Error).message);
        }
      }
      // A green run MUST mean Athena genuinely answered — not that the loop captured a
      // stack of empty screens. Require replies on a solid majority of the 11 turns.
      console.log(`[B] Athena replied on ${repliesCaptured}/${CONVERSATION.length} turns`);
      if (repliesCaptured < Math.ceil(CONVERSATION.length / 2)) {
        throw new Error(
          `Chat2DB got replies on only ${repliesCaptured}/${CONVERSATION.length} turns — Athena ` +
          'is not answering (check the z.ai key/model and that provisioning succeeded). The ' +
          'conversation captures are the point of this spec, so this is a failure, not a pass.',
        );
      }

      console.log('[DONE] Data Exploration screenshots captured.');

      // ── Teardown (happy path): stop the AI Hub the user way + close the browser.
      //    The NUCLEAR docker down in `finally` ALWAYS runs too (the leak guarantee).
      //    Doing the graceful stop HERE — not in finally — means a hang-prone UI stop
      //    is only attempted when things went well; on an error we skip straight to the
      //    nuclear. Same pattern as samples.screens.ts.
      await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
      externalBrowser = null;
      await SelfServicePortalsTestHelper.stopApp(
        new FluentTester(firstPage).gotoApps(),
        AI_HUB_APP_ID,
      );
    } finally {
      // ── CLEANUP ──────────────────────────────────────────────────────────────
      // Close the external browser if an error above left it open (no-op on happy path).
      if (externalBrowser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch((e) =>
          console.error('[CLEANUP] close browser:', e),
        );
      }
      // NUCLEAR + ALWAYS: synchronous `docker compose down -v --rmi` force-removes the
      // AI Hub container + volumes + image, so it can NEVER be left running — on the
      // happy path OR any thrown/hung error above. Runs BEFORE the Electron connection
      // delete below so a dead renderer there can't block the container teardown.
      try {
        SelfServicePortalsTestHelper.dockerComposeDownRmi('flowkraft/_ai-hub');
      } catch (e) {
        console.error('[CLEANUP] nuclear docker down _ai-hub:', e);
      }
      // Delete the test DB connection (Electron UI; best-effort, after the guarantee).
      if (dbConnectionCreated) {
        try {
          await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
            new FluentTester(firstPage),
            DB_CONNECTION_FILE,
            'sqlite',
          );
        } catch (e) {
          console.error('[CLEANUP] delete connection:', e);
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// AI-Hub browser helpers (text/role-based — the AI Hub frontend has few stable
// test-ids in the settings/provider form, so these are BEST-EFFORT against the live
// 8440 UI; run headed and adjust if a step misses — same posture as the CloudBeaver
// helpers in learn.screens.ts).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the Settings dialog (#dialog-update-confirm) and report whether it opened.
 * MUST be called on /agents — agents/page.tsx listens for a `trigger-update-agents`
 * window event (which the navbar gear's "Update Agents" item dispatches via
 * `handleUpdateAgents` → `window.dispatchEvent`). We dispatch it DIRECTLY: clicking
 * the gear dropdown is flaky because its full-screen click-outside overlay races the
 * item click (that's why the dialog "didn't open"). The dialog lands on the Update
 * Agents tab by default.
 */
async function openSettingsDialog(page: Page): Promise<boolean> {
  await page.evaluate(() => window.dispatchEvent(new Event('trigger-update-agents')));
  return page
    .locator('#dialog-update-confirm')
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => {
      console.warn('[cfg] Settings dialog did not open (is the page on /agents?)');
      return false;
    });
}

/**
 * With the Settings dialog open, switch to the "API Provider" tab, pick the z.ai
 * provider, paste ZAI_API_KEY (masked), fetch + pick ZAI_MODEL, then Save (persists to
 * the AI Hub's SQLite). Leaves the provider form on screen for the 000_03 capture.
 * BEST-EFFORT (the provider form has few stable ids) — run headed and adjust if a step
 * misses; same posture as the CloudBeaver helpers in learn.screens.ts.
 */
async function configureZaiProvider(page: Page): Promise<void> {
  if (!ZAI_API_KEY) {
    console.warn('[cfg] ZAI_API_KEY empty — capturing the provider form for 000_03, but agents will not be functional until a key is set.');
  }
  // Switch to the "API Provider" tab.
  await page.getByRole('button', { name: /^API Provider$/ }).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  // Provider <select> (zai = "Z.ai (Coding Plan)", zai-credits = "Z.ai (API Credits)").
  const providerSelect = page.locator('#dialog-update-confirm select').first();
  const zaiLabel = ZAI_PROVIDER_ID === 'zai' ? 'Z.ai (Coding Plan)' : 'Z.ai (API Credits)';
  await providerSelect
    .selectOption(ZAI_PROVIDER_ID, { timeout: 4000 })
    .catch(async () => {
      await providerSelect.selectOption({ label: zaiLabel }, { timeout: 4000 }).catch(() => {});
    });
  await page.waitForTimeout(400);
  // API key (password input) — the base URL is pre-filled + locked by the form.
  const keyInput = page.locator('#dialog-update-confirm input[type="password"]').first();
  if (ZAI_API_KEY && (await keyInput.isVisible({ timeout: 2000 }).catch(() => false))) {
    await keyInput.fill(ZAI_API_KEY).catch(() => {});
  }
  // Fetch models, then pick the model (free-text fallback if not listed).
  await page.getByRole('button', { name: /Fetch Models/i }).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const modelInput = page.locator('#dialog-update-confirm input[placeholder*="model" i], #dialog-update-confirm input[placeholder*="Search" i]').first();
  if (await modelInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await modelInput.fill(ZAI_MODEL).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByText(ZAI_MODEL, { exact: false }).first().click({ timeout: 1500 }).catch(() => {});
  }
  await page.waitForTimeout(300);
  // Save the provider config (persists to the AI Hub's SQLite so provisioning can use it).
  await page.getByRole('button', { name: /^Save$/ }).first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

/** Uncheck "Give db_query tool to Athena" if checked (the doc keeps it OFF). */
async function ensureDbQueryOff(page: Page): Promise<void> {
  const dbQuery = page.locator('label:has-text("Give db_query tool to Athena") input[type="checkbox"]').first();
  if (await dbQuery.isVisible({ timeout: 1500 }).catch(() => false)) {
    if (await dbQuery.isChecked().catch(() => false)) {
      await dbQuery.uncheck().catch(() => {});
    }
  }
  await page.waitForTimeout(300);
}

/** Chat2DB: select the first real DB connection, ensure Send Tables ON, Connect. */
async function connectChat2db(page: Page): Promise<void> {
  await page.goto(CHAT2DB_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const dbSelect = page.locator('#database-selector');
  await dbSelect.waitFor({ state: 'visible', timeout: 10_000 });
  // index 0 is usually the placeholder; pick the first real connection.
  await dbSelect.selectOption({ index: 1 }).catch(() => {});
  await page.waitForTimeout(500);
  // Send Tables ON (so Athena sees the schema). It's usually on by default.
  const sendTables = page.locator('label:has-text("Send Tables") input[type="checkbox"]').first();
  if (await sendTables.isVisible({ timeout: 1500 }).catch(() => false)) {
    if (!(await sendTables.isChecked().catch(() => true))) {
      await sendTables.check().catch(() => {});
    }
  }
  await page.locator('#btn-connect-database').click({ timeout: 5000 }).catch(() => {});
  await page
    .waitForFunction(() => document.body.textContent?.includes('Connected to'), undefined, { timeout: 20_000 })
    .catch(() => console.warn('[chat] "Connected to" not detected — continuing'));
  await page.waitForTimeout(800);
}

/**
 * Send one prompt, wait for Athena's reply to finish (by reply type), and report
 * whether she actually answered: TRUE if the thinking indicator appeared (request
 * accepted + processing) AND this turn rendered no NEW error box. The caller uses this
 * to fail the run if Athena effectively never answers.
 */
async function sendPromptAndWaitReply(page: Page, turn: Turn): Promise<boolean> {
  const errorsBefore = await page.locator('#chat-error-response').count().catch(() => 0);

  const input = page.locator('#chat-input-textarea');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(turn.prompt);
  await input.press('Enter');

  // Thinking indicator appears while Athena processes…
  const thinking = page.locator('#chat-thinking-indicator');
  const thinkingSeen = await thinking
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  // …then disappears when the reply is in.
  await thinking.waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});

  // Reply-type-specific settle so the diagram/chart/table is fully painted.
  if (turn.reply === 'diagram') {
    await page.getByText('PlantUML Diagram', { exact: false }).last()
      .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2500); // kroki/plantuml render
  } else if (turn.reply === 'chart') {
    await page.locator('img[src^="data:image/png"], canvas').last()
      .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  } else if (turn.reply === 'table') {
    await page.locator('table').last()
      .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(800);
  } else {
    await page.waitForTimeout(1200);
  }

  // "Replied" = Athena started processing AND this turn didn't add a new error box.
  const errorsAfter = await page.locator('#chat-error-response').count().catch(() => 0);
  return thinkingSeen && errorsAfter <= errorsBefore;
}

/** Clear the chat (session boundary). Athena still remembers via Letta memory. */
async function clearChat(page: Page): Promise<void> {
  const clear = page.getByRole('button', { name: /^Clear$/ }).first();
  if (await clear.isVisible({ timeout: 2000 }).catch(() => false)) {
    await clear.click().catch(() => {});
    // A confirm may appear ("Clear conversation?") — accept it if so.
    await page.getByRole('button', { name: /(Clear|Yes|Confirm)/i }).first().click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(800);
  }
}

/**
 * Scroll so the latest exchange (the just-sent user message + Athena's reply) leads
 * the chat viewport — the framing the original 250_* shots use (header + one
 * exchange). Best-effort: scroll the last assistant message to the top of the
 * scroller; fall back to scrolling the chat to the bottom.
 */
async function scrollLatestExchangeIntoView(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('[data-role="assistant"], [class*="assistant"]'));
      const last = msgs[msgs.length - 1] as HTMLElement | undefined;
      if (last) {
        last.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
      } else {
        const scroller = document.querySelector('[class*="overflow-y-auto"], [class*="overflow-auto"]') as HTMLElement | null;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      }
    })
    .catch(() => {});
  await page.waitForTimeout(600);
}
