// ═══════════════════════════════════════════════════════════════════════════════
// docs-screenshot-helper — shared utilities for the screenshot specs that
// produce PNGs consumed by the reportburster.com docs site.
//
// Provides two capture flavors:
//
//   captureDocsScreenshot(page, filename)
//     Plain viewport screenshot saved into the docs repo.
//
//   captureDocsScreenshotWithOverlay(page, filename, overlay)
//     Same, but with an HTML overlay injected into the page just before
//     capture (and removed afterwards) — used to reproduce the "compound
//     layered" visual style of the existing manual screenshots, where the
//     primary UI is captured together with a callout / tooltip / popup.
//
// The DOCS_IMAGES_DIR constant resolves the absolute path to the docs repo's
// `public/images/docs/` folder. Six levels up from this file lands on
// `c:\Projects`, then sideways into kraft-src-company-biz.
// ═══════════════════════════════════════════════════════════════════════════════

import { Page, Locator } from '@playwright/test';
import * as path from 'path';
import * as jetpack from 'fs-jetpack';
import sharp from 'sharp';

/**
 * Absolute path to the docs repo's `public/images/docs/` folder.
 *
 * This file lives at `e2e/utils/`, so 5 `..` hops up land on `c:\Projects`:
 *   utils → e2e → reporting → frend → reportburster → c:\Projects
 * then sideways into the docs repo.
 */
export const DOCS_IMAGES_DIR = path.resolve(
  __dirname,
  '..', '..', '..', '..', '..',
  'kraft-src-company-biz', 'flowkraft', 'www', 'reportburster.com',
  'public', 'images', 'docs',
);

/**
 * Inject a `<style>` tag that hides every toast notification on the page.
 *
 * Toasts pop in/out during the test as a side effect of user actions (Saved,
 * Connection started, etc.) and routinely leak into screenshots taken seconds
 * after the action. The injected style stays on the page for the lifetime of
 * the page — call once early in the test, then every subsequent capture is
 * toast-free without needing per-shot setup/teardown.
 *
 * Idempotent: re-calling doesn't stack multiple style tags (we look up by id).
 */
export async function hideToastsForScreenshots(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById('__hide_toasts_for_screenshots')) return;
    const style = document.createElement('style');
    style.id = '__hide_toasts_for_screenshots';
    style.textContent = `.toast { display: none !important; }`;
    document.head.appendChild(style);
  });
}

/** Take a viewport screenshot and save it directly into the docs repo. */
export async function captureDocsScreenshot(
  page: Page,
  filename: string,
  outDir: string = DOCS_IMAGES_DIR,
): Promise<void> {
  await jetpack.dirAsync(outDir);
  const fullPath = path.join(outDir, filename);
  await page.screenshot({ path: fullPath, fullPage: false });
  console.log(`[screenshot] ${filename} → ${fullPath}`);
}

/**
 * Scroll the element matched by `selector` to the vertical center of the
 * viewport, then take a normal viewport screenshot. Use for per-step captures
 * where the just-built widget should be visible and visually emphasized.
 *
 * `block: 'center'` ensures the element is mid-viewport (not flush at top
 * or bottom). 300ms settle covers the post-scroll repaint.
 */
export async function captureDocsScreenshotCenteredOn(
  page: Page,
  filename: string,
  selector: string,
  outDir: string = DOCS_IMAGES_DIR,
): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, selector);
  await page.waitForTimeout(300);
  await captureDocsScreenshot(page, filename, outDir);
}

/**
 * Capture the full scrollable page and downsample it to fit within the
 * viewport box, preserving aspect ratio. Use for the final "complete
 * dashboard" screenshot that doesn't fit in a single viewport screenshot
 * at native size.
 *
 * Pipeline: Playwright fullPage capture → sharp resize with Lanczos3 kernel
 * (sharp's default for downsampling and the gold standard for image-quality
 * downsizing — minimal aliasing, preserves edge sharpness) → write PNG.
 *
 * `fit: 'contain'` letterboxes with white background if the dashboard's
 * aspect ratio doesn't match the viewport's, so nothing is cropped.
 */
