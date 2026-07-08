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
//     000_02a ai-hub-launched · 000_02b chat2db-initial · 000_02c llm-providers
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
//     cross-env ZAI_API_KEY=<key> ZAI_MODEL=glm-5.2 ZAI_PROVIDER_ID=zai ...
// (db_query stays OFF — Athena reasons over the schema only; the Chat2DB UI runs the
// SQL it writes against your connection, so results still render. That's the privacy
// model the doc describes.)
//
// HOW TO RUN (two tests live here, an ORDERED PAIR — the first provisions the shared AI Hub
// once and the second reuses it, so they must run together in order; both need a REAL
// ZAI_API_KEY for the live Chat2DB conversations):
//   cd frend/reporting
//   npm run custom:start-server-and-e2e-electron-screens-grep   # E2E_GREP="Leo adaptive exploration|Northwind two-act"
//   Run the PAIR — the two-act test on its own finds 0 agents (the setup test is the sole
//   provisioner). Set ZAI_API_KEY before running.
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotOfElement,
  captureDocsScreenshotWithHighlights,
  hideToastsForScreenshots,
} from '../../../utils/docs-screenshot-helper';
import {
  createFreshCanvas,
  addUIElement,
  arrangeWidgets,
  runSqlQuery,
  type WidgetType,
} from '../../../helpers/explore-data-test-helper';

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
// https://api.z.ai/api/paas/v4). The doc + these tests drive the Coding Plan
// subscription, so the key supplied via ZAI_API_KEY must be a Coding Plan key. Base
// URL is pre-filled+locked by the form, so we only choose the provider, paste the
// key, and pick the model.
const ZAI_PROVIDER_ID = process.env.ZAI_PROVIDER_ID || 'zai';
const ZAI_MODEL = process.env.ZAI_MODEL || 'glm-5.2';
const ZAI_API_KEY = process.env.ZAI_API_KEY || ''; // ← supply at run time; empty = skip Block B


const VIEWPORT = { width: 1500, height: 980 };

// Every shot is written next to its original as `<name>-dp.png` for review; drop the
// suffix once approved (samples.screens.ts / quickstart.screens.ts convention).
const dp = (base: string) => `${base}-dp.png`;

// ── Canvas (Act 2 of the two-act video) constants ──────────────────────────────
const DATA_CANVAS_URL = `${AI_HUB_BASE_URL}/explore-data`;
// Both Chat (Act 1) and Canvas (Act 2) run on the bundled read-only DuckDB Northwind sample
// (ships with DataPallas — no create/delete). Its one bundled cube is `northwind-warehouse`
// (OLAP star schema over the view vw_sales_detail: pre-computed NetRevenue/GrossRevenue,
// a Year→YearQuarter→MonthName time hierarchy, denormalized Category/Product/Customer dims).
const SAMPLE_DUCKDB_CONNECTION_CODE = 'rbt-sample-northwind-duckdb-4f2';

// Top-20% customer revenue share (a ratio → NOT a cube measure): the ONE widget the cube can't
// express, so it's a Finetune SQL query over the DuckDB warehouse view vw_sales_detail — the case
// Athena flags in the priming exchange. DuckDB window functions (NTILE) rank customers into
// quintiles; the KPI is the top quintile's SHARE of net revenue, returned as a fraction (0–1) so
// the widget's Percent format renders it as a %. Used as the deterministic FALLBACK when Athena's
// own answered SQL can't be reused (so the widget always builds).
const SQL_PARETO = `WITH customer_rev AS (
  SELECT customer_name, SUM(net_revenue) AS rev
  FROM vw_sales_detail
  GROUP BY customer_name
),
ranked AS (
  SELECT rev, NTILE(5) OVER (ORDER BY rev DESC) AS quintile
  FROM customer_rev
)
SELECT ROUND(SUM(CASE WHEN quintile = 1 THEN rev ELSE 0 END) / NULLIF(SUM(rev), 0), 4) AS top_20pct_revenue_share
FROM ranked`;

const FINAL_LAYOUT = [
  { x: 0, y: 0, w: 12, h: 1 }, // 0. Title
  { x: 0, y: 1, w: 4, h: 1 },  // 1. Total Revenue (NetRevenue)
  { x: 4, y: 1, w: 4, h: 1 },  // 2. Total Sales (TransactionCount)
  { x: 8, y: 1, w: 4, h: 1 },  // 3. Pareto (top-20% customer share)
  { x: 0, y: 2, w: 12, h: 3 }, // 4. Revenue trend by quarter
  { x: 0, y: 5, w: 5, h: 4 },  // 5. Revenue by category (chart)
  { x: 5, y: 5, w: 7, h: 4 },  // 6. Products (tabulator)
];

// ── Turn shape for the Chat2DB conversation (driven turn-by-turn below) ─────────
// `capture` = output basename (root images/docs); `reply` drives the per-turn wait.
// The exploration is ADAPTIVE (Leo picks from Athena's live suggestions), and a
// mid-conversation session boundary clears the chat so Athena recalls the thread
// from her persistent Letta memory — the "stepped away and came back" beat.
interface Turn {
  variant: string;
  prompt: string;
  capture: string;
  reply: 'text' | 'diagram' | 'table' | 'chart';
  newSession?: boolean;
  expandSql?: boolean; // expand the "Show SQL" block before this shot (proves Athena wrote the SQL)
}

