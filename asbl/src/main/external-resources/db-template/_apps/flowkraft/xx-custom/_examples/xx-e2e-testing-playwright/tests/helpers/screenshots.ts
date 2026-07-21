// ═══════════════════════════════════════════════════════════════════════════════
// screenshots — annotated screenshots for your specs: ring a DOM element, add a callout,
// capture. SELF-ROUTING — a caller never deals with paths.
//
// OFF BY DEFAULT. Every capture below is a no-op unless TAKE_SCREENSHOT=true, so a
// spec can call them unconditionally and a normal run pays nothing:
//
//   TAKE_SCREENSHOT=true BASE_URL=http://host.docker.internal:8500 \
//     docker compose run --rm e2e npx playwright test tests/billing-portal.spec.ts --project=chromium
//
// WHERE THE PNGs GO — decided in HERE, never by the caller:
//
//   screenshots/<spec-file-name>/<yyyy.MM.dd_HH.mm.ss.SSS>/<filename>
//
// The stamp is computed ONCE per process, so every shot of a single run lands in
// the SAME folder and no run can ever overwrite another. Callers just say
// `captureScreenshot(page, '01-dashboard.png')` and know nothing about paths.
// Because /work is bind-mounted, the folder appears on your host, not just in the
// container.
//
// `sharp` earns its place here: Lanczos3 is the gold standard for downscaling — it
// preserves thin strokes (chart axes, gridlines, small text) where bilinear/bicubic
// smear them. It powers fit-to-viewport, element downsampling, bottom-trimming and the
// whole-content capture below.
// ═══════════════════════════════════════════════════════════════════════════════

