// ═══════════════════════════════════════════════════════════════════════════════
// canvas-mechanics-helper.ts
// What the two Canvas specs of Phase C (`canvas-dashboard-demos.spec.ts`, `canvas-mechanics.spec.ts`)
// share: where the Canvas is, the sample connection the demos live on, and a canvas that is always
// taken back.
//
// `withFreshCanvas` is the one place that makes a canvas for a test and deletes it again, so a test
// that fails halfway leaves nothing behind (the `finally` of every use-case test, written once).
// ═══════════════════════════════════════════════════════════════════════════════

import { expect, type Page } from '@playwright/test';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

import { Helpers } from '../../utils/helpers';
import { E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH } from '../../utils/paths';
import { createFreshCanvas } from '../explore-data-test-helper';
import { DASH_DEMO_CONNECTION } from './demo-catalog';

export const AI_HUB_APP_ID = 'flowkraft-data-canvas';
export const AI_HUB_BASE_URL = 'http://localhost:8440';
export const CANVAS_LIST_URL = `${AI_HUB_BASE_URL}/explore-data`;
export const SERVER_URL = 'http://localhost:9090';

// ── The sample connections ────────────────────────────────────────────────────

/** The `showsamples` preference as it is now, read through the app's /api/dp proxy (session + CSRF). */
export async function readShowSamples(page: Page): Promise<boolean> {
  await page.goto(AI_HUB_BASE_URL);
  await page.waitForLoadState('networkidle');
  return page.evaluate(async () => {
    const res = await fetch('/api/dp/system/preferences');
    if (!res.ok) throw new Error(`read preferences failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    return body?.settings?.showsamples === true || body?.settings?.showsamples === 'true';
  });
}

/**
 * Turn the "show sample connections & cubes" preference on or off. The shipped sample connection the
 * demos live on is hidden from `#selectConnection` while it is off.
 */
export async function setShowSamples(page: Page, on: boolean): Promise<void> {
  await page.goto(AI_HUB_BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async (value) => {
    const res = await fetch('/api/dp/system/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { showsamples: value } }),
    });
    if (!res.ok) throw new Error(`set showsamples failed: ${res.status} ${await res.text()}`);
  }, on);
}

/** Pick a connection by its code (`selectConnection` builds the code of a connection the test made). */
export async function selectConnectionByCode(page: Page, code: string): Promise<void> {
  await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#selectConnection').selectOption(code);
  await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });
}

// ── A canvas that is always taken back ────────────────────────────────────────

/** The id of the canvas the page is on: the last part of `/explore-data/<id>`. */
export function canvasIdOf(page: Page): string {
  return page.url().split('/').pop()!;
}

/** Delete a canvas from the canvas list, as a person does. */
export async function deleteCanvasViaUI(page: Page, canvasId: string): Promise<void> {
  await page.goto(CANVAS_LIST_URL);
  await page.waitForLoadState('networkidle');
  // The delete button is opacity-0 until hover; force bypasses the visibility check
  await page.locator(`[id="btnDeleteCanvas-${canvasId}"]`).click({ force: true });
  await page.locator('#btnConfirmDeleteCanvas').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnConfirmDeleteCanvas').click();
  await page.waitForTimeout(1_500);
}

/** What the server saved for a canvas: `{id, name, state: '<json>', …}`. */
export async function readCanvas(page: Page, canvasId: string): Promise<Record<string, any>> {
  const response = await page.request.get(`${SERVER_URL}/api/explorations/${canvasId}`);
  expect(response.status(), `the saved canvas ${canvasId} can be read`).toBe(200);
  return response.json();
}

/**
 * A fresh, named canvas with the sample connection the demos live on picked, handed to `fn`, and
 * deleted again whatever `fn` did. `fn` receives the canvas id.
 */
export async function withFreshCanvas(
  page: Page,
  name: string,
  fn: (canvasId: string) => Promise<void>,
  connectionCode: string = DASH_DEMO_CONNECTION,
): Promise<void> {
  await createFreshCanvas(page, CANVAS_LIST_URL, name);
  await selectConnectionByCode(page, connectionCode);
  const canvasId = canvasIdOf(page);
  try {
    await fn(canvasId);
  } finally {
    await deleteCanvasViaUI(page, canvasId);
  }
}

/** A published report taken back, as the administrator (deleting the canvas removes its report too; a 404 here is fine). */
export async function deleteReportAsAdmin(reportId: string): Promise<void> {
  const response = await fetch(`${SERVER_URL}/api/reports/${reportId}`, {
    method: 'DELETE',
    headers: Helpers.apiKeyHeader(),
  });
  expect([200, 204, 404], `the report ${reportId} is taken back`).toContain(response.status);
}

// ── The truths the tests compare with ─────────────────────────────────────────

/**
 * The rows of a `dash_demo` table as they ship (`dashboards-demo-data/<table>.psv.gz`, the file the seed
 * loads): the truth a count, a minimum or a distinct list is compared with, read from the same rows the
 * database was filled from and never typed in by hand. Every cell is text.
 */
export function frozenRows(table: string): Array<Record<string, string>> {
  const file = path.join(
    E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH,
    'db-template/db/scripts/dashboards-demo-data',
    `${table}.psv.gz`,
  );
  const lines = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter((l: string) => l.length > 0);
  const head = lines[0].split('|');
  return lines.slice(1).map((line: string) => {
    const cells = line.split('|');
    return Object.fromEntries(head.map((h: string, i: number) => [h, cells[i] ?? '']));
  });
}