electronBeforeAfterAllTest(
  'Data Exploration — Chat2DB setup, provisioning + Leo adaptive exploration (with memory)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let externalBrowser: Browser | null = null;
    // The Chat2DB story runs on the BUNDLED DuckDB Northwind sample — it already exists.
    const connCode = SAMPLE_DUCKDB_CONNECTION_CODE;

    try {
      // Sole provisioner of the ordered suite: start from a FRESH AI Hub .env (no persisted key)
      // so Letta boots WITHOUT the key and the force-recreate below exercises the letta-restart
      // that loads it. Tests 2 & 3 then reuse the agents this test provisions (no re-provision).
      clearAiHubEnv();

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

      // No database connection to create or inspect here — the Chat2DB story runs on the BUNDLED
      // DuckDB Northwind sample, which already exists (the two-act test uses the same sample).

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

      // ── 000_02a — how the AI Hub looks the instant it opens: the landing page with the top
      //    menu (Explore Data · Chat2DB · Data Greeks) — the reader's first view of the app.
      await page.goto(AI_HUB_BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await captureDocsScreenshot(page, dp('000_02a_ai-hub-launched'), AI_DIR);
      console.log(`[A] artificial-intelligence/${dp('000_02a_ai-hub-launched')}`);

      // ── 000_02b — the Chat2DB screen as it first appears: pick the bundled DuckDB sample in
      //    the connection dropdown but do NOT connect yet, so the reader sees the initial screen
      //    with DuckDB selected and the Connect button ready.
      await page.goto(CHAT2DB_URL, { waitUntil: 'networkidle' });
      await page.locator('#database-selector').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#database-selector').selectOption(SAMPLE_DUCKDB_CONNECTION_CODE).catch(() => {});
      await page.waitForTimeout(1000);
      await captureDocsScreenshot(page, dp('000_02b_chat2db-initial'), AI_DIR);
      console.log(`[A] artificial-intelligence/${dp('000_02b_chat2db-initial')}`);

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
        // ── 000_02c — showcase ALL supported LLM providers (OpenAI, Anthropic, Google, Ollama,
        //    OpenRouter, Z.ai…) in the modal BEFORE we pick z.ai, so readers see the full choice.
        await showAllLlmProviders(page);
        await captureDocsScreenshot(page, dp('000_02c_llm-providers'), AI_DIR);
        console.log(`[A] artificial-intelligence/${dp('000_02c_llm-providers')}`);
        await collapseLlmProviders(page);

        // ── 000_03 — API Provider tab: z.ai provider + key (masked) + model, Save.
        await configureZaiProvider(page);
        await redactApiKeyForShot(page);
        await captureDocsScreenshot(page, dp('000_03_api_key'), AI_DIR);
        await unredactApiKey(page);
        console.log(`[A] artificial-intelligence/${dp('000_03_api_key')}`);

        // ── 000_05 — back on the Update Agents tab (db_query OFF; force-recreate ON, per the doc).
        await page.locator('#tab-update-agents').click({ timeout: 4000 }).catch(() => {});
        await page.locator('#checkbox-force-recreate').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(500);
        await ensureDbQueryOff(page);
        await ensureForceRecreateOn(page);
        await captureDocsScreenshot(page, dp('000_05_update-agents'), AI_DIR);
        console.log(`[A] artificial-intelligence/${dp('000_05_update-agents')}`);

        if (ZAI_API_KEY) {
          // Force-recreate MUST be on so provisioning rebuilds a clean crew (not a no-op update).
          if (!(await page.locator('#checkbox-force-recreate').isChecked().catch(() => false))) {
            throw new Error('Force-recreate is not checked — refusing to provision without a clean rebuild.');
          }
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
            .locator('#provision-status')
            .waitFor({ state: 'attached', timeout: 300_000 })
            .catch(() => {});
          await page.waitForTimeout(1000);
          // Capture 000_10 BEFORE asserting, so a failed run still leaves the error
          // screenshot for debugging.
          await captureDocsScreenshot(page, dp('000_10_provisioning-complete'), AI_DIR);
          console.log(`[A] artificial-intelligence/${dp('000_10_provisioning-complete')}`);
          const provisioned = (await page.locator('#provision-status').getAttribute('data-status').catch(() => null)) === 'success';
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
      // BLOCK B — the live Chat2DB conversation (250_*): orient → SQL reveal → adaptive
      //           exploration → step-away → memory recall
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
      await connectChat2db(page, connCode);

      // ── 1 · Meet + orient — Leo introduces himself and asks for the ER diagram.
      const answered = await sendPromptAndWaitReply(page, {
        variant: 'explore-er-diagram', reply: 'diagram',
        prompt: "Hi Athena — I'm Leo. I'm new to this Northwind database and honestly not sure where to start. Could you draw me an ER diagram and walk me through the tables that matter most?",
        capture: '250_00_chat2db-er-diagram-light',
      });
      await captureQAPair(page, '250_00_chat2db-er-diagram-light', false); // 1st exchange → full app (grounds the reader)
      if (!answered) {
        throw new Error("Athena did not answer Leo's ER-diagram question — check glm-5.2 provisioning / the z.ai key.");
      }

      // ── 2 · First ask + the SQL worry — Leo would rather not write SQL. Expand "Show SQL" on
      //        THIS shot so the reader sees Athena wrote it for him. "warehouse customers" quietly
      //        steers Athena to the OLAP warehouse (vw_sales_detail), not the raw OLTP tables — the
      //        DuckDB sample holds both — so this top-3 stays consistent with the two-act's
      //        warehouse figures. The prime lives in Leo's words; OLTP-vs-OLAP is never spelled out.
      await sendPromptAndWaitReply(page, {
        variant: 'explore-top-customers', reply: 'table',
        prompt: "That really helps — I can see Customers and Orders now. Could you show me our top 3 warehouse customers? I'll admit, I was a bit worried I'd have to write the SQL for this myself.",
        capture: '250_10_chat2db-top-customers-light',
      });
      await page.locator('#chat-last-sql').evaluate((el) => { (el as HTMLDetailsElement).open = true; }).catch(() => {});
      await page.waitForTimeout(500);
      await captureQAPair(page, '250_10_chat2db-top-customers-light');

      // ── 3 · The reassurance lands — plain English gets the answer, but the SQL is right there.
      await sendPromptAndWaitReply(page, {
        variant: 'explore-sql-reassurance', reply: 'text',
        prompt: "Oh, nice — so you write the SQL for me, and I can still see exactly what you ran. That's reassuring.",
        capture: '250_20_chat2db-sql-reassurance-light',
      });
      await captureQAPair(page, '250_20_chat2db-sql-reassurance-light');

      // ── 4 · Out of ideas → Leo hands the wheel to Athena (start of the ADAPTIVE loop). Naming
      //        "the warehouse" keeps her suggestions on the OLAP side, so the two picks below
      //        inherit the warehouse context — consistent with the top-3 above.
      await sendPromptAndWaitReply(page, {
        variant: 'explore-ideas', reply: 'text',
        prompt: "I'd like to keep exploring the warehouse, but I'm running out of ideas — what else could we look at?",
        capture: '250_30_chat2db-ideas-light',
      });
      await captureQAPair(page, '250_30_chat2db-ideas-light');
      const menu = await readLatestAnswer(page);
      const picks = extractOptions(menu);
      console.log('[Leo] parsed options:', JSON.stringify(picks));
      const mostCommon = picks[0];
      const secondCommon = picks[1];

      // ── 5 · Pick #1 (adaptive — from Athena's OWN suggestions), with its SQL cropped too.
      await sendPromptAndWaitReply(page, {
        variant: 'explore-pick-one', reply: 'chart',
        prompt: mostCommon
          ? `Nice list — let's start with the first one: "${mostCommon}". Can you write it, run it, and show me the result?`
          : "Good list — go with the one you'd start with: write it, run it, and show me the result.",
        capture: '250_40_chat2db-pick-one-light',
      });
      await captureQAPair(page, '250_40_chat2db-pick-one-light');
      await captureLatestSql(page, '250_45_chat2db-pick-one-sql-light');

      // ── 6 · Pick #2 (adaptive).
      await sendPromptAndWaitReply(page, {
        variant: 'explore-pick-two', reply: 'chart',
        prompt: secondCommon
          ? `Good stuff — now let's do the second one, "${secondCommon}". Can you run and visualize that one too?`
          : 'Nice. Now pick a different one — the next most useful — and run and visualize that too.',
        capture: '250_50_chat2db-pick-two-light',
      });
      await captureQAPair(page, '250_50_chat2db-pick-two-light');

      // ── 7 · Leo steps away — Athena acknowledges (this sets up the memory beat).
      await sendPromptAndWaitReply(page, {
        variant: 'explore-step-away', reply: 'text',
        prompt: "This has been really useful, Athena. I need to step away for a bit — let's pick it up later.",
        capture: '250_60_chat2db-step-away-light',
      });
      await captureQAPair(page, '250_60_chat2db-step-away-light');

      // ── Session boundary — clear the chat (Athena still recalls via her Letta memory).
      console.log('[Leo] session boundary — clearing chat (Athena recalls via memory)');
      await clearChat(page);

      // ── 8 · Leo returns — Athena remembers where they left off (the MEMORY demo).
      await sendPromptAndWaitReply(page, {
        variant: 'explore-welcome-back', reply: 'text',
        prompt: "I'm back, Athena. Could you remind me where we left off?",
        capture: '250_70_chat2db-welcome-back-light',
      });
      await captureQAPair(page, '250_70_chat2db-welcome-back-light', false); // full app — re-entry grounding

      // ── 9 · Close.
      await sendPromptAndWaitReply(page, {
        variant: 'explore-goodbye', reply: 'text',
        prompt: "That's brilliant — you even remembered where we were. Thanks, Athena. I'll be back soon, once I have some more specific questions.",
        capture: '250_80_chat2db-goodbye-light',
      });
      await captureQAPair(page, '250_80_chat2db-goodbye-light');

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
      // NO nuclear teardown here — this is the FIRST test of the ordered pair; it provisions the
      // shared AI Hub once and must LEAVE it (agents + volumes) intact for the two-act test that
      // follows. Only that final test tears the containers down.
      // No test DB connection to delete — the bundled DuckDB sample is not created by this test.
    }
  },
);

electronBeforeAfterAllTest(
  'Chat2DB — Northwind two-act Chat2DB explore → Canvas build',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    if (!ZAI_API_KEY) {
      throw new Error(
        'ZAI_API_KEY is not set — the two-act video test provisions Athena and holds a live ' +
        'Chat2DB conversation, both of which need a REAL z.ai key. Re-run with ZAI_API_KEY=<key> ' +
        '(the placeholder 123 will fail provisioning).',
      );
    }

    // Chat + Canvas both run on the BUNDLED DuckDB Northwind sample (2nd sample in the dropdown).
    // It already exists — nothing to create or delete.
    const connCode = SAMPLE_DUCKDB_CONNECTION_CODE;
    let externalBrowser: Browser | null = null;

    try {
      await new FluentTester(firstPage)
        .gotoDataCanvas()
        .waitOnElementToBecomeVisible(`#appName_${AI_HUB_APP_ID}`);
      await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage), AI_HUB_APP_ID);
      await new FluentTester(firstPage).waitOnElementToBecomeVisible(`#btnLaunch_${AI_HUB_APP_ID}`);

      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, { viewport: VIEWPORT });
      externalBrowser = ext.browser;
      const context: BrowserContext = ext.context;
      const chat = ext.page;
      await SelfServicePortalsTestHelper.waitForServerReady(chat, AI_HUB_BASE_URL);

      // Athena is provisioned ONCE by the first test (Data Exploration setup) and reused across
      // this ordered suite — the three tests share a single AI Hub — so we skip provisioning and
      // go straight to the conversation. (Running this test on its own would find 0 agents.)

      // Connect the chat to the bundled DuckDB Northwind sample + capture the obvious
      // "pick DuckDB + press Connect" shot (just those two controls).
      await connectChat2db(chat, connCode, '270_05_connect-duckdb-sample');

      // ── Act 1 — Leo explores the DuckDB SALES WAREHOUSE with Athena. Q1 pins the frame (the
      // star schema behind the vw_sales_detail view); every question then uses warehouse-only
      // vocabulary — "net revenue", "sales transactions", "quarter" — terms the raw Northwind
      // tables don't have, so Athena stays on the warehouse. This is the SAME dataset the Act-2
      // canvas builds from (the northwind-warehouse cube), so the two acts always agree.
      const act1: { prompt: string; settle: Settle; shot: string }[] = [
        { settle: 'diagram', shot: '270_10_orient-erd',
          prompt: "Hi Athena — today I'd like to focus on the Sales Warehouse in this database: the star schema (fact_sales and its dimension tables, exposed through the vw_sales_detail view). It's new to me — can you show me how it's put together?" },
        { settle: 'text', shot: '270_11_total-revenue',
          prompt: "So, across the whole warehouse — what's our total net revenue?" },
        { settle: 'text', shot: '270_12_total-sales',
          prompt: 'And how many sales transactions do we have in total?' },
        { settle: 'table', shot: '270_13_biggest-customers',
          prompt: 'Who are our biggest customers by net revenue?' },
        { settle: 'text', shot: '270_14_pareto',
          prompt: 'Good to know. And how much of that revenue comes from just the top 20% of customers?' },
        { settle: 'chart', shot: '270_15_quarterly-trend',
          prompt: 'How has net revenue moved over time, quarter by quarter?' },
        { settle: 'chart', shot: '270_16_by-category',
          prompt: 'Which product categories bring in the most net revenue?' },
        { settle: 'table', shot: '270_17_products',
          prompt: 'Can I get every product with its net revenue and units sold, so I can sort and browse it myself?' },
        { settle: 'text', shot: '270_18_the-wall',
          prompt: "This is great — but I've got four KPIs and a few charts scrolling up the chat now, and I keep losing the thread. Is there a way to pin them all onto one board instead?" },
      ];
      for (let i = 0; i < act1.length; i++) {
        const t = act1[i];
        console.log(`[Act1] ${t.shot}`);
        await askAthena(chat, t.prompt, t.settle);
        // 1st exchange = full app (grounds the reader in where the chat lives); rest = tight Q/A pair.
        await captureQAPair(chat, t.shot, i !== 0);
      }

      const canvas: Page = await context.newPage();
      await canvas.setViewportSize(VIEWPORT);
      await createFreshCanvas(canvas, DATA_CANVAS_URL, 'Northwind Sales Warehouse');
      const canvasId = canvas.url().split('/').pop()!;
      await canvas.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
      // Same dataset as Act 1's chat: the bundled DuckDB sample, whose one cube is the warehouse.
      await canvas.locator('#selectConnection').selectOption(SAMPLE_DUCKDB_CONNECTION_CODE);
      await canvas.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });
      await canvas.waitForTimeout(800);

      // ── Act-2 helpers (coordinate the two tabs: `chat` = Leo↔Athena, `canvas` = building) ──
      // Ask Athena in the chat, capture the tight Q/A pair (full app for the 1st Act-2 beat).
      const askQA = async (shot: string, prompt: string, settle: Settle, full = false) => {
        await askAthena(chat, prompt, settle);
        await captureQAPair(chat, shot, !full);
      };
      // The whole canvas (the widget in place on the board).
      const shotCanvas = (shot: string) => captureDocsScreenshot(canvas, dp(shot));
      // A single canvas element, cropped tight (config panel / Finetune editor) — reuses the
      // existing element-capture helper; these panels fit the viewport so no navbar striping.
      const shotEl = (shot: string, selector: string) =>
        captureDocsScreenshotOfElement(canvas, dp(shot), selector, { trimBottomEmpty: true })
          .catch((e) => console.warn(`[shot] ${shot}: ${(e as Error)?.message}`));
      // Open the right-hand Display panel, shoot it filled with Athena's settings, close it.
      const shotConfigPanel = async (shot: string, panelSelector: string) => {
        await canvas.locator('#btnDisplayTab').click({ timeout: 4_000 }).catch(() => {});
        await canvas.waitForTimeout(700);
        await shotEl(shot, panelSelector);
        await canvas.locator('#btnDataTab').click({ timeout: 4_000 }).catch(() => {});
        await canvas.waitForTimeout(400);
      };
      // Add a cube from the left panel. Clicking a cube pops a Yes/No confirm beneath it — the
      // step is identical for every widget, so we capture that confirm ONCE (confirmShot on the
      // first cube) and skip it thereafter.
      const addCube = async (cubeId: string, confirmShot?: string) => {
        await canvas.locator(`#btnCube-${cubeId}`).click({ timeout: 8_000 });
        const confirm = canvas.locator(`#btnConfirmAddCube-${cubeId}`);
        await confirm.waitFor({ state: 'visible', timeout: 8_000 });
        if (confirmShot) { await canvas.waitForTimeout(400); await shotCanvas(confirmShot); }
        await confirm.click({ timeout: 8_000 });
        await canvas.locator('#visualizeAsSection').waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {});
        await canvas.locator('#widgetActive').waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {});
        await canvas.waitForTimeout(1_500);
      };

      // Intro — how do I start? (full-app chat shot, then the empty canvas)
      await askQA('280_00_how-to-start', "Yes, let's build it — where do I start?", 'text', true);
      await shotCanvas('280_01_canvas-empty');

      // Prime the whole of Act 2 with ONE authentic beginner question. It sets two frames Athena
      // then carries via Letta memory: (a) the cube answers most things by just picking fields
      // (→ she leads with cube/no-SQL builds, matching the deterministic tickFields below), and
      // (b) the exception is writing "our own query" (→ SQL, since Leo named SQL as the fallback,
      // so the one Finetune widget comes out as SQL, not Groovy). Leo never embeds a solution —
      // he's just genuinely curious how far the cube goes.
      await askQA('280_05_cube-power',
        "Athena, before we build — this Sales Warehouse cube looks powerful. I know a little SQL, but I'd rather not write much if I can help it. Can it answer most of my sales questions just by picking fields, or will I still need to write my own query now and then?",
        'text');
      // Leo echoes the takeaway back in his own words; Athena confirms. Now BOTH the cube-first
      // frame AND the SQL-for-exceptions frame are stated by both parties — doubly anchoring them
      // in Athena's Letta memory for the rest of Act 2 — and it reads as a natural beginner
      // "so, to check I've got it…" beat that flows straight into building.
      await askQA('280_06_cube-power-confirm',
        "Got it — so with a well-designed cube, most of the dashboard is just ticking dimensions and measures and letting it generate the SQL for me, and only the occasional special case needs a query of my own. That makes sense — let's build it.",
        'text');

      // 1 · Title header (Text element) — no cube, just a heading.
      await askQA('280_10_title-ask', "First off, I'd like a title header at the top — how do I add one?", 'text');
      await addUIElement(canvas, 'text', {
        textContent: '## Northwind Sales Warehouse — Overview\n\n' +
          'Headline KPIs · revenue trend by quarter · category breakdown · top products.',
      });
      await canvas.waitForTimeout(1_500);
      await shotCanvas('280_11_title-canvas');

      // 2 · KPI — Total Revenue (Number, Visual, warehouse cube NetRevenue). First cube add →
      // capture the Yes/No confirm ONCE.
      await askQA('280_20_kpi-revenue-ask', "Let's start with total net revenue as one big number — how do I build that?", 'text');
      {
        await addCube('northwind-warehouse', '280_15_add-cube-confirm');
        await selectLastWidget(canvas);
        const id = await getLastWidgetId(canvas);
        await tickFields(canvas, [], ['NetRevenue']);
        await waitForWidgetData(canvas, id);
        await setVisualization(canvas, 'number');
        await setNumberLabel(canvas, 'Total Revenue');
        await waitForVizRender(canvas, id, 'number');
        await captureWidgetCube(canvas, id, [], ['NetRevenue'], '280_20_kpi-revenue-cube');
        await shotConfigPanel('280_21_kpi-revenue-config', '#configPanel-number'); // right panel Athena described
        await arrangeWidgets(canvas, canvasId, FINAL_LAYOUT.slice(0, 2));
        await shotCanvas('280_22_kpi-revenue-canvas');
      }

      // After the 2nd tile, Leo asks how to arrange — and from here arranges each new widget.
      await askQA('280_25_arrange-ask', 'These tiles are starting to stack up — how do I lay them out nicely?', 'text');

      // 3 · KPI — Total Sales (Number, Visual, warehouse TransactionCount). The warehouse fact is
      // one row per sale line, so the count is "sales / transactions", not "orders".
      await askQA('280_30_kpi-sales-ask', "Now let's do the same for the sales count — total transactions, as a single number.", 'text');
      {
        await addCube('northwind-warehouse');
        await selectLastWidget(canvas);
        const id = await getLastWidgetId(canvas);
        await tickFields(canvas, [], ['TransactionCount']);
        await waitForWidgetData(canvas, id);
        await setVisualization(canvas, 'number');
        await setNumberLabel(canvas, 'Total Sales');
        await waitForVizRender(canvas, id, 'number');
        await captureWidgetCube(canvas, id, [], ['TransactionCount'], '280_30_kpi-sales-cube');
        await shotConfigPanel('280_31_kpi-sales-config', '#configPanel-number'); // right-panel Number config
        await arrangeWidgets(canvas, canvasId, FINAL_LAYOUT.slice(0, 3));
        await shotCanvas('280_32_kpi-sales-canvas');
      }

      // 4 · KPI — Top-20% customer share (Number, the ONE Finetune widget). It's the exception
      // Athena flagged during priming — a ratio the cube can't express — so it comes out as SQL,
      // not Groovy. Leo asks openly (referencing that "query" case). We crop Athena's answered SQL
      // AND paste HER query into the Finetune editor so chat == editor; fall back to SQL_PARETO if
      // her answer isn't reusable, so the widget always builds.
      await askQA('280_40_pareto-ask', "That top-20% customer share we looked at — that's one the cube can't do on its own, right? Can you show me the query for it?", 'text');
      await captureLatestSql(chat, '280_41_pareto-sql-answer'); // clean crop of Athena's "Show SQL"
      const athenaParetoSql = await readLatestSql(chat);        // her actual query, reused below
      {
        await addCube('northwind-warehouse');
        await selectLastWidget(canvas);
        const id = await getLastWidgetId(canvas);
        await setVisualization(canvas, 'number');
        // Prefer Athena's OWN answered SQL (chat == editor); else the canonical query.
        const reusable = /select/i.test(athenaParetoSql) && /vw_sales_detail|net_revenue/i.test(athenaParetoSql);
        if (!reusable) console.log('[pareto] Athena SQL not reusable → canonical SQL_PARETO fallback');
        await runSqlQuery(canvas, reusable ? athenaParetoSql : SQL_PARETO);
        try {
          await waitForWidgetData(canvas, id);
        } catch {
          console.log('[pareto] pasted SQL produced no data → re-running with SQL_PARETO');
          await runSqlQuery(canvas, SQL_PARETO);
          await waitForWidgetData(canvas, id);
        }
        await setNumberLabel(canvas, '% of Revenue from Top 20% Customers');
        await setNumberFormat(canvas, 'percent');
        await waitForVizRender(canvas, id, 'number');
        await captureWidgetSql(canvas, id, '280_42_pareto-sql'); // ring-highlighted widget + its Finetune SQL, pre-arrange
        await shotConfigPanel('280_43_pareto-config', '#configPanel-number'); // label + Percent format
        await arrangeWidgets(canvas, canvasId, FINAL_LAYOUT.slice(0, 4));
        await shotCanvas('280_44_pareto-canvas');
      }

      // 5 · Trend — Revenue by Quarter (Trend, Visual straight from the cube's time hierarchy —
      // NO raw SQL). YearQuarter ("2023-Q1"…"2024-Q4") sorts chronologically as a string.
      await askQA('280_50_trend-ask', "Now let's add the revenue trend we looked at — quarter by quarter, straight from the cube.", 'chart');
      {
        await addCube('northwind-warehouse');
        await selectLastWidget(canvas);
        const id = await getLastWidgetId(canvas);
        await tickFields(canvas, ['YearQuarter'], ['NetRevenue']);
        await waitForWidgetData(canvas, id);
        await setVisualization(canvas, 'trend');
        await setTrendLabel(canvas, "Latest quarter's revenue (vs. prior quarter)");
        await waitForVizRender(canvas, id, 'trend');
        await captureWidgetCube(canvas, id, ['YearQuarter'], ['NetRevenue'], '280_50_trend-cube');
        await shotConfigPanel('280_52_trend-config', '#configPanel-trend');
        await arrangeWidgets(canvas, canvasId, FINAL_LAYOUT.slice(0, 5));
        await shotCanvas('280_53_trend-canvas');
      }

      // 6 · Chart — Revenue by Category (Chart, Visual, warehouse NetRevenue × CategoryName).
      await askQA('280_60_chart-ask', "Next, let's add the revenue-by-category breakdown as a chart.", 'chart');
      {
        await addCube('northwind-warehouse');
        await selectLastWidget(canvas);
        const id = await getLastWidgetId(canvas);
        await tickFields(canvas, ['CategoryName'], ['NetRevenue']);
        await waitForWidgetData(canvas, id);
        await setVisualization(canvas, 'chart');
        await waitForVizRender(canvas, id, 'chart');
        await captureWidgetCube(canvas, id, ['CategoryName'], ['NetRevenue'], '280_60_chart-cube');
        await shotConfigPanel('280_61_chart-config', '#configPanel-chart'); // right-panel chart config
        await arrangeWidgets(canvas, canvasId, FINAL_LAYOUT.slice(0, 6));
        await shotCanvas('280_62_chart-canvas');
      }

      // 7 · Table — All Products by Revenue (Tabulator, Visual).
      await askQA('280_70_table-ask', "And let's finish with the full product list, as a sortable table.", 'table');
      {
        await addCube('northwind-warehouse');
        await selectLastWidget(canvas);
        const id = await getLastWidgetId(canvas);
        await tickFields(canvas, ['ProductName', 'CategoryName'], ['NetRevenue', 'TotalQuantity']);
        await waitForWidgetData(canvas, id);
        await setVisualization(canvas, 'tabulator');
        await waitForVizRender(canvas, id, 'tabulator');
        await captureWidgetCube(canvas, id, ['ProductName', 'CategoryName'], ['NetRevenue', 'TotalQuantity'], '280_70_table-cube');
        await shotConfigPanel('280_71_table-config', '#configPanel-tabulator'); // right-panel table config
        await arrangeWidgets(canvas, canvasId, FINAL_LAYOUT.slice(0, 7));
        await shotCanvas('280_72_table-canvas');
      }

      // 8 · Publish + share.
      await askQA('280_80_publish-ask', 'This is looking great. How do I make it permanent and shareable?', 'text');

      // Grand finish: deselect, let every widget settle, scroll to top, capture the hero board.
      await canvas.evaluate(() => document.body.click()).catch(() => {});
      await canvas.waitForTimeout(800);
      // Every widget was already awaited to render during the build; give the board a beat
      // to settle after deselecting, then capture the hero.
      await canvas.locator('#canvasGridArea').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      await canvas.waitForTimeout(1_500);
      await canvas.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
      await canvas.waitForTimeout(500);
      await captureDocsScreenshot(canvas, dp('280_90_dashboard-final'));

      const { dashboardUrl } = await publishDashboard(canvas);
      console.log(`[Act2] published → ${dashboardUrl}`);
      await canvas.goto(dashboardUrl);
      await canvas.waitForLoadState('networkidle');
      await expect(canvas.locator('#publishedDashboard')).toBeVisible({ timeout: 15_000 });
      await captureDocsScreenshot(canvas, dp('280_95_published-dashboard'));

      // Leo's closing thank-you (a warm, human close for the docs) — full-app chat shot.
      await askQA('280_99_thank-you', "That's it — and it works. Thanks for walking me through it all, Athena.", 'text', true);

      console.log('[DONE] two-act guide screenshots captured.');

      await canvas.close().catch(() => {});
      await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
      externalBrowser = null;
      await SelfServicePortalsTestHelper.stopApp(new FluentTester(firstPage).gotoApps(), AI_HUB_APP_ID);
    } finally {
      if (externalBrowser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch((e) =>
          console.error('[CLEANUP] close browser:', e));
      }
      try {
        SelfServicePortalsTestHelper.dockerComposeDownRmi('flowkraft/_ai-hub');
      } catch (e) { console.error('[CLEANUP] nuclear docker down _ai-hub:', e); }
      // No DB connection to delete — the test uses the bundled DuckDB sample.
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// THROWAWAY — re-capture the TWO broken error screenshots (270_17 + 280_40).
//
// WHY: two questions are hard enough that the small model sometimes writes SQL
// that fails at runtime (a wrong table/column), so the chat renders an error card
// that the Q/A-pair capture then freezes into the doc:
//   • 270_17_products    — Session-2 chat, "full product list … net revenue + units sold"
//   • 280_40_pareto-ask  — Act-2 canvas, "top-20% customer share … show me the query"
// (280_41, the pareto "Show SQL" card, is ALREADY GOOD — left untouched; and since
// 280_40's SQL stays collapsed in the Q/A pair, there's no visible mismatch.) Both
// broken answers depend on CONTEXT — 280_40 especially ("the share we looked at" + the
// cube-can't-do-it framing) — so this REPLAYS the minimal lead-up as one continuous chat
// (warehouse orientation + the first, successful pareto, then the Act-2 cube/SQL priming)
// and only THEN re-asks each failed question, RETRYING until clean. It CAPTURES ONLY the
// two broken shots; the context turns are asked but NEVER captured, so none of your
// existing good screenshots are overwritten.
//
// SELF-CONTAINED: it provisions Athena itself (the setup test's block, minus the
// 000_* screenshots), so you run ONLY this — no Session-1 re-capture. Needs a REAL
// Coding-Plan key. Run it (PowerShell, from frend/reporting):
//
//   $env:ZAI_API_KEY="<coding-plan-key>"; npm run custom:e2e-screens-recapture-error-shots
//
// If a run still errors after 8 tries, just run it again (each run is a fresh
// generation → a new chance at clean SQL). DELETE this whole block once the shots
// look right.
// ═════════════════════════════════════════════════════════════════════════════
electronBeforeAfterAllTest(
  'Chat2DB — Error-shots re-capture (throwaway: 270_17 + 280_40)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    if (!ZAI_API_KEY) {
      throw new Error('ZAI_API_KEY is not set — needed to provision Athena and answer the queries.');
    }

    // The EXACT prompts the two-act test asks — verbatim, so the re-captured shots AND the
    // CONTEXT they lean on match the real flow. The two error shots depend on what came
    // before them, so we replay the minimal lead-up first, then re-ask each in place:
    //   270_17 (products) needs the warehouse established;
    //   280_40 (pareto)   needs the FIRST pareto ("the share we looked at") AND the Act-2
    //                     priming that framed the cube as "most by ticking fields, SQL for
    //                     the occasional special case" (why "show me the query" = give SQL).
    const CTX_ORIENT =        // 270_10 — establishes the Sales Warehouse / vw_sales_detail
      "Hi Athena — today I'd like to focus on the Sales Warehouse in this database: the star schema (fact_sales and its dimension tables, exposed through the vw_sales_detail view). It's new to me — can you show me how it's put together?";
    const CTX_TOTAL_REV =     // 270_11 — "net revenue" vocabulary
      "So, across the whole warehouse — what's our total net revenue?";
    const CTX_BIGGEST_CUST =  // 270_13 — customers ranked by net revenue
      'Who are our biggest customers by net revenue?';
    const CTX_FIRST_PARETO =  // 270_14 — the top-20% share Leo later refers to as "we looked at"
      'Good to know. And how much of that revenue comes from just the top 20% of customers?';
    const PRODUCTS_Q =        // 270_17 — the failed table answer
      'Can I get every product with its net revenue and units sold, so I can sort and browse it myself?';
    const PRIME_CUBE =        // 280_05 — cube handles most by ticking fields…
      "Athena, before we build — this Sales Warehouse cube looks powerful. I know a little SQL, but I'd rather not write much if I can help it. Can it answer most of my sales questions just by picking fields, or will I still need to write my own query now and then?";
    const PRIME_CONFIRM =     // 280_06 — …only the special case needs a query of my own
      "Got it — so with a well-designed cube, most of the dashboard is just ticking dimensions and measures and letting it generate the SQL for me, and only the occasional special case needs a query of my own. That makes sense — let's build it.";
    const PARETO_Q =          // 280_40 — the failed SQL answer (the Act-2 "special case")
      "That top-20% customer share we looked at — that's one the cube can't do on its own, right? Can you show me the query for it?";

    let externalBrowser: Browser | null = null;
    try {
      // Do NOT clear the AI Hub .env here. Letta reads its provider key ONLY at container
      // boot. Wiping the key makes Letta boot keyless — and the provisioning's auto-restart
      // gate (/api/agents/provider-ready) can STILL report "ready", because the patched Letta
      // /v1/models lists the model handle even when the key does not actually work. So the
      // restart is SKIPPED and every chat 401s ("token expired or incorrect"). Leaving the
      // existing valid key in place lets Letta boot WITH it — exactly as a normal (non-fresh)
      // app would — so no restart is needed and provisioning proceeds cleanly.
      await new FluentTester(firstPage)
        .gotoDataCanvas()
        .waitOnElementToBecomeVisible(`#appName_${AI_HUB_APP_ID}`);
      await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage), AI_HUB_APP_ID);
      await new FluentTester(firstPage).waitOnElementToBecomeVisible(`#btnLaunch_${AI_HUB_APP_ID}`);

      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, { viewport: VIEWPORT });
      externalBrowser = ext.browser;
      const chat = ext.page;
      await SelfServicePortalsTestHelper.waitForServerReady(chat, AI_HUB_BASE_URL);

      // ── Provision Athena (lifted from the setup test, WITHOUT the 000_* screenshots) ──
      await chat.goto(AGENTS_URL, { waitUntil: 'networkidle' });
      await chat.locator('#agents-page-heading').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      if (!(await openSettingsDialog(chat))) {
        throw new Error('Settings dialog did not open on /agents — cannot provision Athena.');
      }
      await configureZaiProvider(chat);
      await chat.locator('#tab-update-agents').click({ timeout: 4000 }).catch(() => {});
      await chat.locator('#checkbox-force-recreate').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      await ensureDbQueryOff(chat);
      await ensureForceRecreateOn(chat);
      await chat.locator('#btn-update-confirm-yes').click({ timeout: 5000 }).catch(() => {});
      await chat.locator('#log-panel').waitFor({ state: 'visible', timeout: 20_000 });
      await chat.locator('#provision-status').waitFor({ state: 'attached', timeout: 300_000 }).catch(() => {});
      await chat.waitForTimeout(1000);
      const provisioned = (await chat.locator('#provision-status').getAttribute('data-status').catch(() => null)) === 'success';
      if (!provisioned) {
        throw new Error('Athena provisioning did NOT reach success — check the z.ai key/model.');
      }
      await chat.locator('#log-panel-close-button').click({ timeout: 3000 }).catch(() => {});

      // Connect the chat to the bundled DuckDB Northwind sample.
      await connectChat2db(chat, SAMPLE_DUCKDB_CONNECTION_CODE);

      // Replay the MINIMAL lead-up as ONE continuous conversation (no clearing — the real
      // flow never clears here, and both failed questions lean on what came before). These
      // context turns are ASKED but NOT captured, so NONE of your existing good shots are
      // touched.
      //
      // CRITICAL — PACING: this small model rate-limits under a burst, and the failure then
      // shows as "Something went wrong processing your request…" (a provider error), NOT the
      // SQL error we're fixing. The real two-act test never trips this because canvas-building
      // spaces its calls out. So here we (a) space EVERY turn, and (b) on a failed retry back
      // off — LONG for a provider/rate-limit error (wait for the limit to clear), short for a
      // plain SQL error (which just needs another generation; Athena also sees her own failed
      // attempt and tends to self-correct).
      await chat.waitForTimeout(5_000); // let the freshly-provisioned model settle
      const GAP_MS = 6_000;
      const ask = async (prompt: string, settle: Settle) => {
        await askAthena(chat, prompt, settle);
        await chat.waitForTimeout(GAP_MS);
      };
      const MAX_TRIES = 6;
      const askUntilClean = async (label: string, prompt: string, settle: Settle, needSql: boolean): Promise<void> => {
        let clean = false;
        for (let attempt = 1; attempt <= MAX_TRIES && !clean; attempt++) {
          const errBefore = await chat.locator('#chat-error-response').count().catch(() => 0);
          await askAthena(chat, prompt, settle);
          const noError = (await chat.locator('#chat-error-response').count().catch(() => 0)) <= errBefore;
          const hasSql = needSql ? (await chat.locator('#chat-last-sql').count().catch(() => 0)) > 0 : true;
          const hasTable = settle === 'table' ? (await chat.locator('#chat-last-table').count().catch(() => 0)) > 0 : true;
          clean = noError && hasSql && hasTable;
          console.log(`[recapture:${label}] try ${attempt}/${MAX_TRIES}: noError=${noError} hasSql=${hasSql} hasTable=${hasTable} → ${clean ? 'CLEAN ✔' : 'retry'}`);
          if (clean || attempt >= MAX_TRIES) break;
          const errText = await chat.locator('#chat-error-response').last().innerText({ timeout: 2_000 }).catch(() => '');
          const providerErr = /went wrong|too many|rate|timeout|try again|unavailable|overloaded/i.test(errText);
          const backoffMs = providerErr ? 60_000 : 8_000;
          console.log(`[recapture:${label}] ${providerErr ? 'PROVIDER/rate-limit' : 'sql'} error — backing off ${backoffMs / 1000}s`);
          await chat.waitForTimeout(backoffMs);
        }
        if (!clean) {
          // Stop guessing the cause — reveal it. Expand the error's "Show technical details"
          // so BOTH the console log AND the captured shot show the REAL reason (a 429/rate
          // limit? the agent's "must be one of []" boot failure? a timeout? the SQL error?).
          const el = chat.locator('#chat-error-response').last();
          await el.getByText(/technical details/i).click({ timeout: 2_000 }).catch(() => {});
          await el.locator('details').evaluateAll((ds) => ds.forEach((d) => { (d as HTMLDetailsElement).open = true; })).catch(() => {});
          await chat.waitForTimeout(600);
          const txt = (await el.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          console.warn(`[recapture:${label}] STILL not clean after ${MAX_TRIES} tries. FULL ERROR TEXT ↓\n${txt.slice(0, 1500)}`);
        }
      };

      // ── Context (ASKED, NOT captured), paced: warehouse orientation, net-revenue vocab, the FIRST pareto ──
      await ask(CTX_ORIENT, 'diagram');
      await ask(CTX_TOTAL_REV, 'text');
      await ask(CTX_BIGGEST_CUST, 'table');
      await ask(CTX_FIRST_PARETO, 'text'); // the "top-20% share we looked at"

      // ── 270_17 — the "full product list" table, re-asked in the warehouse context ──
      await askUntilClean('products', PRODUCTS_Q, 'table', false);
      await captureQAPair(chat, '270_17_products', true);
      console.log('[recapture] captured 270_17_products.');

      // ── Context (ASKED, NOT captured), paced: the Act-2 cube/SQL priming ──
      await ask(PRIME_CUBE, 'text');
      await ask(PRIME_CONFIRM, 'text');

      // ── 280_40 — the Act-2 pareto, now asked WITH its context (earlier pareto + priming).
      // We require SQL in the answer (needSql) so it matches the narration, but we DO NOT
      // re-capture 280_41: that "Show SQL" card is already good and you don't want good shots
      // overwritten. 280_40's own SQL stays collapsed in the Q/A pair, so there's no visible
      // mismatch with the existing 280_41. ──
      await askUntilClean('pareto', PARETO_Q, 'text', true);
      await captureQAPair(chat, '280_40_pareto-ask', true);       // tight Q/A pair (the shot that had the error)
      console.log('[recapture] captured 280_40_pareto-ask.');

      await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
      externalBrowser = null;
      await SelfServicePortalsTestHelper.stopApp(new FluentTester(firstPage).gotoApps(), AI_HUB_APP_ID);
    } finally {
      if (externalBrowser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch((e) =>
          console.error('[CLEANUP] close browser:', e));
      }
      // NO nuclear teardown here — leave Athena provisioned so this throwaway can be re-run.
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
 * Ensure the AI Hub starts like a FRESH install — remove any persisted `.env` — so the
 * Letta container boots WITHOUT a provider key and its model list is empty. This forces
 * the provisioning flow's Fix B path (bounce letta AFTER the key is saved, then wait for
 * it to serve the model) to actually run. Necessary because clean-testground preserves
 * testground/e2e/_apps, so a `.env` written by a previous run's provisioning would
 * otherwise let Letta boot already-ready and silently skip Fix B.
 * MUST be called before SelfServicePortalsTestHelper.startApp.
 */
