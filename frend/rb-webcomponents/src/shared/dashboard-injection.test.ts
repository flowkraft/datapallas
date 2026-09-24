// The one thing that stands between a shared dashboard and a page of empty tiles.
//
// A published dashboard's template is authored HTML full of self-contained rb-* widgets: each one
// fetches its own config and data on mount, reading its credential and its API base from its own
// attributes. <rb-dashboard> holds both for the page, but attributes do not inherit, so unless the
// template is prepared as it is injected, a visitor who opened the dashboard through a share link
// sees the frame and nothing in it — while a signed-in viewer sees everything, because a cookie
// carries by itself. That asymmetry is why this is tested here, in plain string terms, rather than
// left to the one browser test that can see it.
//
// No test framework and no dependency: the module under test is pure string work, and Node runs it
// as it is.
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/dashboard-injection.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepareDashboardHtml } from './dashboard-injection.ts';
import type { DashboardHostContext } from './dashboard-injection.ts';

const DASHBOARD = 'quarterly-dashboard';
const TOKEN = 'header.payload.signature';

/** A share-linked page: a credential that lives in an attribute, and an API base the page knows. */
function sharedPage(overrides: Partial<DashboardHostContext> = {}): DashboardHostContext {
  return {
    reportId: DASHBOARD,
    apiBaseUrl: '/api',
    embedToken: TOKEN,
    reportParams: {},
    ...overrides,
  };
}

/** What a published template really looks like: the API base baked in at authoring time. */
const TEMPLATE = [
  '<div class="rb-dashboard-root">',
  '  <rb-parameters api-base-url="http://localhost:9090/api"></rb-parameters>',
  '  <rb-value component-id="atomicValues" api-base-url="http://localhost:9090/api"></rb-value>',
  '  <rb-chart component-id="revenueTrend" api-base-url="http://localhost:9090/api"></rb-chart>',
  '  <rb-tabulator component-id="topCustomers" api-base-url="http://localhost:9090/api"></rb-tabulator>',
  '  <rb-pivot-table component-id="orderExplorer" api-base-url="http://localhost:9090/api"></rb-pivot-table>',
  '</div>',
].join('\n');

const WIDGETS = ['rb-parameters', 'rb-value', 'rb-chart', 'rb-tabulator', 'rb-pivot-table'];

/** The attributes of the first `tag` element in `html`, as one string. */
function attributesOf(html: string, tag: string): string {
  const match = new RegExp('<' + tag + '((?:"[^"]*"|[^>])*)>', 'i').exec(html);
  return match ? match[1] : '';
}

function valueOf(html: string, tag: string, attribute: string): string {
  const match = new RegExp(attribute + '="([^"]*)"', 'i').exec(attributesOf(html, tag));
  return match ? match[1] : '';
}