export async function captureDocsScreenshotFitToViewport(
  page: Page,
  filename: string,
  outDir: string = DOCS_IMAGES_DIR,
): Promise<void> {
  await jetpack.dirAsync(outDir);
  const fullPath = path.join(outDir, filename);
  const viewport = page.viewportSize() ?? { width: 1500, height: 900 };
  const buffer = await page.screenshot({ fullPage: true });
  await sharp(buffer)
    .resize({
      width: viewport.width,
      height: viewport.height,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: 'lanczos3',
    })
    .toFile(fullPath);
  console.log(`[screenshot] ${filename} → ${fullPath} (fit-to-viewport, lanczos3)`);
}

/**
 * Capture only a single element's bounding box, then downsample with Lanczos3
 * to a target width. Use when the "interesting" region is one container
 * (dashboard grid, single widget, table) and the surrounding chrome (left
 * tables panel, right config panel, top toolbar) would dilute the message.
 *
 * `locator.screenshot()` rasterises just the element. Combined with a 2x DPI
 * browser context, the raw capture is already crisp; Lanczos3 brings it to
 * the docs target width with minimal aliasing on thin strokes.
 */
export async function captureDocsScreenshotOfElement(
  page: Page,
  filename: string,
  selector: string,
  opts: {
    targetWidth?: number;
    outDir?: string;
    trimBottomEmpty?: boolean;
    trimBottomPadding?: number;
  } = {},
): Promise<void> {
  const outDir = opts.outDir ?? DOCS_IMAGES_DIR;
  await jetpack.dirAsync(outDir);
  const fullPath = path.join(outDir, filename);
  const el = page.locator(selector);
  await el.waitFor({ state: 'visible', timeout: 10_000 });
  // Don't rasterise an element caught mid-mount or mid-reflow — in that transient
  // it renders as an empty/stretched shell and the capture comes out uniformly
  // blank (this bit the #configPanel "*-display" shots). Wait until it has
  // rendered text content AND a stable size first. Best-effort: never hangs the
  // capture beyond the timeout.
  await waitForElementSettled(page, selector);
  let buffer = await el.screenshot();
  if (opts.trimBottomEmpty) {
    buffer = await trimBottomEmptyRows(buffer, opts.trimBottomPadding ?? 24);
  }
  const targetWidth = opts.targetWidth ?? (page.viewportSize()?.width ?? 1500);
  await sharp(buffer)
    .resize({ width: targetWidth, fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
    .toFile(fullPath);
  console.log(`[screenshot] ${filename} → ${fullPath} (element-scoped: ${selector}, lanczos3)`);
}

/**
 * Poll a cheap geometry+content signature for `selector` until the element has
 * rendered text content AND that signature is stable across two consecutive
 * frames — i.e. it has settled and is no longer mounting/reflowing. Used to
 * gate element screenshots so we never capture an empty/stretched shell.
 *
 * Best-effort: returns after `timeoutMs` regardless, so a legitimately
 * text-sparse element can never hang the capture. `selector` must be a plain
 * CSS selector (all call sites pass element IDs like `#configPanel`).
 */
async function waitForElementSettled(
  page: Page,
  selector: string,
  timeoutMs = 4_000,
): Promise<void> {
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
 * Like `captureDocsScreenshotOfElement`, but first paints the same outline+
 * outer-glow ring as `captureDocsScreenshotWithHighlight` around a child
 * `highlightSelector` inside the element being captured. The ring is
 * restored after the screenshot so the live page is untouched.
 *
 * Use when the screenshot should be panel-scoped (e.g. just `#configPanel`)
 * but the reader's eye needs to land on a specific control inside the panel —
 * e.g. the "Hey AI, Help Me…" button next to a SQL editor.
 */
export async function captureDocsScreenshotOfElementWithHighlight(
  page: Page,
  filename: string,
  elementSelector: string,
  highlightSelector: string,
  opts: { targetWidth?: number; outDir?: string; trimBottomEmpty?: boolean } = {},
): Promise<void> {
  const highlight = page.locator(highlightSelector);
  await highlight.waitFor({ state: 'visible', timeout: 10_000 });
  await highlight.scrollIntoViewIfNeeded().catch(() => {});

  await highlight.evaluate((el: HTMLElement) => {
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
    if (!el.style.position || el.style.position === 'static') {
      el.style.position = 'relative';
    }
    el.style.zIndex = '20';
  });
  await page.waitForTimeout(150);

  await captureDocsScreenshotOfElement(page, filename, elementSelector, opts);

  await highlight.evaluate((el: HTMLElement) => {
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
}

/**
 * Detect and crop trailing empty rows from the bottom of an element capture.
 * Used for tall config panels whose visible content (a handful of fields on
 * the Display tab) sits in the top third while the rest is uniform panel
 * background — leaving the screenshot 3x taller than the actual UI and
 * wasting vertical space when embedded in the blog.
 *
 * Cropping runs on the native (pre-resize) buffer so the Lanczos3 downsample
 * still happens on the cropped region — no quality loss from double-processing.
 * Background color is sampled from the bottom-left 3x3 region (we assume that
 * area is empty panel chrome on a tall config panel — if it isn't, the scan
 * finds content in the very first row scanned and returns the buffer
 * unchanged).
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
 * Wait until every `<rb-chart>` on the page has a child `<canvas>` whose pixel
 * buffer is non-empty. Chart.js renders asynchronously across animation frames
 * after `new Chart(...)`; capturing a screenshot before that finishes produces
 * blank charts in the PNG even though the live page looks fine.
 *
 * Returns immediately if no `<rb-chart>` elements are on the page.
 */
export async function waitForRbChartsRendered(
  page: Page,
  opts: { timeout?: number; settleMs?: number } = {},
): Promise<void> {
  const timeout = opts.timeout ?? 15_000;
  const settleMs = opts.settleMs ?? 800;
  await page.waitForFunction(
    () => {
      const charts = Array.from(document.querySelectorAll('rb-chart'));
      if (charts.length === 0) return true;
      return charts.every((el) => {
        const canvas =
          (el as any).shadowRoot?.querySelector('canvas') ||
          el.querySelector('canvas');
        if (!canvas) return false;
        if (!canvas.width || !canvas.height) return false;
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx) return false;
          // Scan the whole canvas with a stride — doughnut/pie charts have
          // a transparent hole in the center, so a center-only sample yields
          // permanent false negatives. Any non-zero alpha anywhere proves
          // Chart.js has drawn something.
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = img.data;
          for (let i = 3; i < data.length; i += 16) {
            if (data[i] !== 0) return true;
          }
          return false;
        } catch {
          return false;
        }
      });
    },
    undefined,
    { timeout, polling: 250 },
  );
  await page.waitForTimeout(settleMs);
}

/**
 * Capture a screenshot that shows the ENTIRE content of a scrollable container
 * (a react-grid-layout canvas, a long table, anything with `overflow:auto`) by
 * temporarily growing the browser viewport to match the container's true
 * content height, then downsampling to a target output size via Lanczos3.
 *
 * Why not just `fullPage: true`?  When a page has a fixed-height container
 * with `overflow:auto`, `fullPage` captures only what's inside the visible
 * portion of that container — the rest is "below the fold" inside the scroll
 * area and never makes it into the screenshot. The canvas builder is exactly
 * this pattern: its grid sits inside `h-[calc(100vh-4rem)]; overflow-auto`,
 * so widgets past the viewport simply don't appear.
 *
 * The fix: measure the container's `scrollHeight` (the real content size),
 * resize the viewport to a height that gives the container enough room to
 * render all of it without scrolling, capture, then resize back. The page
 * itself does the layout work; we just give it more canvas. Result is a
 * pixel-perfect capture of every widget, then Lanczos3 (the gold-standard
 * downsampling kernel for photographic + text content) brings it back to
 * the docs' target display size with minimal blur.
 *
 * @param containerSelector CSS selector for the scrollable container whose
 *   `scrollHeight` we should size to. For the explore-data canvas use
 *   `.react-grid-layout`. Defaults to that.
 * @param chromePadding extra pixels added to the resized viewport to account
 *   for top nav + canvas toolbar + filter bar above the grid. Defaults to 200.
 */
export async function captureDocsScreenshotWholeContent(
  page: Page,
  filename: string,
  outDir: string = DOCS_IMAGES_DIR,
  options: {
    containerSelector?: string;
    chromePadding?: number;
    /** Optional highlight ring applied to a target element before capture
     *  and reverted after. Same outline+drop-shadow recipe as
     *  captureDocsScreenshotWithHighlight — leaves the element interior
     *  untouched, just rings it on the outside. */
    highlight?: HighlightSpec;
  } = {},
): Promise<void> {
  const { containerSelector = '.react-grid-layout', chromePadding = 200, highlight } = options;

  // Apply highlight (if requested) BEFORE the viewport resize so the styles
  // get painted on the first repaint at the new size.
  //
  // Highlight is BEST-EFFORT: if the target element isn't on the current page
  // (e.g. caller passed `#parameterBarContainer` but we're on the published
  // dashboard where that wrapper id doesn't exist — only the canvas builder
  // has it), we log a warning and capture WITHOUT the ring instead of
  // throwing. A missing decoration shouldn't fail a screenshot run.
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
        // Lift above siblings so the outer ring isn't overpainted by the
        // adjacent toolbar/body backgrounds that paint after this element.
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

  await jetpack.dirAsync(outDir);
  const fullPath = path.join(outDir, filename);

  const originalViewport = page.viewportSize() ?? { width: 1500, height: 900 };

  // Measure the real content height. scrollHeight gives the height the
  // container WOULD have if its overflow:auto were lifted — exactly what we
  // need to size the viewport to.
  const contentHeight = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return 0;
    return Math.max(el.scrollHeight, el.getBoundingClientRect().height);
  }, containerSelector);

  if (contentHeight === 0) {
    // Container not found / has no content — fall back to the plain
    // fit-to-viewport behaviour rather than fail loudly.
    console.log(`[screenshot] containerSelector '${containerSelector}' not found; falling back to fit-to-viewport.`);
    await captureDocsScreenshotFitToViewport(page, filename, outDir);
    return;
  }

  const tallViewport = {
    width: originalViewport.width,
    height: Math.max(originalViewport.height, Math.ceil(contentHeight + chromePadding)),
  };

  await page.setViewportSize(tallViewport);
  // Let CSS settle: the canvas container is `h-[calc(100vh-4rem)]` so a
  // viewport resize changes its computed height; react-grid-layout repaints.
  await page.waitForTimeout(800);

  const buffer = await page.screenshot({ fullPage: true });

  // Restore original viewport so subsequent steps see the world they expect.
  await page.setViewportSize(originalViewport);
  await page.waitForTimeout(200);

  // Downsample the tall capture back to the original viewport dimensions
  // with Lanczos3 — the same kernel used by fit-to-viewport. Lanczos3 is the
  // de-facto standard for image downscaling: better at preserving thin
  // strokes (chart axes, gridlines, small text) than bilinear/bicubic, and
  // it doesn't over-sharpen the way nearest-neighbour would.
  await sharp(buffer)
    .resize({
      width: originalViewport.width,
      height: originalViewport.height,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: 'lanczos3',
    })
    .toFile(fullPath);

  // Revert highlight last, after the screenshot is written, so a follow-up
  // capture starts from a clean visual baseline. Only revert if we actually
  // applied styles — otherwise we'd be calling evaluate on a target that
  // wasn't found, throwing on the very thing the best-effort branch was
  // designed to swallow.
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

  console.log(`[screenshot] ${filename} → ${fullPath} (whole-content via ${tallViewport.height}px viewport, lanczos3)`);
}

export interface OverlaySpec {
  /** Inline CSS for the overlay container — typically positioning, size, background. */
  cssText: string;
  /** Inner HTML of the overlay — text, checkboxes, arrows, etc. */
  html: string;
}

/**
 * Inject a styled HTML overlay into the live page, take the screenshot
 * (so the overlay is rasterized as part of the same image), then remove the
 * overlay so it doesn't leak into the next capture.
 *
 * Use for any callout, tooltip, arrow or highlight box that the docs reader
 * sees together with the primary UI but that isn't part of any real app state.
 */
export async function captureDocsScreenshotWithOverlay(
  page: Page,
  filename: string,
  overlay: OverlaySpec,
): Promise<void> {
  await page.evaluate((spec) => {
    const div = document.createElement('div');
    div.id = '__docscreen_overlay';
    div.style.cssText = `position:fixed;z-index:99999;pointer-events:none;${spec.cssText}`;
    div.innerHTML = spec.html;
    document.body.appendChild(div);
  }, overlay);
  // Brief settle so the browser paints the new layer before the screenshot.
  await page.waitForTimeout(150);
  await captureDocsScreenshot(page, filename);
  await page.evaluate(() => document.getElementById('__docscreen_overlay')?.remove());
}

export interface HighlightSpec {
  /**
   * CSS selector (or a Locator whose first matching element selector we can
   * resolve via `evaluate`) for the element to highlight. The outline is
   * applied DIRECTLY to that element via inline styles, so it can never
   * drift relative to the rendered button.
   */
  target: Locator;
  /** Optional callout text rendered just below the highlighted element. */
  calloutText?: string;
}

/**
 * Highlight a target element by applying a discreet outline directly to its
 * own DOM node (so the outline can never drift), inject a callout positioned
 * relative to the live element, take the screenshot, then revert.
 *
 * Why this over the previous sharp+bbox approach:
 *  - Sharp+bbox drew the rectangle from a Playwright `boundingBox()` call
 *    captured a beat before the screenshot. Any layout settle between bbox
 *    and capture (e.g. a connection dropdown re-render) shifted the button
 *    but not the rect → visible misalignment.
 *  - Applying the outline as inline CSS on the element itself means the
 *    rectangle is laid out by the browser at the moment the screenshot is
 *    taken — no coordinate math, no drift.
 *  - The callout is positioned relative to `getBoundingClientRect()` *inside*
 *    `page.evaluate` so it's also computed live, and its z-index is high
 *    enough to clear stacked Bootstrap modal backdrops.
 */
export async function captureDocsScreenshotWithHighlight(
  page: Page,
  filename: string,
  spec: HighlightSpec,
  outDir: string = DOCS_IMAGES_DIR,
): Promise<void> {
  await spec.target.waitFor({ state: 'visible', timeout: 10_000 });
  await spec.target.scrollIntoViewIfNeeded().catch(() => {});

  // Strategy: paint the highlight OUTSIDE the element via `outline` plus a
  // soft outer drop-shadow. Earlier we used `inset` box-shadow so the ring
  // could survive inside a cube modal's `overflow:hidden`, but that bleeds
  // into the element's interior — on small targets (a header button, a
  // single-line label) the inner glow tints the text background blue and
  // reads as "the text is selected" instead of "this thing is highlighted."
  //
  // `outline` doesn't take up layout space (so the surrounding UI doesn't
  // shift), `outline-offset` lets the ring sit just outside the element's
  // border box, and the outer drop-shadow softens the edge. The element's
  // interior — and its text — is left completely untouched.
  //
  // If you ever need the inset variant back (for clipped-by-overflow:hidden
  // ancestors), add an option to HighlightSpec and branch here.
  //
  // The callout is appended to the same element's nearest .modal-content (or
  // body fallback) so it inherits the same stacking context as the modal.
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

    // Outer ring (doesn't paint inside the element):
    //   - `outline` = 3px solid blue, offset 2px from the border box
    //   - outer drop shadow = soft 14px blue glow
    el.style.transition = 'none';
    el.style.outline = '3px solid #2563eb';
    el.style.outlineOffset = '2px';
    el.style.boxShadow = '0 0 14px rgba(37, 99, 235, 0.35)';
    // Lift above sibling backgrounds so they don't overpaint the outer ring.
    // Flex/grid siblings (canvas toolbar above, body below) paint AFTER us
    // in DOM order and their bg-colors would otherwise cover the 5px-wide
    // outline + 14px glow that extends outside our border-box.
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
      const headHtml = `<div style="font-weight:600; font-size:13px; color:#2563eb;">↑ ${escapeHtml(lines[0] ?? '')}</div>`;
      const tailHtml = lines[1]
        ? `<div style="font-size:12px; color:#475569; margin-top:2px; line-height:1.4;">${escapeHtml(lines[1])}</div>`
        : '';
      callout.innerHTML = headHtml + tailHtml;
      // Append the callout INSIDE the modal-content so it shares the modal's
      // stacking context (z-index 1050+) instead of competing with it from
      // body. If there's no modal, fall back to body.
      const modalContent = el.closest('.modal-content') as HTMLElement | null;
      (modalContent ?? document.body).appendChild(callout);
    }
  }, spec.calloutText);

  await page.waitForTimeout(150);

  await jetpack.dirAsync(outDir);
  const fullPath = path.join(outDir, filename);
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

  console.log(`[screenshot+highlight] ${filename} → ${fullPath}`);
}