function clearAiHubEnv(): void {
  const envPath = path.resolve(process.env.PORTABLE_EXECUTABLE_DIR || '.', '_apps', 'flowkraft', '_ai-hub', '.env');
  if (fs.existsSync(envPath)) {
    fs.rmSync(envPath, { force: true });
    console.log(`[clean] removed stale .env so Letta boots keyless (Fix B must restart it) @ ${envPath}`);
  } else {
    console.log('[clean] no stale .env — Letta will boot keyless (fresh-install state)');
  }
}

/**
 * Docs helper — expand the provider <select> into a visible listbox so a screenshot shows
 * EVERY supported provider (OpenAI, Anthropic, Google Gemini, Ollama, plus the OpenAI-
 * Compatible group: OpenRouter, Z.ai Coding Plan, Z.ai API Credits, Other). A native
 * <select>'s dropdown is an OS popup Playwright can't capture, so we set `size` to the row
 * count — the browser then renders all options inline in the page.
 */
async function showAllLlmProviders(page: Page): Promise<void> {
  await page.locator('#tab-api-provider').click({ timeout: 8000 }).catch(() => {});
  await page.locator('#llm-provider-select').waitFor({ state: 'visible', timeout: 8000 });
  await page.evaluate(() => {
    const sel = document.querySelector('#llm-provider-select') as HTMLSelectElement | null;
    if (!sel) return;
    sel.setAttribute('data-orig-size', String(sel.size));
    const optgroups = Array.from(sel.children).filter((c) => c instanceof HTMLOptGroupElement).length;
    const rows = sel.options.length + optgroups;
    sel.size = Math.max(rows, 8);
    sel.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(400);
}

/** Docs helper — collapse the provider <select> back to a normal dropdown after the shot. */
async function collapseLlmProviders(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sel = document.querySelector('#llm-provider-select') as HTMLSelectElement | null;
    if (!sel) return;
    sel.size = Number(sel.getAttribute('data-orig-size') || '0') || 0;
    sel.removeAttribute('data-orig-size');
  });
  await page.waitForTimeout(200);
}