import { Page, Locator, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

/** Screenshots are OPT-IN: nothing is captured unless TAKE_SCREENSHOT=true. */
export const TAKE_SCREENSHOT = process.env.TAKE_SCREENSHOT === 'true';

/**
 * ONE stamp per process, evaluated at import — so every capture of a single run
 * shares a folder, and a re-run never overwrites the previous one.
 */
const RUN_STAMP = (() => {
  const d = new Date();
  const p = (n: number, width = 2) => String(n).padStart(width, '0');
  return (
    `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}` +
    `_${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  );
})();

/** The running spec's file name, minus its extension — e.g. `billing-portal`. */
function specName(): string {
  try {
    return path.basename(test.info().file).replace(/\.spec\.(ts|js)$/, '');
  } catch {
    // Called outside a running test — still produce something usable.
    return 'unknown-spec';
  }
}

/** `<cwd>/screenshots/<spec>/<stamp>` — this run's own folder. */
export function screenshotDir(): string {
  return path.join(process.cwd(), 'screenshots', specName(), RUN_STAMP);
}

/** Resolve the absolute output path, creating this run's folder on first use. */
function outPath(filename: string): string {
  const dir = screenshotDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}

/**
 * Inject a `<style>` tag that hides every toast notification on the page.
 *
 * Toasts pop in/out during a test as a side effect of user actions (Saved, etc.)
 * and routinely leak into screenshots taken seconds after the action. The style
 * stays for the lifetime of the page — call once early, then every later capture
 * is toast-free. Idempotent: re-calling doesn't stack style tags.
 */
export async function hideToastsForScreenshots(page: Page): Promise<void> {
  if (!TAKE_SCREENSHOT) return;
  await page.evaluate(() => {
    if (document.getElementById('__hide_toasts_for_screenshots')) return;
    const style = document.createElement('style');
    style.id = '__hide_toasts_for_screenshots';
    style.textContent = `.toast { display: none !important; }`;
    document.head.appendChild(style);
  });
}

/** Plain viewport screenshot into this run's folder. */
export async function captureScreenshot(page: Page, filename: string): Promise<void> {
  if (!TAKE_SCREENSHOT) return;
  const fullPath = outPath(filename);
  await page.screenshot({ path: fullPath, fullPage: false });
  console.log(`[screenshot] ${filename} -> ${fullPath}`);
}

/**
 * Scroll `selector` to the vertical centre of the viewport, then capture. Use for
 * per-step shots where the thing you just did should be visible and mid-frame.
 */
export async function captureScreenshotCenteredOn(
  page: Page,
  filename: string,
  selector: string,
): Promise<void> {
  if (!TAKE_SCREENSHOT) return;
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  }, selector);
  await page.waitForTimeout(300);
  await captureScreenshot(page, filename);
}

/**
 * Poll a cheap geometry+content signature until the element has rendered text AND
 * is stable across two frames — i.e. it has settled and is no longer mounting or
 * reflowing. Gates element captures so we never rasterise an empty shell.
 *
 * Best-effort: returns after `timeoutMs` regardless, so a legitimately text-sparse
 * element can never hang a capture.
 */
async function waitForElementSettled(page: Page, selector: string, timeoutMs = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let prev = '';
  let stableHits = 0;
  while (Date.now() < deadline) {
    const sig = await page.evaluate((sel) => {
      const node = document.querySelector(sel);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const textLen = (node.textContent || '').replace(/\s+/g, '').length;
      return `${Math.round(r.height)}|${node.childElementCount}|${textLen}`;
    }, selector);
    // `|0` at the end means textLen === 0 → still an empty shell.
    const hasContent = sig !== null && !/\|0$/.test(sig);
    if (hasContent && sig === prev) {
      if (++stableHits >= 2) return;
    } else {
      stableHits = 0;
    }
    prev = sig ?? '';
    await page.waitForTimeout(120);
  }
}

/**
 * Capture ONLY one element's bounding box, then downsample to a target width with
 * Lanczos3. Use when the interesting region is one container and the surrounding
 * chrome (side panels, toolbars) would dilute the message.
 *
 * `trimBottomEmpty` first crops trailing empty rows — for tall panels whose real
 * content sits in the top third and whose remainder is uniform background.
 */
export async function captureScreenshotOfElement(
  page: Page,
  filename: string,
  selector: string,
  opts: { targetWidth?: number; trimBottomEmpty?: boolean; trimBottomPadding?: number } = {},
): Promise<void> {
  if (!TAKE_SCREENSHOT) return;
  const el = page.locator(selector);
  await el.waitFor({ state: 'visible', timeout: 10_000 });
  // Never rasterise an element caught mid-mount or mid-reflow: in that transient it
  // renders as an empty/stretched shell and the capture comes out uniformly blank.
  await waitForElementSettled(page, selector);
  let buffer = await el.screenshot();
  if (opts.trimBottomEmpty) {
    buffer = await trimBottomEmptyRows(buffer, opts.trimBottomPadding ?? 24);
  }
  const targetWidth = opts.targetWidth ?? (page.viewportSize()?.width ?? 1280);
  const fullPath = outPath(filename);
  await sharp(buffer)
    .resize({ width: targetWidth, fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
    .toFile(fullPath);
  console.log(`[screenshot] ${filename} -> ${fullPath} (element: ${selector}, lanczos3)`);
}

/**
 * Capture the full scrollable page and downsample it to fit the viewport box,
 * preserving aspect ratio. Use for the "whole thing" shot that doesn't fit in one
 * viewport at native size.
 *
 * `fit: 'contain'` letterboxes on white when the aspect ratios differ, so nothing is
 * ever cropped away.
 */
export async function captureScreenshotFitToViewport(page: Page, filename: string): Promise<void> {
  if (!TAKE_SCREENSHOT) return;
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const buffer = await page.screenshot({ fullPage: true });
  const fullPath = outPath(filename);
  await sharp(buffer)
    .resize({
      width: viewport.width,
      height: viewport.height,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: 'lanczos3',
    })
    .toFile(fullPath);
  console.log(`[screenshot] ${filename} -> ${fullPath} (fit-to-viewport, lanczos3)`);
}

/**
 * Detect and crop trailing empty rows off the bottom of an element capture — for
 * tall panels whose visible content sits in the top third while the rest is uniform
 * background, leaving the shot several times taller than the actual UI.
 *
 * Cropping runs on the NATIVE (pre-resize) buffer so the Lanczos3 downsample still
 * happens on the cropped region — no quality loss from double-processing. The
 * background colour is sampled from the bottom-left; if that area is NOT empty, the
 * scan finds content on the very first row it looks at and returns the buffer
 * unchanged.
 */
async function trimBottomEmptyRows(buffer: Buffer, padding: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) return buffer;

  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  // Sample bottom-left 3x3 to estimate empty panel background. Average to
  // smooth anti-aliasing on any nearby border.
  let bgR = 0, bgG = 0, bgB = 0, samples = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const x = dx + 2;
      const y = height - 5 + dy;
      if (y < 0 || y >= height || x < 0 || x >= width) continue;
      const idx = (y * width + x) * ch;
      bgR += data[idx];
      bgG += data[idx + 1];
      bgB += data[idx + 2];
      samples++;
    }
  }
  if (samples === 0) return buffer;
  bgR = Math.round(bgR / samples);
  bgG = Math.round(bgG / samples);
  bgB = Math.round(bgB / samples);

  const colorTolerance = 14; // forgives sub-pixel AA + JPEG-ish dust
  const minNonBgPixelsPerRow = 4; // 4+ deviant pixels = real content row

  // Walk rows from the bottom up until we hit a row with enough non-bg pixels.
  let contentBottomY = -1;
  for (let y = height - 1; y >= 0; y--) {
    let nonBg = 0;
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * ch;
      if (
        Math.abs(data[idx] - bgR) > colorTolerance ||
        Math.abs(data[idx + 1] - bgG) > colorTolerance ||
        Math.abs(data[idx + 2] - bgB) > colorTolerance
      ) {
        nonBg++;
        if (nonBg >= minNonBgPixelsPerRow) break;
      }
    }
    if (nonBg >= minNonBgPixelsPerRow) {
      contentBottomY = y;
      break;
    }
  }

  if (contentBottomY < 0) return buffer; // entire image is bg — nothing to crop
  const cropHeight = Math.min(height, contentBottomY + 1 + padding);
  if (cropHeight >= height - 4) return buffer; // not enough empty bottom to bother

  return await sharp(buffer)
    .extract({ left: 0, top: 0, width, height: cropHeight })
    .toBuffer();
}

/**
 * Capture the ENTIRE content of a scrollable container (anything with
 * `overflow:auto`) by temporarily growing the viewport to the container's true
 * content height, capturing, then downsampling back with Lanczos3.
 *
 * Why not just `fullPage: true`? With a fixed-height `overflow:auto` container,
 * fullPage captures only what sits inside its VISIBLE portion — everything scrolled
 * out of that inner box simply never appears. Measuring `scrollHeight` and handing
 * the page more canvas lets the browser lay ALL of it out; then we just shrink the
 * result back down.
 *
 * The optional highlight ring is BEST-EFFORT: a target that isn't on this page is
 * logged and skipped rather than thrown — a missing decoration must not fail a run.
 */
export async function captureScreenshotWholeContent(
  page: Page,
  filename: string,
  options: { containerSelector: string; chromePadding?: number; highlight?: HighlightSpec },
): Promise<void> {
  if (!TAKE_SCREENSHOT) return;
  const { containerSelector, chromePadding = 200, highlight } = options;

  // Apply the ring BEFORE the resize so it is painted on the first repaint at the
  // new size.
  let highlightApplied = false;
  if (highlight) {
    try {
      await highlight.target.waitFor({ state: 'visible', timeout: 5_000 });
      await highlight.target.evaluate((el: HTMLElement) => {
        el.dataset.docscreenPrevShadow = el.style.boxShadow ?? '';
        el.dataset.docscreenPrevOutline = el.style.outline ?? '';
        el.dataset.docscreenPrevOutlineOffset = el.style.outlineOffset ?? '';
        el.dataset.docscreenPrevPosition = el.style.position ?? '';
        el.dataset.docscreenPrevZIndex = el.style.zIndex ?? '';
        el.style.outline = '3px solid #2563eb';
        el.style.outlineOffset = '2px';
        el.style.boxShadow = '0 0 14px rgba(37, 99, 235, 0.35)';
        if (!el.style.position || el.style.position === 'static') {
          el.style.position = 'relative';
        }
        el.style.zIndex = '20';
      });
      highlightApplied = true;
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      console.log(`[screenshot] highlight target not found, capturing without ring: ${msg.split('\n')[0]}`);
    }
  }

  const originalViewport = page.viewportSize() ?? { width: 1280, height: 720 };

  // scrollHeight is the height the container WOULD have with its overflow lifted —
  // exactly what we need to size the viewport to.
  const contentHeight = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return 0;
    return Math.max(el.scrollHeight, el.getBoundingClientRect().height);
  }, containerSelector);

  if (contentHeight === 0) {
    console.log(`[screenshot] containerSelector '${containerSelector}' not found; falling back to fit-to-viewport.`);
    await captureScreenshotFitToViewport(page, filename);
    return;
  }

  const tallViewport = {
    width: originalViewport.width,
    height: Math.max(originalViewport.height, Math.ceil(contentHeight + chromePadding)),
  };

  await page.setViewportSize(tallViewport);
  // Let CSS settle — a viewport-height-derived container recomputes and repaints.
  await page.waitForTimeout(800);

  const buffer = await page.screenshot({ fullPage: true });

  // Restore the viewport so later steps see the world they expect.
  await page.setViewportSize(originalViewport);
  await page.waitForTimeout(200);

  const fullPath = outPath(filename);
  await sharp(buffer)
    .resize({
      width: originalViewport.width,
      height: originalViewport.height,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: 'lanczos3',
    })
    .toFile(fullPath);

  // Revert LAST, after the file is written, so a follow-up capture starts from a
  // clean baseline. Only revert what we actually applied.
  if (highlight && highlightApplied) {
    await highlight.target.evaluate((el: HTMLElement) => {
      el.style.boxShadow = el.dataset.docscreenPrevShadow ?? '';
      el.style.outline = el.dataset.docscreenPrevOutline ?? '';
      el.style.outlineOffset = el.dataset.docscreenPrevOutlineOffset ?? '';
      el.style.position = el.dataset.docscreenPrevPosition ?? '';
      el.style.zIndex = el.dataset.docscreenPrevZIndex ?? '';
      delete el.dataset.docscreenPrevShadow;
      delete el.dataset.docscreenPrevOutline;
      delete el.dataset.docscreenPrevOutlineOffset;
      delete el.dataset.docscreenPrevPosition;
      delete el.dataset.docscreenPrevZIndex;
    });
  }

  console.log(`[screenshot] ${filename} -> ${fullPath} (whole-content via ${tallViewport.height}px viewport, lanczos3)`);
}

export interface OverlaySpec {
  /** Inline CSS for the overlay container — typically positioning, size, background. */
  cssText: string;
  /** Inner HTML of the overlay — text, arrows, etc. */
  html: string;
}

/**
 * Inject a styled HTML overlay into the live page, capture (so the overlay is
 * rasterised as part of the same image), then remove it so it can't leak into the
 * next shot. Use for callouts/arrows that are not part of any real app state.
 */
export async function captureScreenshotWithOverlay(
  page: Page,
  filename: string,
  overlay: OverlaySpec,
): Promise<void> {
  if (!TAKE_SCREENSHOT) return;
  await page.evaluate((spec) => {
    const div = document.createElement('div');
    div.id = '__docscreen_overlay';
    div.style.cssText = `position:fixed;z-index:99999;pointer-events:none;${spec.cssText}`;
    div.innerHTML = spec.html;
    document.body.appendChild(div);
  }, overlay);
  await page.waitForTimeout(150);
  await captureScreenshot(page, filename);
  await page.evaluate(() => document.getElementById('__docscreen_overlay')?.remove());
}

export interface HighlightSpec {
  /** The element to ring. The outline is applied to its own node, so it cannot drift. */
  target: Locator;
  /** Optional callout text rendered just below the highlighted element. */
  calloutText?: string;
}

/**
 * Highlight ONE element and capture — the workhorse for "look HERE" screenshots.
 *
 * The ring is applied as inline CSS on the element's own DOM node, so the browser
 * lays it out at the moment of capture: no bounding-box maths, no drift. It is
 * painted OUTSIDE the element (`outline` + `outline-offset` + a soft outer glow),
 * never inside — an inset glow tints the interior and reads as "this text is
 * selected" rather than "this thing is highlighted". `outline` takes no layout
 * space, so nothing around it shifts. Everything is reverted afterwards, so the
 * live page is left exactly as it was found.
 */
export async function captureScreenshotWithHighlight(
  page: Page,
  filename: string,
  spec: HighlightSpec,
): Promise<void> {
  if (!TAKE_SCREENSHOT) return;
  await spec.target.waitFor({ state: 'visible', timeout: 10_000 });
  await spec.target.scrollIntoViewIfNeeded().catch(() => {});

  await spec.target.evaluate((el: HTMLElement, calloutText: string | undefined) => {
    const escapeHtml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Save originals so we can restore later.
    el.dataset.docscreenPrevShadow = el.style.boxShadow ?? '';
    el.dataset.docscreenPrevTransition = el.style.transition ?? '';
    el.dataset.docscreenPrevOutline = el.style.outline ?? '';
    el.dataset.docscreenPrevOutlineOffset = el.style.outlineOffset ?? '';
    el.dataset.docscreenPrevPosition = el.style.position ?? '';
    el.dataset.docscreenPrevZIndex = el.style.zIndex ?? '';

    el.style.transition = 'none';
    el.style.outline = '3px solid #2563eb';
    el.style.outlineOffset = '2px';
    el.style.boxShadow = '0 0 14px rgba(37, 99, 235, 0.35)';
    // Lift above sibling backgrounds, which paint after us in DOM order and would
    // otherwise overpaint the ring + glow that live OUTSIDE our border box.
    if (!el.style.position || el.style.position === 'static') {
      el.style.position = 'relative';
    }
    el.style.zIndex = '20';

    if (calloutText) {
      const rect = el.getBoundingClientRect();
      const callout = document.createElement('div');
      callout.id = '__docscreen_highlight_callout';
      const lines = calloutText.split('\n');
      callout.style.cssText = [
        'position: fixed',
        `left: ${Math.round(rect.left)}px`,
        `top: ${Math.round(rect.bottom + 12)}px`,
        'width: 320px',
        'background: #ffffff',
        'border: 1px solid #2563eb',
        'border-left: 4px solid #2563eb',
        'border-radius: 4px',
        'padding: 8px 12px',
        "font-family: 'Source Sans Pro', Arial, sans-serif",
        'color: #1e293b',
        'box-shadow: 0 4px 14px rgba(15, 23, 42, 0.18)',
        'z-index: 99999',
        'pointer-events: none',
      ].join('; ') + ';';
      const headHtml = `<div style="font-weight:600; font-size:13px; color:#2563eb;">&uarr; ${escapeHtml(lines[0] ?? '')}</div>`;
      const tailHtml = lines[1]
        ? `<div style="font-size:12px; color:#475569; margin-top:2px; line-height:1.4;">${escapeHtml(lines[1])}</div>`
        : '';
      callout.innerHTML = headHtml + tailHtml;
      // Share the modal's stacking context when inside one; fall back to body.
      const modalContent = el.closest('.modal-content') as HTMLElement | null;
      (modalContent ?? document.body).appendChild(callout);
    }
  }, spec.calloutText);

  await page.waitForTimeout(150);

  const fullPath = outPath(filename);
  await page.screenshot({ path: fullPath, fullPage: false });

  await spec.target.evaluate((el: HTMLElement) => {
    document.getElementById('__docscreen_highlight_callout')?.remove();
    el.style.boxShadow = el.dataset.docscreenPrevShadow ?? '';
    el.style.transition = el.dataset.docscreenPrevTransition ?? '';
    el.style.outline = el.dataset.docscreenPrevOutline ?? '';
    el.style.outlineOffset = el.dataset.docscreenPrevOutlineOffset ?? '';
    el.style.position = el.dataset.docscreenPrevPosition ?? '';
    el.style.zIndex = el.dataset.docscreenPrevZIndex ?? '';
    delete el.dataset.docscreenPrevShadow;
    delete el.dataset.docscreenPrevTransition;
    delete el.dataset.docscreenPrevOutline;
    delete el.dataset.docscreenPrevOutlineOffset;
    delete el.dataset.docscreenPrevPosition;
    delete el.dataset.docscreenPrevZIndex;
  });

  console.log(`[screenshot+highlight] ${filename} -> ${fullPath}`);
}

/**
 * A target for `captureScreenshotWithHighlights`. Use the object form with
 * `inset: true` for elements flush against a clipping boundary (an
 * overflow:hidden ancestor, a sticky header, the viewport edge) where an outside
 * ring would be cut off — there the ring is painted just INSIDE instead.
 */
export type HighlightTarget = string | { selector: string; inset?: boolean };

/**
 * Ring SEVERAL elements at once and take ONE shot — the multi-arrow annotated
 * reference. Same recipe as the single-element version, but in brand orange and
 * without callouts: the rings alone carry the meaning.
 *
 * BEST-EFFORT per selector: a missing element is logged and skipped, never
 * thrown — one absent target can't fail a whole screenshot run.
 */
export async function captureScreenshotWithHighlights(
  page: Page,
  filename: string,
  targets: HighlightTarget[],
): Promise<void> {
  if (!TAKE_SCREENSHOT) return;
  const specs = targets.map((t) =>
    typeof t === 'string' ? { selector: t, inset: false } : { selector: t.selector, inset: t.inset ?? false },
  );

  const applied: string[] = [];
  for (const { selector, inset } of specs) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 4_000 });
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.evaluate((el: HTMLElement, useInset: boolean) => {
        el.dataset.docscreenPrevShadow = el.style.boxShadow ?? '';
        el.dataset.docscreenPrevTransition = el.style.transition ?? '';
        el.dataset.docscreenPrevOutline = el.style.outline ?? '';
        el.dataset.docscreenPrevOutlineOffset = el.style.outlineOffset ?? '';
        el.dataset.docscreenPrevPosition = el.style.position ?? '';
        el.dataset.docscreenPrevZIndex = el.style.zIndex ?? '';

        el.style.transition = 'none';
        if (useInset) {
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.boxShadow = 'inset 0 0 0 3px #d18361, 0 0 14px rgba(209, 131, 97, 0.45)';
        } else {
          el.style.outline = '3px solid #d18361';
          el.style.outlineOffset = '2px';
          el.style.boxShadow = '0 0 14px rgba(209, 131, 97, 0.45)';
        }
        if (!el.style.position || el.style.position === 'static') {
          el.style.position = 'relative';
        }
        el.style.zIndex = '20';
      }, inset);
      applied.push(selector);
    } catch {
      console.log(`[screenshot+highlights] target not found, skipping: ${selector}`);
    }
  }

  await page.waitForTimeout(150);

  const fullPath = outPath(filename);
  await page.screenshot({ path: fullPath, fullPage: false });

  for (const selector of applied) {
    await page.locator(selector).first().evaluate((el: HTMLElement) => {
      el.style.boxShadow = el.dataset.docscreenPrevShadow ?? '';
      el.style.transition = el.dataset.docscreenPrevTransition ?? '';
      el.style.outline = el.dataset.docscreenPrevOutline ?? '';
      el.style.outlineOffset = el.dataset.docscreenPrevOutlineOffset ?? '';
      el.style.position = el.dataset.docscreenPrevPosition ?? '';
      el.style.zIndex = el.dataset.docscreenPrevZIndex ?? '';
      delete el.dataset.docscreenPrevShadow;
      delete el.dataset.docscreenPrevTransition;
      delete el.dataset.docscreenPrevOutline;
      delete el.dataset.docscreenPrevOutlineOffset;
      delete el.dataset.docscreenPrevPosition;
      delete el.dataset.docscreenPrevZIndex;
    }).catch(() => {});
  }

  console.log(`[screenshot+highlights] ${filename} -> ${fullPath} (${applied.length}/${specs.length} rings)`);
}
