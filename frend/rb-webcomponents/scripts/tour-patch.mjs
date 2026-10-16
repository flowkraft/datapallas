#!/usr/bin/env node
/**
 * Turns a dashboard's HTML into a tour-enabled one: puts the "Show Tour" button (<rb-dashboard-tour>)
 * on top of the page. The dashboard is left exactly as it was otherwise - nothing in the product's
 * own files changes, so a dashboard published from its canvas keeps its tests, and any copy of it
 * (a demo, a website) can be given a tour.
 *
 *   node scripts/tour-patch.mjs <dashboard.html> [more.html ...] [options]
 *   npm run custom:tour-patch -- <dashboard.html> --out <patched.html>        (inside frend/reporting)
 *
 *   --out <file>      write the patched page here (one input only)
 *   --out-dir <dir>   write each patched page here under its own name
 *   --in-place        overwrite the input
 *   (none of these)   print the patched page on stdout
 *   --label <text>    the button's words (default "Show Tour")
 *   --into <id>       the element to put the button in (default pageBar, the page's top bar)
 *   --check           change nothing; exit 1 if a page could not be patched
 *
 * Where the button goes, in this order:
 *   1. first inside the element with the id `--into` (the page bar a dashboard with a cube tile has);
 *   2. else in a bar of its own, just above the parameter bar, or above the grid if there is none;
 *   3. else in a bar of its own, first thing inside the page's root (`rb-dashboard-root`), for a page laid
 *      out by hand.
 * A page that already has the button is left as it is, and a page with no place for it is an error
 * (exit 1) - never a page that silently lacks the button.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TAG = 'rb-dashboard-tour';

/** The attribute text for a label: only the button's words, so quotes and markup are made harmless. */
function attr(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @param {string} html the dashboard page
 * @param {{ label?: string, into?: string }} [options]
 * @returns {{ html: string, changed: boolean, where: 'already' | 'bar' | 'own-bar' | 'root' }}
 * @throws when the page has no place for the button
 */
export function patchTour(html, options = {}) {
  const label = options.label ?? 'Show Tour';
  const into = options.into ?? 'pageBar';
  if (html.includes('<' + TAG)) return { html, changed: false, where: 'already' };

  const labelAttr = label === 'Show Tour' ? '' : ` label="${attr(label)}"`;

  // 1. The page's own bar: the button goes first, on the left; the bar's other items stay on the right.
  const idEsc = into.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bar = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\bid="${idEsc}"[^>]*>`).exec(html);
  if (bar) {
    const at = bar.index + bar[0].length;
    const tag = `\n      <${TAG}${labelAttr} style="margin-right:auto"></${TAG}>`;
    return { html: html.slice(0, at) + tag + html.slice(at), changed: true, where: 'bar' };
  }

  // 2 and 3. A bar of its own. It has the page bar's class, so it is left out of a printout like the bar is,
  // and the style it needs written on it, for a page that has no such class of its own.
  const own =
    `<div class="rb-page-bar" id="tourBar" style="display:flex;justify-content:flex-start;margin-bottom:12px">\n` +
    `      <${TAG}${labelAttr}></${TAG}>\n` +
    `    </div>\n`;
  const above = /<div\b[^>]*\bid="parameterBarContainer"|<div\b[^>]*\bclass="[^"]*\bdashboard-grid\b/.exec(html);
  if (above) {
    return { html: html.slice(0, above.index) + '    ' + own + html.slice(above.index), changed: true, where: 'own-bar' };
  }
  const root = /<div\b[^>]*\bclass="[^"]*\brb-dashboard-root\b[^"]*"[^>]*>/.exec(html);
  if (root) {
    const at = root.index + root[0].length;
    return { html: html.slice(0, at) + '\n    ' + own + html.slice(at), changed: true, where: 'root' };
  }

  throw new Error(`no place for the tour button: no element with id="${into}", no parameter bar, no dashboard grid and no rb-dashboard-root`);
}

function parseArgs(argv) {
  const o = { inputs: [], out: '', outDir: '', inPlace: false, check: false, label: undefined, into: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--out') o.out = value();
    else if (a === '--out-dir') o.outDir = value();
    else if (a === '--in-place') o.inPlace = true;
    else if (a === '--check') o.check = true;
    else if (a === '--label') o.label = value();
    else if (a === '--into') o.into = value();
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.inputs.push(a);
  }
  return o;
}

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
    if (o.inputs.length === 0) throw new Error('give the dashboard html to patch (see the top of this file)');
    if (o.out && o.inputs.length > 1) throw new Error('--out takes one input; use --out-dir for several');
  } catch (e) {
    console.error(`tour-patch: ${e.message}`);
    process.exit(2);
  }
  let failed = 0;
  for (const input of o.inputs) {
    try {
      const result = patchTour(readFileSync(input, 'utf8'), { label: o.label, into: o.into });
      if (o.check) {
        console.error(`${input}: ok (${result.where})`);
        continue;
      }
      if (o.out) writeFileSync(o.out, result.html);
      else if (o.outDir) {
        mkdirSync(o.outDir, { recursive: true });
        writeFileSync(join(o.outDir, basename(input)), result.html);
      } else if (o.inPlace) writeFileSync(input, result.html);
      else process.stdout.write(result.html);
      console.error(`${input}: ${result.changed ? 'patched (' + result.where + ')' : 'already has the tour button'}`);
    } catch (e) {
      failed++;
      console.error(`${input}: ${e.message}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