/**
 * With the Settings dialog open, switch to the "API Provider" tab, select the z.ai
 * provider (ZAI_PROVIDER_ID), paste ZAI_API_KEY, fetch + pick ZAI_MODEL, then Save
 * (persists to the AI Hub's SQLite so provisioning reads it). Every step is verified
 * against a stable id and its elapsed time is logged, so a slow step shows up in the
 * console instead of looking frozen. With a real key it THROWS on any step that doesn't
 * take — so a force-recreate never runs against a half-configured provider; with an
 * empty key it selects the provider for the 000_03 form capture and returns without
 * saving. Leaves the dialog open on the API Provider tab.
 */
async function configureZaiProvider(page: Page, model: string = ZAI_MODEL): Promise<void> {
  const strict = !!ZAI_API_KEY;
  const t0 = Date.now();
  const mark = (label: string) => console.log(`[cfg +${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

  // 1 · Switch to the API Provider tab — proven by the provider <select> appearing
  //     (the switch is a pure state toggle; if it takes >8s something is wrong).
  await page.locator('#tab-api-provider').click({ timeout: 8000 });
  await page.locator('#llm-provider-select').waitFor({ state: 'visible', timeout: 8000 });
  mark('API Provider tab active');

  // 2 · Select the provider by option value; verify it stuck (wrong provider = wrong
  //     base URL = the key silently fails at inference time).
  await page.locator('#llm-provider-select').selectOption(ZAI_PROVIDER_ID, { timeout: 6000 });
  const got = await page.locator('#llm-provider-select').inputValue().catch(() => '');
  if (got !== ZAI_PROVIDER_ID) {
    const msg = `provider not selected — wanted "${ZAI_PROVIDER_ID}", select shows "${got}"`;
    if (strict) throw new Error(`[cfg] ${msg}`);
    console.warn(`[cfg] ${msg} (no key — continuing for the form capture)`);
  }
  mark(`provider = ${got || ZAI_PROVIDER_ID}`);

  if (!strict) {
    console.warn('[cfg] ZAI_API_KEY empty — captured the provider form; skipping key/model/save.');
    return;
  }

  // 3 · API key.
  const keyInput = page.locator('#llm-api-key-input');
  await keyInput.waitFor({ state: 'visible', timeout: 6000 });
  await keyInput.fill(ZAI_API_KEY);
  if (!(await keyInput.inputValue())) throw new Error('[cfg] API key field did not populate');
  mark('API key filled');

  // 4 · Fetch models — done when the input placeholder flips to "Search models…" (the
  //     form sets that only once fetchedModels > 0). Then pick the model by its id.
  await page.locator('#btn-fetch-models').click({ timeout: 6000 });
  await page
    .waitForFunction(
      () => document.querySelector('#llm-model-input')?.getAttribute('placeholder') === 'Search models...',
      undefined,
      { timeout: 45_000 },
    )
    .catch(() => {
      throw new Error('[cfg] "Fetch Models" returned no models — check the z.ai key / that the provider matches the key (Coding Plan vs API Credits use different endpoints).');
    });
  mark('models fetched');

  const modelInput = page.locator('#llm-model-input');
  await modelInput.click();      // focus opens the dropdown (fetchedModels > 0)
  await modelInput.fill(model);  // type to filter
  const optionId = `#llm-model-option-${model.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  await page.locator(optionId).waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => { throw new Error(`[cfg] model "${model}" not in the fetched list — is it available on this z.ai plan?`); });
  await page.locator(optionId).click({ timeout: 4000 });
  const chosen = await modelInput.inputValue().catch(() => '');
  if (!chosen.includes(model)) throw new Error(`[cfg] model not selected — input shows "${chosen}", wanted "${model}"`);
  mark(`model = ${chosen}`);

  // 5 · Save — but ONLY if the form is dirty. When the exact provider+key+model is
  //     already persisted (a prior run saved it to the AI Hub's settings store, which
  //     survives clean-testground), the form is clean and Save stays disabled — that's a
  //     valid already-configured state (provider + model were verified above), so we
  //     proceed. If dirty, click Save and wait until it settles back to
  //     disabled-and-not-"Saving…" (the form clears its dirty flag only after a
  //     successful persist).
  await page.waitForTimeout(500); // let the async config-load settle before reading dirty state
  if (await page.locator('#btn-save-llm-provider').isEnabled().catch(() => false)) {
    await page.locator('#btn-save-llm-provider').click({ timeout: 6000 });
    await page
      .waitForFunction(() => {
        const b = document.querySelector('#btn-save-llm-provider') as HTMLButtonElement | null;
        return !!b && b.disabled && !(b.textContent || '').includes('Saving');
      }, undefined, { timeout: 20_000 })
      .catch(() => { throw new Error('[cfg] Save did not complete — provider settings were not persisted (still dirty after 20s).'); });
    mark('saved (provider config persisted)');
  } else {
    // Not dirty → already saved. Confirm the persisted values are the ones we want.
    const p = await page.locator('#llm-provider-select').inputValue().catch(() => '');
    const m = await page.locator('#llm-model-input').inputValue().catch(() => '');
    if (p !== ZAI_PROVIDER_ID || !m.includes(model)) {
      throw new Error(`[cfg] Save is disabled but the persisted config differs — provider="${p}", model="${m}" (wanted "${ZAI_PROVIDER_ID}"/"${model}").`);
    }
    mark('provider already configured (form clean) — Save skipped');
  }
}

/** Uncheck "Give db_query tool to Athena" if checked (the doc keeps it OFF). */
async function ensureDbQueryOff(page: Page): Promise<void> {
  const dbQuery = page.locator('#checkbox-give-db-query');
  if (await dbQuery.isVisible({ timeout: 1500 }).catch(() => false)) {
    if (await dbQuery.isChecked().catch(() => false)) {
      await dbQuery.uncheck().catch(() => {});
    }
  }
  await page.waitForTimeout(300);
}

/** Chat2DB: select the DB connection (by code when known), ensure Send Tables ON, Connect. */
/**
 * Screenshot ONLY the Chat2DB connection dropdown (showing the picked sample) + the Connect
 * button — no app header, Send-Tables toggle, status text, or browser chrome — so the docs make
 * it unmistakable what to choose and press. Isolates just those two controls in a throwaway div,
 * element-shots it, then restores each control to its exact original position. `name` = -dp base.
 */
async function captureConnectPicker(page: Page, name: string, dir?: string): Promise<void> {
  const wrapped = await page.evaluate(() => {
    const sel = document.querySelector('#database-selector') as HTMLElement | null;
    const btn = document.querySelector('#btn-connect-database') as HTMLElement | null;
    if (!sel || !btn) return false;
    // Remember each control's home so it can be put back byte-for-byte.
    (window as any).__connectRestore = [sel, btn].map((el) => ({ el, parent: el.parentNode, next: el.nextSibling }));
    const wrap = document.createElement('div');
    wrap.id = '__connect-shot';
    wrap.style.cssText =
      'display:inline-flex;align-items:center;gap:12px;padding:20px;' +
      'background:' + (getComputedStyle(document.body).backgroundColor || '#0b0b0b') + ';';
    sel.parentNode!.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    wrap.appendChild(btn);
    // Hide the app's only fixed chrome (navbar + toast container) by id so the element
    // screenshot isn't striped by scroll-stitching.
    ['app-navbar', 'app-toaster'].forEach((cid) => {
      const el = document.getElementById(cid) as HTMLElement | null;
      if (el) { el.dataset.qaPrevDisplay = el.style.display; el.style.display = 'none'; }
    });
    return true;
  });
  if (!wrapped) { console.warn(`[shot] ${name}: connect controls not found — skipped`); return; }
  try {
    await page.waitForTimeout(300);
    await captureDocsScreenshotOfElement(page, dp(name), '#__connect-shot', { outDir: dir, trimBottomEmpty: true });
  } finally {
    await page.evaluate(() => {
      const r = (window as any).__connectRestore || [];
      r.forEach((x: any) => { if (x.parent) x.parent.insertBefore(x.el, x.next); });
      document.getElementById('__connect-shot')?.remove();
      delete (window as any).__connectRestore;
      ['app-navbar', 'app-toaster'].forEach((cid) => {
        const el = document.getElementById(cid) as HTMLElement | null;
        if (el) { el.style.display = el.dataset.qaPrevDisplay || ''; delete el.dataset.qaPrevDisplay; }
      });
    }).catch(() => {});
    await page.waitForTimeout(150);
  }
}

async function connectChat2db(page: Page, connectionCode?: string, pickerShot?: string): Promise<void> {
  await page.goto(CHAT2DB_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const dbSelect = page.locator('#database-selector');
  await dbSelect.waitFor({ state: 'visible', timeout: 10_000 });
  // Select the exact connection by its <option value> (the connection code).
  if (connectionCode) {
    await dbSelect.selectOption({ value: connectionCode }).catch(() => {});
  }
  await page.waitForTimeout(500);
  // Send Tables ON (so Athena sees the schema). It's usually on by default.
  const sendTables = page.locator('#chat-send-tables');
  if (await sendTables.isVisible({ timeout: 1500 }).catch(() => false)) {
    if (!(await sendTables.isChecked().catch(() => true))) {
      await sendTables.check().catch(() => {});
    }
  }
  // Docs: make the "pick this sample + press Connect" step obvious — just those two controls.
  if (pickerShot) {
    await captureConnectPicker(page, pickerShot);
  }
  await page.locator('#btn-connect-database').click({ timeout: 5000 }).catch(() => {});
  // Wait on the status element (#connection-status) showing "Connected to …" — scoped to
  // the ID instead of a whole-body text scan.
  await page
    .waitForFunction(
      () => document.querySelector('#connection-status')?.textContent?.includes('Connected to') ?? false,
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => console.warn('[chat] "Connected to" not detected in #connection-status — continuing'));
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
    await page.locator('#chat-last-plantuml')
      .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2500); // kroki/plantuml render
  } else if (turn.reply === 'chart') {
    await page.locator('#chat-last-viz')
      .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  } else if (turn.reply === 'table') {
    await page.locator('#chat-last-table')
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
  const clear = page.locator('#btn-chat-clear');
  if (await clear.isVisible({ timeout: 2000 }).catch(() => false)) {
    await clear.click().catch(() => {});
    // The inline "Yes, clear" confirm appears — accept it.
    await page.locator('#btn-chat-clear-confirm').click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(800);
  }
}

/**
 * Capture a Chat2DB question+answer exchange for the docs.
 *  - justQAPair = true (default): screenshot ONLY the latest user question + Athena's answer,
 *    cropped tight to that pair — no app header, connection bar, or browser chrome — for a
 *    clean Q/A card. It wraps the two message elements in one div, un-clips every scrollable
 *    ancestor so a (possibly tall) exchange lays out fully, element-shots the wrapper, then
 *    restores the DOM exactly (nodes moved back, wrapper removed).
 *  - justQAPair = false: full-app screenshot (header + connection bar) to ground the reader —
 *    use for the FIRST exchange so people see where the chat lives.
 * `name` is the -dp basename; `dir` is the optional output subdir (defaults to the docs root).
 */
async function captureQAPair(page: Page, name: string, justQAPair: boolean = true, dir?: string): Promise<void> {
  if (!justQAPair) {
    // A full-app shot must show the app chrome — Athena's answers point at the top menu bar —
    // so first defensively clear any leftover hide left on the navbar / toaster by an earlier
    // element-crop, then lead with the QUESTION (scrollLatestExchangeIntoView leads with the
    // answer, hiding the question) so the reader sees the question + the start of the answer.
    await page.evaluate(() => {
      ['app-navbar', 'app-toaster'].forEach((cid) => {
        const el = document.getElementById(cid) as HTMLElement | null;
        if (el) { el.style.display = ''; delete el.dataset.qaPrevDisplay; }
      });
      (document.querySelector('#chat-user-last') || document.querySelector('#chat-assistant-last'))
        ?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    });
    await page.waitForTimeout(400);
    await captureDocsScreenshot(page, dp(name), dir);
    return;
  }

  const wrapped = await page.evaluate(() => {
    const u = document.querySelector('#chat-user-last') as HTMLElement | null;
    const a = document.querySelector('#chat-assistant-last') as HTMLElement | null;
    if (!u || !a || !u.parentNode) return false;
    // Order-independent: wrap from the earlier element through the later one.
    const uFirst = (u.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const start = uFirst ? u : a;
    const end = uFirst ? a : u;
    const wrap = document.createElement('div');
    wrap.id = '__qa-shot';
    wrap.style.cssText =
      'display:flex;flex-direction:column;gap:16px;padding:20px;' +
      'background:' + (getComputedStyle(document.body).backgroundColor || '#0b0b0b') + ';';
    start.parentNode!.insertBefore(wrap, start);
    const nodes: Node[] = [];
    let n: Node | null = start;
    while (n) { nodes.push(n); if (n === end) break; n = (n as ChildNode).nextSibling; }
    nodes.forEach((nd) => wrap.appendChild(nd));
    // Un-clip clipping ancestors so a tall wrapper renders fully for the element screenshot.
    // Track the touched ancestors by reference in a window array so we can restore them
    // without an attribute-selector re-query.
    const clipRestore: Array<{ el: HTMLElement; o: string; oy: string; mh: string; h: string }> = [];
    let p: HTMLElement | null = wrap.parentElement;
    while (p && p !== document.body) {
      clipRestore.push({ el: p, o: p.style.overflow, oy: p.style.overflowY, mh: p.style.maxHeight, h: p.style.height });
      p.style.overflow = 'visible'; p.style.overflowY = 'visible'; p.style.maxHeight = 'none'; p.style.height = 'auto';
      p = p.parentElement;
    }
    (window as any).__qaClipRestore = clipRestore;
    // Hide the app's only fixed chrome (navbar + toast container) by id: a tall element
    // screenshot is stitched by scrolling, so a position:fixed element otherwise re-appears
    // striped across the middle of the image.
    ['app-navbar', 'app-toaster'].forEach((cid) => {
      const el = document.getElementById(cid) as HTMLElement | null;
      if (el) { el.dataset.qaPrevDisplay = el.style.display; el.style.display = 'none'; }
    });
    return true;
  });

  if (!wrapped) {
    await scrollLatestExchangeIntoView(page);
    await captureDocsScreenshot(page, dp(name), dir);
    return;
  }

  try {
    await page.waitForTimeout(400);
    await captureDocsScreenshotOfElement(page, dp(name), '#__qa-shot', { outDir: dir, trimBottomEmpty: true });
  } finally {
    // Always restore: move the messages back out, remove the wrapper, un-do the ancestor styles.
    await page.evaluate(() => {
      const wrap = document.getElementById('__qa-shot');
      if (wrap && wrap.parentNode) {
        while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
        wrap.remove();
      }
      ((window as any).__qaClipRestore || []).forEach((s: any) => {
        const h = s.el as HTMLElement;
        h.style.overflow = s.o || ''; h.style.overflowY = s.oy || ''; h.style.maxHeight = s.mh || ''; h.style.height = s.h || '';
      });
      delete (window as any).__qaClipRestore;
      ['app-navbar', 'app-toaster'].forEach((cid) => {
        const el = document.getElementById(cid) as HTMLElement | null;
        if (el) { el.style.display = el.dataset.qaPrevDisplay || ''; delete el.dataset.qaPrevDisplay; }
      });
    }).catch(() => {});
    await page.waitForTimeout(150);
  }
}

/** Read the raw SQL out of the latest answer's "Show SQL" block (`#chat-last-sql-code`) so the
 *  test can paste Athena's OWN query into the Finetune editor (chat == editor). Empty string if
 *  the answer produced no SQL. */
async function readLatestSql(page: Page): Promise<string> {
  const code = page.locator('#chat-last-sql-code');
  if (!(await code.count().catch(() => 0))) return '';
  return (await code.innerText({ timeout: 3_000 }).catch(() => '')).trim();
}

/**
 * Expand the latest answer's "Show SQL" block and screenshot ONLY that SQL card
 * (`<details id="chat-last-sql">` — its rounded panel with the highlighted query, no app or
 * browser chrome), then collapse it again. Used to show that Athena turns natural language
 * into good SQL. No-op if the latest answer has no SQL. `name` is the -dp basename; `dir` the
 * optional output subdir.
 */
async function captureLatestSql(page: Page, name: string, dir?: string): Promise<void> {
  const sql = page.locator('#chat-last-sql');
  if (!(await sql.count().catch(() => 0))) return; // this answer produced no SQL
  await sql.evaluate((el) => { (el as HTMLDetailsElement).open = true; }).catch(() => {});
  await page.waitForTimeout(400);
  // Hide fixed/sticky (the fixed navbar) so a tall SQL block isn't striped by scroll-stitching.
  await page.evaluate(() => {
    ['app-navbar', 'app-toaster'].forEach((cid) => {
      const el = document.getElementById(cid) as HTMLElement | null;
      if (el) { el.dataset.qaPrevDisplay = el.style.display; el.style.display = 'none'; }
    });
  });
  try {
    await captureDocsScreenshotOfElement(page, dp(name), '#chat-last-sql', { outDir: dir, trimBottomEmpty: true });
  } finally {
    await page.evaluate(() => {
      ['app-navbar', 'app-toaster'].forEach((cid) => {
        const el = document.getElementById(cid) as HTMLElement | null;
        if (el) { el.style.display = el.dataset.qaPrevDisplay || ''; delete el.dataset.qaPrevDisplay; }
      });
      const d = document.querySelector('#chat-last-sql') as HTMLDetailsElement | null;
      if (d) d.open = false; // toggle "Show SQL" back off, then continue
    }).catch(() => {});
    await page.waitForTimeout(200);
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
      const last = document.querySelector('#chat-assistant-last') as HTMLElement | null;
      if (last) {
        last.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
      } else {
        const scroller = document.querySelector('#chat-conversation') as HTMLElement | null;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      }
    })
    .catch(() => {});
  await page.waitForTimeout(600);
}

/** Read the latest assistant reply's rendered text — used for logging so a reviewer (or
 *  Claude, when this flow is driven interactively) can see what Athena actually said. */
async function readLatestAnswer(page: Page): Promise<string> {
  return page.locator('#chat-assistant-last').innerText({ timeout: 5_000 }).catch(() => '');
}

/** Extract the candidate option titles from Athena's free-text "what else?" menu —
 *  numbered ("1. Title — …") or bulleted, stripping theme headers + markdown. Used by the
 *  Leo test to read her menu and pick the top two (her ordering = most common first). */
function extractOptions(text: string): string[] {
  const opts: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:\d+[.)]|[-*•])\s*\*{0,2}([^—:*\n][^—:*\n]{2,70}?)\s*(?:[—:*]|$)/);
    if (m) {
      const title = m[1].replace(/\*/g, '').trim();
      if (title && !/^\d+$/.test(title)) opts.push(title);
    }
  }
  return [...new Set(opts)];
}