/**
 * Highlight MULTIPLE elements at once (by CSS selector) with the DataPallas
 * brand-orange ring, then take one full-viewport screenshot, then revert every
 * element so the live page is left untouched.
 *
 * Same outline + outer-glow recipe as `captureDocsScreenshotWithHighlight`, but:
 *   - colour is DataPallas orange `#d18361` instead of blue `#2563eb`
 *   - it rings SEVERAL elements in a single shot (one annotated reference frame
 *     that points the reader at, e.g., a tab button AND a menu item together)
 *   - no callout text — these shots reproduce the user's multi-arrow annotated
 *     references where the orange rings alone carry the meaning.
 *
 * BEST-EFFORT per selector: a missing / detached element is skipped (logged,
 * never thrown) so one absent target can't fail the whole screenshot run —
 * important here because the action button on an app card is `Start` when the
 * app is stopped but `Launch` when running, so callers pass both and we ring
 * whichever is actually present.
 *
 * The save/restore uses the SAME `dataset.docscreen*` inline-style snapshot
 * approach as the single-element helper, applied independently to each element.
 *
 * Each target is either a bare selector string (outside ring, the default) or
 * `{ selector, inset: true }` for elements flush against a clipping boundary
 * (overflow:hidden ancestor, a sticky header painting over the top, or the
 * viewport edge) where the outside ring would be cut off — there the ring is
 * painted just INSIDE the element so it stays fully visible.
 */
