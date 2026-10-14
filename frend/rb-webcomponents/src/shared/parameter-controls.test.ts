//   npm test        (inside frend/rb-webcomponents)
//   node --experimental-strip-types --test src/shared/parameter-controls.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { controlTypeOf, defaultForType, isTicked, resetControlWarnings, selectValueOf } from './parameter-controls.ts';

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

  test('the filter dialog\'s own words draw the controls they name', () => {
    // What FilterBarConfigPanel writes into `widget`, and what the reader has to get.
    assert.equal(controlTypeOf({ id: 'metric', uiHints: { widget: 'radio' } }), 'radio');
    assert.equal(controlTypeOf({ id: 'includeReturns', uiHints: { widget: 'checkbox' } }), 'boolean');
    assert.equal(controlTypeOf({ id: 'channel', uiHints: { widget: 'multiselect' } }), 'multi-select');
    assert.equal(controlTypeOf({ id: 'asOf', uiHints: { widget: 'datepicker' } }), 'date');
    assert.equal(controlTypeOf({ id: 'minAmount', uiHints: { widget: 'number' } }), 'decimal');
    assert.equal(controlTypeOf({ id: 'active', uiHints: { widget: 'bool' } }), 'boolean');
  });

  test('a control nobody can draw is a text box, and says so once', () => {
    resetControlWarnings();
    const said: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: any[]) => { said.push(String(args[0])); };
    try {
      assert.equal(controlTypeOf({ id: 'mystery', uiHints: { control: 'slider' } }), 'slider');
      assert.equal(controlTypeOf({ id: 'mystery', uiHints: { control: 'slider' } }), 'slider');
    } finally {
      console.warn = realWarn;
    }
    assert.equal(said.length, 1);
    assert.ok(said[0].includes('mystery') && said[0].includes('slider'));
  });

  test('a declared type that has no control of its own stays quiet', () => {
    resetControlWarnings();
    const said: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: any[]) => { said.push(String(args[0])); };
    try {
      assert.equal(controlTypeOf({ id: 'note', type: 'string' }), 'string');
      assert.equal(controlTypeOf({ id: 'other' }), 'text');
    } finally {
      console.warn = realWarn;
    }
    assert.equal(said.length, 0);
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

describe('whether a Boolean tick box is ticked', () => {
  test('a default of false that arrives as text leaves the box unticked', () => {
    assert.equal(isTicked('false'), false);
    assert.equal(isTicked('FALSE'), false);
    assert.equal(isTicked(false), false);
  });

  test('true ticks it, as a value or as text', () => {
    assert.equal(isTicked(true), true);
    assert.equal(isTicked('true'), true);
    assert.equal(isTicked(' True '), true);
  });

  test('no value at all leaves it unticked', () => {
    assert.equal(isTicked(undefined), false);
    assert.equal(isTicked(null), false);
    assert.equal(isTicked(''), false);
  });
});

describe('a drop-down and its options compare as text', () => {
  test('a number is the option that says it', () => {
    assert.equal(selectValueOf(10), '10');
    assert.equal(selectValueOf(10), selectValueOf('10'));
  });

  test('nothing is the empty option, "-- All --"', () => {
    assert.equal(selectValueOf(null), '');
    assert.equal(selectValueOf(undefined), '');
    assert.equal(selectValueOf(''), '');
  });

  test('zero and false stay values', () => {
    assert.equal(selectValueOf(0), '0');
    assert.equal(selectValueOf(false), 'false');
  });
});
