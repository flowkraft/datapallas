//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/parameter-controls.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { controlTypeOf, defaultForType } from './parameter-controls.ts';

describe('the control a declared parameter type is filled in with', () => {
  test('a number with a fraction is a number box, by either name', () => {
    assert.equal(controlTypeOf({ type: 'decimal' }), 'decimal');
    assert.equal(controlTypeOf({ type: 'double' }), 'decimal');
    assert.equal(controlTypeOf({ type: 'Double' }), 'decimal');
  });

  test('the other declared types keep their own controls', () => {
    assert.equal(controlTypeOf({ type: 'integer' }), 'integer');
    assert.equal(controlTypeOf({ type: 'boolean' }), 'boolean');
    assert.equal(controlTypeOf({ type: 'date' }), 'date');
    assert.equal(controlTypeOf({ type: 'datepicker' }), 'date');
    assert.equal(controlTypeOf({ type: 'multiselect' }), 'multi-select');
    assert.equal(controlTypeOf({ type: 'string' }), 'string');
    assert.equal(controlTypeOf({}), 'text');
  });

  test('an explicit ui hint still wins over the declared type', () => {
    assert.equal(controlTypeOf({ type: 'double', uiHints: { control: 'multiselect' } }), 'multi-select');
  });

  test('a number box starts empty, whichever name declared it', () => {
    assert.equal(defaultForType('decimal'), null);
    assert.equal(defaultForType('double'), null);
    assert.equal(defaultForType('integer'), null);
    assert.equal(defaultForType('boolean'), false);
    assert.equal(defaultForType('string'), '');
  });
});