/** Check the "Force recreate" box on the Update Agents tab (#checkbox-force-recreate). */
async function ensureForceRecreateOn(page: Page): Promise<void> {
  const force = page.locator('#checkbox-force-recreate');
  if (await force.isVisible({ timeout: 1500 }).catch(() => false)) {
    if (!(await force.isChecked().catch(() => false))) await force.check().catch(() => {});
  }
  await page.waitForTimeout(200);
}

/** Grey-out the API-key field before a screenshot so the real key NEVER lands in a doc
 *  image (the input is type=password already, but this is belt-and-suspenders). */
async function redactApiKeyForShot(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('#llm-api-key-input') as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ov = document.createElement('div');
    ov.id = '__api-key-redaction';
    ov.style.cssText =
      `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;` +
      `background:#9ca3af;border-radius:6px;z-index:99999;display:flex;align-items:center;` +
      `padding:0 10px;box-sizing:border-box;color:#374151;font-size:12px;font-family:monospace;`;
    ov.textContent = '••••••••••••••  (API key hidden)';
    document.body.appendChild(ov);
  });
}
async function unredactApiKey(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('__api-key-redaction')?.remove());
}

// ─────────────────────────────────────────────────────────────────────────────
// Two-act helpers — Chat2DB ask + Canvas build (build helpers lifted verbatim from
// the proven canvas-dashboard.screens.ts)
// ─────────────────────────────────────────────────────────────────────────────
type Settle = 'text' | 'diagram' | 'chart' | 'table';