describe('a shared dashboard hands its credential to the widgets inside it', () => {
  test('every widget in the template is given the page embed token', () => {
    const prepared = prepareDashboardHtml(TEMPLATE, sharedPage());

    for (const tag of WIDGETS)
      assert.equal(valueOf(prepared, tag, 'embed-token'), TOKEN,
        tag + ' would fetch with no credential, and render empty');
  });

  test('the API base the page knows replaces the one baked into the template', () => {
    const prepared = prepareDashboardHtml(TEMPLATE, sharedPage());

    assert.ok(!prepared.includes('http://localhost:9090/api'),
      'a widget left pointing at the machine the dashboard was authored on fetches nothing');
    for (const tag of WIDGETS)
      assert.equal(valueOf(prepared, tag, 'api-base-url'), '/api', tag + ' must fetch from this page');

    // Replaced, not doubled: two api-base-url attributes on one element is the same bug wearing a
    // different hat, because the first one wins and it is the stale one.
    assert.equal((attributesOf(prepared, 'rb-chart').match(/api-base-url=/g) || []).length, 1);
  });

  test('a widget whose template already names a credential keeps its own', () => {
    const prepared = prepareDashboardHtml(
      '<rb-chart component-id="c" embed-token="the-template-token"></rb-chart>', sharedPage());

    assert.equal(valueOf(prepared, 'rb-chart', 'embed-token'), 'the-template-token');
  });

  test('a signed-in page hands out no credential at all, because its cookie carries', () => {
    const prepared = prepareDashboardHtml(TEMPLATE, sharedPage({ embedToken: '' }));

    assert.ok(!prepared.includes('embed-token='), 'nothing to hand out, and nothing handed out');
    // The API base is still the page's: a template authored on localhost is stale for a signed-in
    // reader on a server just as it is for a link recipient.
    assert.equal(valueOf(prepared, 'rb-tabulator', 'api-base-url'), '/api');
  });

  test('parameters still reach the widgets that take them, and only those', () => {
    const prepared = prepareDashboardHtml(TEMPLATE, sharedPage({ reportParams: { country: 'Germany' } }));

    for (const tag of ['rb-value', 'rb-chart', 'rb-tabulator', 'rb-pivot-table'])
      assert.equal(valueOf(prepared, tag, 'report-params'), '{&quot;country&quot;:&quot;Germany&quot;}',
        tag + ' must be re-rendered for the parameter the reader chose');

    // rb-parameters is the control itself. Feeding it the values it just produced is how a
    // parameter panel resets the reader's own selection.
    assert.ok(!attributesOf(prepared, 'rb-parameters').includes('report-params'));
  });

  test('a widget pointed at another report is explained, not silently left blank', () => {
    const prepared = prepareDashboardHtml(
      '<rb-chart component-id="c" report-id="payroll-dashboard"></rb-chart>', sharedPage());

    // One link opens one report: the server refuses this widget whatever the page does, so the page
    // says why, where the tile would have been.
    assert.ok(prepared.includes('rb-widget-not-shared'), 'a blank tile explains nothing: ' + prepared);
    assert.ok(prepared.includes('payroll-dashboard'), 'the note names the report that is not shared');
    assert.ok(prepared.includes(DASHBOARD), 'and the one that is');
    // And it is not handed a credential it could never use.
    assert.ok(!attributesOf(prepared, 'rb-chart').includes('embed-token'));
  });

  test('a widget naming this very report is treated as one of its own', () => {
    const prepared = prepareDashboardHtml(
      '<rb-chart component-id="c" report-id="' + DASHBOARD + '"></rb-chart>', sharedPage());

    assert.ok(!prepared.includes('rb-widget-not-shared'));
    assert.equal(valueOf(prepared, 'rb-chart', 'embed-token'), TOKEN);
  });

  test('nothing but rb-* widgets is touched, and the markup around them survives', () => {
    const prepared = prepareDashboardHtml(TEMPLATE, sharedPage());

    assert.ok(prepared.includes('<div class="rb-dashboard-root">'));
    assert.ok(!attributesOf(prepared, 'div').includes('embed-token'));
    assert.equal((prepared.match(/<rb-chart/g) || []).length, 1);
  });

  test('the dashboard element itself is never fed to itself', () => {
    const prepared = prepareDashboardHtml('<rb-dashboard report-id="another"></rb-dashboard>', sharedPage());

    assert.equal(prepared, '<rb-dashboard report-id="another"></rb-dashboard>');
  });

  test('a credential with a quote in it cannot break out of its attribute', () => {
    const prepared = prepareDashboardHtml('<rb-chart component-id="c"></rb-chart>',
      sharedPage({ embedToken: 'a"b onload="alert(1)' }));

    assert.equal(valueOf(prepared, 'rb-chart', 'embed-token'), 'a&quot;b onload=&quot;alert(1)');
    assert.ok(!prepared.includes('onload="alert(1)"'));
  });

  test('an empty template is left exactly as it is', () => {
    assert.equal(prepareDashboardHtml('', sharedPage()), '');
  });
});
