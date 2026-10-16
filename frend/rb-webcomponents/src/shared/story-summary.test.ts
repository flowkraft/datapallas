import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedFilterIds, cleanOptionLabel, summariseChanges, storyToastLines } from './story-summary.ts';

test('only the filters whose value differs are named, in the bar\'s order', () => {
  const ids = changedFilterIds(['region', 'year', 'country'],
    { region: '', year: '2026', country: 'DE' }, { year: '2025', region: 'APAC', country: 'DE' });
  assert.deepEqual(ids, ['region', 'year']);
});

test('a filter the story does not mention is left out, and null reads as empty', () => {
  assert.deepEqual(changedFilterIds(['a', 'b'], { a: null, b: 'x' }, { a: '' }), []);
  assert.deepEqual(changedFilterIds(['a'], { a: 1 }, { a: '1' }), []);
});

test('a menu entry loses its dashes, and nothing left reads All', () => {
  assert.equal(cleanOptionLabel('-- All regions --'), 'All regions');
  assert.equal(cleanOptionLabel('APAC'), 'APAC');
  assert.equal(cleanOptionLabel(' -- '), 'All');
  assert.equal(cleanOptionLabel(undefined), 'All');
});

test('the summary reads from to, one filter after the other', () => {
  const text = summariseChanges([
    { id: 'region', label: 'Region', from: 'All', to: 'APAC' },
    { id: 'year', label: 'Year', from: '2026', to: '2025' },
  ]);
  assert.equal(text, 'Region: All \u2192 APAC  \u00b7  Year: 2026 \u2192 2025');
});

test('a story that changes nothing says so', () => {
  assert.equal(summariseChanges([]), 'The filters were already set to what this story asks for.');
});

test('the toast names the question first and what it set second', () => {
  const lines = storyToastLines('  How did last year close? ', [{ id: 'year', label: 'Year', from: '2026', to: '2025' }]);
  assert.deepEqual(lines, ['Showing \u201cHow did last year close?\u201d', 'Year: 2026 \u2192 2025']);
});