/** Send a prompt, wait for the reply + its rendered visual, return her text. */
async function askAthena(page: Page, prompt: string, settle: Settle): Promise<string> {
  await page.locator('#chat-input-textarea').fill(prompt);
  await page.locator('#chat-input-textarea').press('Enter');
  await page.locator('#chat-thinking-indicator').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  await page.locator('#chat-thinking-indicator').waitFor({ state: 'hidden', timeout: 180_000 }).catch(() => {});
  const settleId: Record<Settle, string | null> = {
    text: null, diagram: '#chat-last-plantuml', chart: '#chat-last-viz', table: '#chat-last-table',
  };
  if (settleId[settle]) {
    await page.locator(settleId[settle]!).waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  }
  await page.waitForTimeout(1200);
  return page.locator('#chat-assistant-last').innerText({ timeout: 5_000 }).catch(() => '');
}

async function selectLastWidget(page: Page): Promise<void> {
  // Adding a widget auto-selects it (canvas-store sets selectedWidgetId), so the selected
  // widget already carries the #widgetActive marker — wait for it to confirm selection.
  await page.locator('#widgetActive').waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(4_000);
}

async function getLastWidgetId(page: Page): Promise<string> {
  // #widgetActive is the (hidden) marker the shell renders on the currently-selected widget;
  // it carries the widget's id in data-widget-id.
  const id = await page.locator('#widgetActive').getAttribute('data-widget-id');
  if (!id) throw new Error('No selected widget (#widgetActive) found in DOM');
  return id;
}

