// ═══════════════════════════════════════════════════════════════════════════════
// chat-capture-helper — shared machinery for capturing REAL AI Crew agent
// conversations from the FlowKraft AI Hub (:8440), for the docs.
//
// Extracted from chat2db.screens.ts so BOTH that spec AND chat2agents.screens.ts
// can drive the SAME provisioned AI Hub the same way. Everything here is
// agent-AGNOSTIC: it keys off the semantic IDs on the shared ChatAgentPage
// component (#chat-input-textarea, #chat-thinking-indicator, #chat-user-last,
// #chat-assistant-last, #chat-error-response, #chat-last-*, #btn-chat-clear…),
// which every chat2<agent> page exposes — so the same ask/capture helpers work
// for Athena (Chat2DB) AND Hephaestus/Hermes/Apollo/Pythia/Mnemosyne (their own
// chat2<agent> pages in OUR app — no Element Web / Matrix automation).
//
// Requires ZAI_API_KEY at run time (+ Docker for the AI Hub). Same posture as the
// original: best-effort against the live :8440 UI; run headed and adjust if a step
// misses.
// ═══════════════════════════════════════════════════════════════════════════════

import { Browser, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

import { Constants } from '../utils/constants';
import { FluentTester } from './fluent-tester';
import { SelfServicePortalsTestHelper } from './areas/self-service-portals-test-helper';
import { captureDocsScreenshotOfElement } from '../utils/docs-screenshot-helper';

// ── AI HUB ────────────────────────────────────────────────────────────────────
export const AI_HUB_APP_ID = 'flowkraft-data-canvas';
export const AI_HUB_BASE_URL = 'http://localhost:8440';
export const CHAT2DB_URL = `${AI_HUB_BASE_URL}/chat2db`;
export const AGENTS_URL = `${AI_HUB_BASE_URL}/agents`;
/** URL of an agent's own chat page in the AI Hub, e.g. agentChatUrl('hephaestus'). */
export const agentChatUrl = (slug: string) => `${AI_HUB_BASE_URL}/chat2${slug}`;

export const VIEWPORT = { width: 1500, height: 980 };

// ── z.ai PROVIDER (the agents' LLM) ─────────────────────────────────────────────
export const ZAI_PROVIDER_ID = process.env.ZAI_PROVIDER_ID || 'zai';
export const ZAI_MODEL = process.env.ZAI_MODEL || 'glm-5.2';
export const ZAI_API_KEY = process.env.ZAI_API_KEY || ''; // supply at run time; empty = skip

/** `<base>` → `<base>-dp.png` (writes beside the original for review). */
export const dp = (base: string) => `${base}-dp.png`;

/** What to wait for after a prompt: plain text, or a rendered PlantUML/chart/table. */
export type Settle = 'text' | 'diagram' | 'chart' | 'table';

// ── Provisioning helpers ────────────────────────────────────────────────────────

/**
 * Ensure the AI Hub starts like a FRESH install — remove any persisted `.env` — so
 * Letta boots WITHOUT a provider key and its model list is empty, forcing the
 * provisioning flow's restart-after-key path to actually run.
 * MUST be called before SelfServicePortalsTestHelper.startApp.
 */
export function clearAiHubEnv(): void {
  const envPath = path.resolve(
    process.env.PORTABLE_EXECUTABLE_DIR || '.',
    '_apps', 'flowkraft', '_ai-hub', '.env',
  );
  if (fs.existsSync(envPath)) {
    fs.rmSync(envPath, { force: true });
    console.log(`[clean] removed stale .env so Letta boots keyless @ ${envPath}`);
  } else {
    console.log('[clean] no stale .env — Letta will boot keyless (fresh-install state)');
  }
}

/**
 * Open the Settings dialog (#dialog-update-confirm) and report whether it opened.
 * MUST be on /agents — agents/page.tsx listens for the `trigger-update-agents`
 * window event (dispatched directly here; clicking the gear dropdown is flaky).
 */
export async function openSettingsDialog(page: Page): Promise<boolean> {
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
 * With the Settings dialog open: switch to the "API Provider" tab, select the z.ai
 * provider, paste ZAI_API_KEY, fetch + pick ZAI_MODEL, then Save. Throws on any step
 * that doesn't take when a real key is set. Leaves the dialog open.
 */
export async function configureZaiProvider(page: Page, model: string = ZAI_MODEL): Promise<void> {
  const strict = !!ZAI_API_KEY;
  const t0 = Date.now();
  const mark = (label: string) => console.log(`[cfg +${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

  await page.locator('#tab-api-provider').click({ timeout: 8000 });
  await page.locator('#llm-provider-select').waitFor({ state: 'visible', timeout: 8000 });
  mark('API Provider tab active');

  await page.locator('#llm-provider-select').selectOption(ZAI_PROVIDER_ID, { timeout: 6000 });
  const got = await page.locator('#llm-provider-select').inputValue().catch(() => '');
  if (got !== ZAI_PROVIDER_ID) {
    const msg = `provider not selected — wanted "${ZAI_PROVIDER_ID}", select shows "${got}"`;
    if (strict) throw new Error(`[cfg] ${msg}`);
    console.warn(`[cfg] ${msg} (no key — continuing)`);
  }
  mark(`provider = ${got || ZAI_PROVIDER_ID}`);

  if (!strict) {
    console.warn('[cfg] ZAI_API_KEY empty — skipping key/model/save.');
    return;
  }

  const keyInput = page.locator('#llm-api-key-input');
  await keyInput.waitFor({ state: 'visible', timeout: 6000 });
  await keyInput.fill(ZAI_API_KEY);
  if (!(await keyInput.inputValue())) throw new Error('[cfg] API key field did not populate');
  mark('API key filled');

  await page.locator('#btn-fetch-models').click({ timeout: 6000 });
  await page
    .waitForFunction(
      () => document.querySelector('#llm-model-input')?.getAttribute('placeholder') === 'Search models...',
      undefined,
      { timeout: 45_000 },
    )
    .catch(() => {
      throw new Error('[cfg] "Fetch Models" returned no models — check the z.ai key / provider (Coding Plan vs API Credits).');
    });
  mark('models fetched');

  const modelInput = page.locator('#llm-model-input');
  await modelInput.click();
  await modelInput.fill(model);
  const optionId = `#llm-model-option-${model.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  await page.locator(optionId).waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => { throw new Error(`[cfg] model "${model}" not in the fetched list.`); });
  await page.locator(optionId).click({ timeout: 4000 });
  const chosen = await modelInput.inputValue().catch(() => '');
  if (!chosen.includes(model)) throw new Error(`[cfg] model not selected — input shows "${chosen}"`);
  mark(`model = ${chosen}`);

  await page.waitForTimeout(500);
  if (await page.locator('#btn-save-llm-provider').isEnabled().catch(() => false)) {
    await page.locator('#btn-save-llm-provider').click({ timeout: 6000 });
    await page
      .waitForFunction(() => {
        const b = document.querySelector('#btn-save-llm-provider') as HTMLButtonElement | null;
        return !!b && b.disabled && !(b.textContent || '').includes('Saving');
      }, undefined, { timeout: 20_000 })
      .catch(() => { throw new Error('[cfg] Save did not complete (still dirty after 20s).'); });
    mark('saved (provider config persisted)');
  } else {
    const p = await page.locator('#llm-provider-select').inputValue().catch(() => '');
    const m = await page.locator('#llm-model-input').inputValue().catch(() => '');
    if (p !== ZAI_PROVIDER_ID || !m.includes(model)) {
      throw new Error(`[cfg] Save disabled but persisted config differs — provider="${p}", model="${m}".`);
    }
    mark('provider already configured (form clean) — Save skipped');
  }
}

/** Uncheck "Give db_query tool to Athena" if checked (the doc keeps it OFF). */
export async function ensureDbQueryOff(page: Page): Promise<void> {
  const dbQuery = page.locator('#checkbox-give-db-query');
  if (await dbQuery.isVisible({ timeout: 1500 }).catch(() => false)) {
    if (await dbQuery.isChecked().catch(() => false)) {
      await dbQuery.uncheck().catch(() => {});
    }
  }
  await page.waitForTimeout(300);
}

/**
 * Boot the AI Hub (Electron app → external :8440 browser) and provision the whole
 * crew once. Returns the external browser + the :8440 page. Requires ZAI_API_KEY.
 * Does NOT capture the 000_* setup shots — those already come from chat2db.screens.ts.
 */
export async function bootAndProvisionAiHub(
  firstPage: Page,
): Promise<{ externalBrowser: Browser; page: Page }> {
  if (!ZAI_API_KEY) {
    throw new Error(
      'ZAI_API_KEY is not set — provisioning + the agent conversations cannot run. ' +
      'Re-run with ZAI_API_KEY=<key> (ZAI_MODEL/ZAI_PROVIDER_ID optional).',
    );
  }

  clearAiHubEnv();

  // Start the AI Hub app from the DataPallas desktop UI (Apps screen).
  await SelfServicePortalsTestHelper.startApp(
    new FluentTester(firstPage).gotoApps(),
    AI_HUB_APP_ID,
  );
  await new FluentTester(firstPage).waitOnElementToBecomeVisible(`#btnLaunch_${AI_HUB_APP_ID}`);

  const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, { viewport: VIEWPORT });
  const page = ext.page;
  await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);

  // Provision on /agents (the only page where the Settings dialog's provisioning
  // listener is mounted).
  await page.goto(AGENTS_URL, { waitUntil: 'networkidle' });
  await page.locator('#agents-page-heading').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});

  if (!(await openSettingsDialog(page))) {
    throw new Error('Settings dialog did not open on /agents — cannot provision.');
  }
  await configureZaiProvider(page);

  await page.locator('#tab-update-agents').click({ timeout: 4000 }).catch(() => {});
  await page.locator('#checkbox-force-recreate').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  await ensureDbQueryOff(page);
  const forceRecreate = page.locator('#checkbox-force-recreate');
  if (!(await forceRecreate.isChecked().catch(() => false))) {
    await forceRecreate.check().catch(() => {});
  }

  await page.locator('#btn-update-confirm-yes').click({ timeout: 5000 }).catch(() => {});
  const logAppeared = await page
    .locator('#log-panel')
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!logAppeared) {
    throw new Error('Provisioning never started — the SSE log panel (#log-panel) never appeared.');
  }
  await page.locator('#provision-status').waitFor({ state: 'attached', timeout: 300_000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const provisioned = (await page.locator('#provision-status').getAttribute('data-status').catch(() => null)) === 'success';
  if (!provisioned) {
    throw new Error('Agent provisioning did NOT reach success — check the z.ai key/model.');
  }
  await page.locator('#log-panel-close-button').click({ timeout: 3000 }).catch(() => {});

  return { externalBrowser: ext.browser, page };
}

/** Close the external browser + stop the AI Hub app. Best-effort (for finally blocks). */
export async function teardownAiHub(firstPage: Page, externalBrowser: Browser | null): Promise<void> {
  if (externalBrowser) {
    await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch((e) =>
      console.error('[CLEANUP] close browser:', e));
  }
  try {
    await SelfServicePortalsTestHelper.stopApp(
      new FluentTester(firstPage).gotoApps(),
      AI_HUB_APP_ID,
    );
  } catch (e) {
    console.error('[CLEANUP] stop AI Hub:', e);
  }
}

// ── Chat driving + capture (agent-agnostic) ─────────────────────────────────────

/** Connect the Chat2DB screen to a DB connection (Athena/data questions only). */
export async function connectChat2db(page: Page, connectionCode?: string): Promise<void> {
  await page.goto(CHAT2DB_URL, { waitUntil: 'networkidle' });
  await page.locator('#database-selector').waitFor({ state: 'visible', timeout: 10_000 });
  if (connectionCode) {
    await page.locator('#database-selector').selectOption(connectionCode).catch(() => {});
  }
  // Send Tables ON so Athena gets schema context.
  const sendTables = page.locator('#chat-send-tables');
  if (await sendTables.isVisible({ timeout: 1500 }).catch(() => false)) {
    if (!(await sendTables.isChecked().catch(() => false))) await sendTables.check().catch(() => {});
  }
  await page.locator('#btn-connect-database').click({ timeout: 6000 }).catch(() => {});
  await page.locator('#connection-status').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

/**
 * Send a prompt to the currently-open chat, wait for the reply (+ its rendered
 * visual for non-text settles), and return the assistant's text. Works on ANY
 * chat2<agent> page — all share these ids via ChatAgentPage.
 */
export async function askAgent(page: Page, prompt: string, settle: Settle): Promise<string> {
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

/**
 * Ask a prompt and retry (up to `maxTries`) until the answer is CLEAN — no
 * #chat-error-response, plus SQL / table when required. Backs off long on
 * provider/rate-limit errors, short on plain errors. Skips the "failure then
 * correction" theater of the simulated demos: it just re-asks the same clean
 * question until a good answer lands. Clears the chat between tries so each
 * capture is a fresh, single Q/A pair.
 */
export async function askUntilClean(
  page: Page,
  label: string,
  prompt: string,
  settle: Settle,
  opts: { needSql?: boolean; needTable?: boolean; maxTries?: number; clearBetween?: boolean } = {},
): Promise<boolean> {
  const needSql = opts.needSql ?? false;
  const needTable = opts.needTable ?? (settle === 'table');
  const maxTries = opts.maxTries ?? 5;
  const clearBetween = opts.clearBetween ?? true;

  let clean = false;
  for (let attempt = 1; attempt <= maxTries && !clean; attempt++) {
    const errBefore = await page.locator('#chat-error-response').count().catch(() => 0);
    await askAgent(page, prompt, settle);
    const noError = (await page.locator('#chat-error-response').count().catch(() => 0)) <= errBefore;
    const hasSql = needSql ? (await page.locator('#chat-last-sql').count().catch(() => 0)) > 0 : true;
    const hasTable = needTable ? (await page.locator('#chat-last-table').count().catch(() => 0)) > 0 : true;
    clean = noError && hasSql && hasTable;
    console.log(`[chat:${label}] try ${attempt}/${maxTries}: noError=${noError} hasSql=${hasSql} hasTable=${hasTable} → ${clean ? 'CLEAN ✔' : 'retry'}`);
    if (clean || attempt >= maxTries) break;

    const errText = await page.locator('#chat-error-response').last().innerText({ timeout: 2_000 }).catch(() => '');
    const providerErr = /went wrong|too many|rate|timeout|try again|unavailable|overloaded/i.test(errText);
    const backoffMs = providerErr ? 60_000 : 8_000;
    console.log(`[chat:${label}] ${providerErr ? 'PROVIDER/rate-limit' : 'plain'} error — backing off ${backoffMs / 1000}s`);
    await page.waitForTimeout(backoffMs);
    // Re-ask from a clean slate so the captured pair is a single Q/A (not a stack of retries).
    if (clearBetween) await clearChat(page).catch(() => {});
  }
  if (!clean) {
    console.warn(`[chat:${label}] STILL not clean after ${maxTries} tries.`);
  }
  return clean;
}

/** Clear the current chat (reset to an empty conversation) via the clear button. */
export async function clearChat(page: Page): Promise<void> {
  const clearBtn = page.locator('#btn-chat-clear');
  if (!(await clearBtn.isVisible({ timeout: 1500 }).catch(() => false))) return;
  await clearBtn.click().catch(() => {});
  await page.locator('#btn-chat-clear-confirm').click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);
}

/**
 * Capture the latest Q/A pair (last user + last assistant message) as a tight
 * element screenshot — wraps them in a temporary #__qa-shot div, un-clips clipping
 * ancestors, hides the fixed navbar/toaster so scroll-stitching doesn't stripe the
 * image, shoots, then restores everything. Works on any chat2<agent> page.
 */
export async function captureQAPair(page: Page, name: string, dir?: string): Promise<void> {
  const wrapped = await page.evaluate(() => {
    const u = document.querySelector('#chat-user-last') as HTMLElement | null;
    const a = document.querySelector('#chat-assistant-last') as HTMLElement | null;
    if (!u || !a || !u.parentNode) return false;
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
    const clipRestore: Array<{ el: HTMLElement; o: string; oy: string; mh: string; h: string }> = [];
    let p: HTMLElement | null = wrap.parentElement;
    while (p && p !== document.body) {
      clipRestore.push({ el: p, o: p.style.overflow, oy: p.style.overflowY, mh: p.style.maxHeight, h: p.style.height });
      p.style.overflow = 'visible'; p.style.overflowY = 'visible'; p.style.maxHeight = 'none'; p.style.height = 'auto';
      p = p.parentElement;
    }
    (window as any).__qaClipRestore = clipRestore;
    ['app-navbar', 'app-toaster'].forEach((cid) => {
      const el = document.getElementById(cid) as HTMLElement | null;
      if (el) { el.dataset.qaPrevDisplay = el.style.display; el.style.display = 'none'; }
    });
    return true;
  });

  if (!wrapped) {
    console.warn(`[shot] ${name}: last Q/A pair not found — skipped`);
    return;
  }

  try {
    await page.waitForTimeout(400);
    await captureDocsScreenshotOfElement(page, dp(name), '#__qa-shot', { outDir: dir, trimBottomEmpty: true });
  } finally {
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