export type HighlightTarget = string | { selector: string; inset?: boolean };

export async function captureDocsScreenshotWithHighlights(
  page: Page,
  filename: string,
  targets: HighlightTarget[],
  outDir: string = DOCS_IMAGES_DIR,
): Promise<void> {
  // Normalize bare-string targets to the object form (outside ring by default).
  const specs = targets.map((t) =>
    typeof t === 'string' ? { selector: t, inset: false } : { selector: t.selector, inset: t.inset ?? false },
  );

  // Apply the orange ring to every selector that resolves to a visible element.
  // Track which ones we actually styled so we only revert those afterwards.
  const applied: string[] = [];
  for (const { selector, inset } of specs) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 4_000 });
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.evaluate((el: HTMLElement, useInset: boolean) => {
        // Snapshot originals so the live page is restored byte-for-byte.
        el.dataset.docscreenPrevShadow = el.style.boxShadow ?? '';
        el.dataset.docscreenPrevTransition = el.style.transition ?? '';
        el.dataset.docscreenPrevOutline = el.style.outline ?? '';
        el.dataset.docscreenPrevOutlineOffset = el.style.outlineOffset ?? '';
        el.dataset.docscreenPrevPosition = el.style.position ?? '';
        el.dataset.docscreenPrevZIndex = el.style.zIndex ?? '';

        el.style.transition = 'none';
        if (useInset) {
          // INSET ring — DataPallas brand orange painted just INSIDE the
          // element's edges (plus the same soft outer glow). Used for targets
          // that sit flush against a clipping boundary the outside ring can't
          // escape: the tab buttons (the sticky top-menu header overpaints the
          // ring's top, and the first tab's left hits the window edge) and the
          // dashboards table (its bottom reaches the viewport edge). A solid
          // 3px inset ring is always fully visible; unlike the abandoned inset
          // *glow*, it doesn't tint the interior/text.
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.boxShadow = 'inset 0 0 0 3px #d18361, 0 0 14px rgba(209, 131, 97, 0.45)';
        } else {
          // Outer ring — painted OUTSIDE the element (outline doesn't take
          // layout space; the soft drop-shadow softens it).
          el.style.outline = '3px solid #d18361';
          el.style.outlineOffset = '2px';
          el.style.boxShadow = '0 0 14px rgba(209, 131, 97, 0.45)';
        }
        // Lift above sibling backgrounds so they don't overpaint the ring/glow.
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

  await jetpack.dirAsync(outDir);
  const fullPath = path.join(outDir, filename);
  await page.screenshot({ path: fullPath, fullPage: false });

  // Revert only the elements we actually styled.
  for (const selector of applied) {
    const locator = page.locator(selector).first();
    await locator.evaluate((el: HTMLElement) => {
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

  console.log(`[screenshot+highlights] ${filename} → ${fullPath} (${applied.length}/${specs.length} rings)`);
}
