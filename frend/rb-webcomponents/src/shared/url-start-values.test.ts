// The values a dashboard opens with, computed once for the two places that need them.
//
// `RbReport` puts a dashboard's tiles on the page with these values and `RbParameters` fills its
// form with them. They used to be computed by the filter bar alone, after the tiles had already
// asked for their data with nothing: every filtered dashboard asked each tile twice, the first time
// unfiltered, and a query that needs its value answered the first time with an error
// (DD01 Executive Overview, DD10 Cohort Retention, DD25 Segment vs Everyone on the Gallery).
//
//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/url-start-values.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { openingValues, resetUrlWarnings } from './url-start-values.ts';
import type { StartValueParam } from './url-start-values.ts';

const REPORT = 'g-dd-executive-overview';

const PARAMETERS: StartValueParam[] = [
  { id: 'year', type: 'Date', defaultValue: '2026-01-01' },
  { id: 'topN', type: 'Integer' },
  { id: 'onlyOpen', type: 'Boolean' },
  { id: 'country', type: 'String', defaultValue: 'Poland' },
];

/** A page, as far as `openingValues` reads one. */
function page(pathname: string, search = ''): { search: string; pathname: string } {
  return { pathname, search };
}

describe('the values a dashboard opens with', () => {
  test('each filter starts at its default, or at the empty value of its type', () => {
    assert.deepEqual(openingValues(PARAMETERS, null, null, REPORT),
      { year: '2026-01-01', topN: null, onlyOpen: false, country: 'Poland' });
  });

  test('a value the link locked stands in place of the default, a list as the controls hold it', () => {
    const values = openingValues(PARAMETERS, { country: ['Spain', 'Bosnia, and Herzegovina'] }, null, REPORT);

    assert.equal(values.country, 'Spain,Bosnia\\, and Herzegovina',
      'a multi-value lock is the escaped comma-separated string a multi-select holds');
    assert.equal(values.year, '2026-01-01', 'the filters the link did not lock keep their defaults');
  });

  test('the URL of the dashboard\'s own page sets where a filter starts', () => {
    resetUrlWarnings();
    const values = openingValues(PARAMETERS, null, page('/dashboard/' + REPORT, '?year=2025-01-01'), REPORT);

    assert.equal(values.year, '2025-01-01');
    assert.equal(values.country, 'Poland');
  });

  test('on a page of many dashboards only this dashboard\'s own keys are read', () => {
    resetUrlWarnings();
    const values = openingValues(PARAMETERS, null,
      page('/dashboard/g-dashboard-demos', '?year=2024-01-01&' + REPORT + '.country=Spain'), REPORT);

    assert.equal(values.year, '2026-01-01', 'a plain key on the Gallery belongs to no single dashboard');
    assert.equal(values.country, 'Spain', 'a key named after this dashboard is its own');
  });

  test('a locked filter ignores the URL', () => {
    resetUrlWarnings();
    const values = openingValues(PARAMETERS, { country: 'Spain' },
      page('/dashboard/' + REPORT, '?country=Poland'), REPORT);

    assert.equal(values.country, 'Spain');
  });

  test('no location reads no URL: the defaults and the locks, which is what Reset means', () => {
    assert.deepEqual(openingValues(PARAMETERS, null, null, REPORT),
      openingValues(PARAMETERS, null, page('/somewhere-else'), REPORT));
  });

  test('a dashboard with no filters opens with no values', () => {
    assert.deepEqual(openingValues([], null, page('/dashboard/' + REPORT, '?year=2025-01-01'), REPORT), {});
    assert.deepEqual(openingValues(null, null, null, REPORT), {});
  });
});