async function waitForWidgetData(page: Page, widgetId: string, timeoutMs: number = 30_000): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const state = await page.evaluate((id) => {
      if (!document.getElementById(`widget-${id}`)) return { phase: 'no-widget' as const };
      const errorEl = document.getElementById(`widgetError-${id}`);
      if (errorEl) return { phase: 'error' as const, message: (errorEl.textContent || '').trim().slice(0, 300) };
      if (document.getElementById(`widgetViz-${id}`)) return { phase: 'rendered' as const };
      return { phase: 'loading' as const };
    }, widgetId);
    if (state.phase === 'rendered') return;
    if (state.phase === 'error') throw new Error(`Widget ${widgetId} errored: ${state.message}`);
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Widget ${widgetId} data never arrived after ${timeoutMs}ms (phase=${state.phase}).`);
    }
    await page.waitForTimeout(300);
  }
}

async function setVisualization(page: Page, vizType: WidgetType): Promise<void> {
  const btn = page.locator(`#btnVisualizeAs-${vizType}`);
  if (!(await btn.isVisible({ timeout: 1_000 }).catch(() => false))) {
    const moreBtn = page.locator('#btnMoreWidgets');
    if (await moreBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(300);
    }
  }
  await btn.waitFor({ state: 'visible', timeout: 10_000 });
  await btn.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2_500);
}

