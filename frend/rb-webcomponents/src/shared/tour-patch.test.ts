//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/tour-patch.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { patchTour } from '../../scripts/tour-patch.mjs';

const WITH_BAR = '<div class="rb-dashboard-root">\n    <div class="rb-page-bar" id="pageBar">\n      <rb-sql-vendor id="pageSqlVendor"></rb-sql-vendor>\n    </div>\n  <div class="dashboard-grid"></div></div>';
const NO_BAR = '<div class="rb-dashboard-root">\n    <div id="parameterBarContainer" class="params-bar"><rb-parameters></rb-parameters></div>\n  <div class="dashboard-grid"></div></div>';
const GRID_ONLY = '<div class="rb-dashboard-root">\n  <div class="dashboard-grid"></div></div>';

describe('the tour button put on a dashboard page', () => {
  test('a page with a bar gets the button first in it, on the left, the rest of the bar unchanged', () => {
    const r = patchTour(WITH_BAR);
    assert.equal(r.where, 'bar');
    assert.ok(r.changed);
    assert.match(r.html, /id="pageBar">\n      <rb-dashboard-tour style="margin-right:auto"><\/rb-dashboard-tour>\n      <rb-sql-vendor id="pageSqlVendor">/);
    // Nothing else moved: taking the button out gives the page back.
    assert.equal(r.html.replace(/\n      <rb-dashboard-tour style="margin-right:auto"><\/rb-dashboard-tour>/, ''), WITH_BAR);
  });

  test('a page with no bar gets one of its own above the parameter bar, or above the grid', () => {
    const a = patchTour(NO_BAR);
    assert.equal(a.where, 'own-bar');
    assert.ok(a.html.indexOf('<rb-dashboard-tour') < a.html.indexOf('id="parameterBarContainer"'));
    assert.match(a.html, /class="rb-page-bar" id="tourBar" style="display:flex;justify-content:flex-start;margin-bottom:12px"/);
    const b = patchTour(GRID_ONLY);
    assert.ok(b.html.indexOf('<rb-dashboard-tour') < b.html.indexOf('class="dashboard-grid"'));
    // A page laid out by hand has neither: the bar is the first thing in its root.
    const c = patchTour('<div class="rb-dashboard-root"><style></style><div class="kpi-row"></div></div>');
    assert.equal(c.where, 'root');
    assert.ok(c.html.indexOf('<rb-dashboard-tour') < c.html.indexOf('<style>'));
  });

  test('a page that has the button is left as it is, so the patch can be run twice', () => {
    const once = patchTour(WITH_BAR).html;
    const twice = patchTour(once);
    assert.equal(twice.changed, false);
    assert.equal(twice.html, once);
  });

  test('a label is the button\'s words and nothing a page could run', () => {
    assert.match(patchTour(WITH_BAR, { label: 'Take the tour' }).html, /<rb-dashboard-tour label="Take the tour" /);
    assert.match(patchTour(WITH_BAR, { label: '"><script>x</script>' }).html, /label="&quot;&gt;&lt;script&gt;x&lt;\/script&gt;"/);
  });

  test('another bar can be named, and a page with no place for the button is an error', () => {
    const custom = '<header id="top"></header><div class="dashboard-grid"></div>';
    assert.equal(patchTour(custom, { into: 'top' }).where, 'bar');
    assert.throws(() => patchTour('<p>not a dashboard</p>'), /no place for the tour button/);
  });
});

describe('every dashboard that ships can be given a tour', () => {
  const dir = '../../asbl/src/main/external-resources/db-template/config/samples';
  const templates = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .flatMap((d) => readdirSync(join(dir, d.name)).filter((f) => f.endsWith('-template.html')).map((f) => join(dir, d.name, f)))
        .filter((f) => readFileSync(f, 'utf8').includes('rb-dashboard-root'))
    : [];

  test('the shipped dashboard templates take the patch, and the patched page still has all its widgets', () => {
    assert.ok(templates.length > 0, 'the shipped templates were found (this test runs inside frend/rb-webcomponents)');
    for (const file of templates) {
      const html = readFileSync(file, 'utf8');
      const r = patchTour(html);
      assert.ok(r.changed || r.where === 'already', file);
      const widgets = (page: string) => (page.match(/<rb-[a-z-]+/g) ?? []).filter((t) => t !== '<rb-dashboard-tour');
      assert.deepEqual(widgets(r.html), widgets(html), file);
    }
  });
});