async function tickFields(page: Page, dims: string[], measures: string[]): Promise<void> {
  await page.waitForTimeout(3_000);
  // A freshly-added cube widget starts with no fields selected (the store seeds an empty
  // visualQuery), so we only tick the ones we want — no pre-clear pass is needed.
  for (const d of dims) { await page.locator(`#chk-dim-${d}`).check(); await page.waitForTimeout(800); }
  for (const m of measures) { await page.locator(`#chk-meas-${m}`).check(); await page.waitForTimeout(800); }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(5_000);
}

/**
 * Highlight a widget with a prominent blue ring — box-shadow injected on #widget-<id> via
 * getElementById, so it's part of the element's own paint and survives ancestor overflow.
 * Returns dispose() to restore the prior shadow. (Same technique as canvas-dashboard.screens.ts.)
 */
async function highlightWidget(page: Page, widgetId: string): Promise<() => Promise<void>> {
  await page.evaluate((id) => {
    const el = document.getElementById(`widget-${id}`) as HTMLElement | null;
    if (!el) return;
    el.dataset.docscreenPrevShadow = el.style.boxShadow ?? '';
    el.dataset.docscreenPrevTransition = el.style.transition ?? '';
    el.style.transition = 'none';
    el.style.boxShadow = '0 0 0 4px #2563eb, 0 0 24px rgba(37, 99, 235, 0.45)';
  }, widgetId);
  return async () => {
    await page.evaluate((id) => {
      const el = document.getElementById(`widget-${id}`) as HTMLElement | null;
      if (!el) return;
      el.style.boxShadow = el.dataset.docscreenPrevShadow ?? '';
      el.style.transition = el.dataset.docscreenPrevTransition ?? '';
      delete el.dataset.docscreenPrevShadow;
      delete el.dataset.docscreenPrevTransition;
    }, widgetId);
  };
}

/**
 * Shot #1 for a cube widget: the just-built widget together with its cube panel on the right
 * showing the exact ticked fields Athena named, with a blue ring making clear which widget
 * this step built. Taken BEFORE arranging — while the widget is selected and the ticks are
 * still fresh (an arrangeWidgets reload would reset the cube checkboxes to empty). Re-ticks
 * idempotently in case a tab remount cleared the visual selection, then scrolls both the
 * widget (on the canvas) and the first ticked field (in the right panel) into view.
 */
async function captureWidgetCube(
  page: Page, widgetId: string, dims: string[], measures: string[], shot: string,
): Promise<void> {
  await page.locator('#btnDataTab').click({ timeout: 4_000 }).catch(() => {});
  await page.waitForTimeout(600);
  for (const d of dims) {
    const cb = page.locator(`#chk-dim-${d}`);
    if ((await cb.count()) > 0 && !(await cb.isChecked().catch(() => false))) { await cb.check().catch(() => {}); await page.waitForTimeout(300); }
  }
  for (const m of measures) {
    const cb = page.locator(`#chk-meas-${m}`);
    if ((await cb.count()) > 0 && !(await cb.isChecked().catch(() => false))) { await cb.check().catch(() => {}); await page.waitForTimeout(300); }
  }
  await page.waitForTimeout(500);
  await page.locator(`#widget-${widgetId}`).scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  const target = measures[0] ? `#chk-meas-${measures[0]}` : (dims[0] ? `#chk-dim-${dims[0]}` : null);
  if (target) { await page.locator(target).scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300); }
  const dispose = await highlightWidget(page, widgetId);
  await page.waitForTimeout(200);
  await captureDocsScreenshot(page, dp(shot));
  await dispose();
}

/**
 * Shot #1 for the Finetune (SQL) widget — the mirror of captureWidgetCube: the just-built
 * widget together with its Finetune SQL editor on the right showing the populated query, with
 * a blue ring on the widget so it's clear which one this is. Taken BEFORE arranging, with the
 * widget's data already loaded. Opens the fields (Data) tab → Finetune sub-tab so the editor
 * is visible, scrolls the widget (canvas) and the editor (right panel) into view, then rings
 * the widget.
 */
async function captureWidgetSql(page: Page, widgetId: string, shot: string): Promise<void> {
  await page.locator('#btnDataTab').click({ timeout: 4_000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.locator('#btnQueryTab-finetune').click({ timeout: 4_000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.locator(`#widget-${widgetId}`).scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('#sqlEditorContainer').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  const dispose = await highlightWidget(page, widgetId);
  await page.waitForTimeout(200);
  await captureDocsScreenshot(page, dp(shot));
  await dispose();
}

async function waitForVizRender(page: Page, widgetId: string, vizType: WidgetType): Promise<void> {
  const el = page.locator(`#widgetViz-${widgetId}`);
  await el.waitFor({ state: 'visible', timeout: 30_000 });
  if (vizType === 'number') {
    await el.evaluate((node) => new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        const text = (node.textContent || '').trim();
        if (text && text !== '...' && text !== '…') return resolve();
        if (Date.now() - start > 30_000) return reject(new Error(`number widget still loading (text="${text}")`));
        setTimeout(tick, 100);
      };
      tick();
    }));
  }
  await page.waitForTimeout(1000);
}

async function setNumberLabel(page: Page, label: string): Promise<void> {
  await page.locator('#btnDisplayTab').click(); await page.waitForTimeout(800);
  await page.locator('#inputNumberLabel').fill(label); await page.waitForTimeout(800);
  await page.locator('#btnDataTab').click(); await page.waitForTimeout(800);
}

async function setNumberFormat(page: Page, format: 'number' | 'currency' | 'percent' | 'raw'): Promise<void> {
  await page.locator('#btnDisplayTab').click(); await page.waitForTimeout(800);
  await page.locator('#selectNumberFormat').selectOption(format); await page.waitForTimeout(800);
  await page.locator('#btnDataTab').click(); await page.waitForTimeout(800);
}

async function setTrendLabel(page: Page, label: string): Promise<void> {
  await page.locator('#btnDisplayTab').click(); await page.waitForTimeout(800);
  await page.locator('#inputTrendLabel').fill(label); await page.waitForTimeout(800);
  await page.locator('#btnDataTab').click(); await page.waitForTimeout(800);
}

async function publishDashboard(page: Page): Promise<{ reportId: string; dashboardUrl: string }> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.locator('#btnPublishDashboard').click();
  const confirmBtn = page.locator('#btnPublishConfirm');
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
  const [response] = await Promise.all([
    page.waitForResponse(
      r => /\/explorations\/[^/]+\/export$/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 90_000 }),
    confirmBtn.click(),
  ]);
  const body = await response.json();
  await page.locator('#publishSuccess').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#btnPublishClose').click();
  return { reportId: body.reportId, dashboardUrl: body.dashboardUrl };
}
