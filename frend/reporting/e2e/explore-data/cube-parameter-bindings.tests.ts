// A dashboard parameter, bound to a member of a cube (R1, TODO 21).
//
// A table widget binds a dashboard filter by typing ${country} into a filter's value box. A cube
// widget has no value box: the tree asks the question and the canvas freezes the SQL. So the
// author says, once per widget, which cube member the dashboard's own filter narrows, and the
// canvas turns that into a filter whose value is the parameter's name. The generator leaves such
// a name standing, so the frozen text carries ${country} and the published script binds it.
//
// These are the pure parts of that: what a binding becomes, and which operators it may use.

import {
  DEFAULT_BINDING_OPERATOR,
  bindingsAsFilters,
  cubeBindableMembers,
  cubeDimensionNames,
  selectionWithBindings,
} from '@/lib/explore-data/cube-selection';
import {
  CUBE_BINDABLE_OPS,
  CUBE_QUERY_OPERATORS,
  PARAM_BINDABLE_OPS,
  bindingTakesTwoEnds,
  cubeBindableOpsFor,
} from '@/lib/explore-data/filter-operators';
import type { CubeParamBinding, CubeSelection } from '@/lib/stores/canvas-store';

function selection(patch: Partial<CubeSelection> = {}): CubeSelection {
  return {
    dimensions: ['Country'],
    measures: ['NetSales'],
    segments: [],
    filters: [],
    granularities: {},
    order: [],
    limit: null,
    ...patch,
  } as CubeSelection;
}

/** A cube file as the tree hands it over: the unnamed cube, plus a named one beside it. */
const CUBE_FILE = {
  dimensions: [
    { name: 'Country', type: 'string' },
    { name: 'Channel' },
    { name: 'Category', type: 'string' },
    { name: 'OrderDate', type: 'time' },
    { name: 'Returned', type: 'boolean' },
  ],
  measures: [{ name: 'NetSales', type: 'sum' }],
  namedOptions: {
    'shop-for-a-period': { dimensions: [{ name: 'OrderDate' }, { name: 'Status' }] },
  },
};

describe('Cube parameter bindings', () => {

  describe('what the author can bind with', () => {

    it('offers the bindable operators a cube can be asked', () => {
      const offered = CUBE_BINDABLE_OPS.map((operator) => operator.value);
      expect(offered).toContain('in');
      expect(offered).toContain('equals');
      expect(offered).toContain('not_in');
      expect(offered).toContain('greater_or_equal');
      // `between` is one of them: the chip's row shows a second parameter for the other end
      // (owner, 2026-09-28), exactly as the table chip binds one parameter per end.
      expect(offered).toContain('between');
      expect(bindingTakesTwoEnds('between')).toBe(true);
      expect(bindingTakesTwoEnds('in')).toBe(false);
      // Each one is bindable in the Filter step and has a cube form, and is offered once.
      for (const value of offered) {
        expect(PARAM_BINDABLE_OPS.has(value)).toBe(true, value + ' is bindable in the Filter step');
        expect(CUBE_QUERY_OPERATORS[value]).toBeDefined();
        expect(offered.filter((other) => other === value).length).toBe(1, value + ' is offered once');
      }
    });

    it('leaves out what a cube cannot be asked this way', () => {
      const offered = CUBE_BINDABLE_OPS.map((operator) => operator.value);
      // Not bindable at all in the Filter step either: these take no value to bind.
      expect(offered).not.toContain('is_null');
      expect(offered).not.toContain('is_not_null');
      // A LIKE the chip cannot bind stays unbindable here too.
      expect(offered).not.toContain('starts_with');
      expect(offered).not.toContain('contains');
    });

    it('offers every member a dashboard filter can narrow, measures included', () => {
      expect(cubeBindableMembers(CUBE_FILE, '').map((member) => member.name))
        .toEqual(['Country', 'Channel', 'Category', 'OrderDate', 'Returned', 'NetSales']);
      // A measure says so, because that is what makes its binding a HAVING rather than a WHERE.
      expect(cubeBindableMembers(CUBE_FILE, '').find((member) => member.name === 'NetSales'))
        .toEqual({ name: 'NetSales', type: 'sum', measure: true });
      expect(cubeBindableMembers(CUBE_FILE, '').find((member) => member.name === 'Country'))
        .toEqual({ name: 'Country', type: 'string', measure: false });
      // A named cube in the same file is its own list, and nothing to read is no members.
      expect(cubeBindableMembers(CUBE_FILE, 'shop-for-a-period').map((member) => member.name))
        .toEqual(['OrderDate', 'Status']);
      expect(cubeBindableMembers(null, '')).toEqual([]);
      // A member with no name is not one anybody can bind to.
      expect(cubeBindableMembers({ dimensions: [{ name: 'Country' }, {}] }, '').length).toBe(1);
    });

    it('narrows the comparisons by what the member is', () => {
      const names = (type: string | undefined, measure: boolean) =>
        cubeBindableOpsFor(type, measure).map((operator) => operator.value);

      // A measure is a number whatever its own `sum` or `count` says: all nine.
      expect(names('sum', true).length).toBe(9);
      expect(names('number', false)).toEqual(names('sum', true));

      // Text is compared or listed, never ordered: `>` on a country is not a question, and
      // PostgreSQL refuses it outright.
      expect(names('string', false)).toEqual(['equals', 'not_equals', 'in', 'not_in']);
      expect(names(undefined, false)).toEqual(['equals', 'not_equals', 'in', 'not_in'],
        'a dimension with no declared type is text');
      expect(names('geo', false)).toEqual(['equals', 'not_equals', 'in', 'not_in']);

      // A day is ordered and has a range; it is not a list anybody types out.
      expect(names('time', false)).toContain('between');
      expect(names('time', false)).not.toContain('in');
      expect(names('time', false)).toContain('less_or_equal');

      // A yes/no is one of two things, so only `=` says anything about it.
      expect(names('boolean', false)).toEqual(['equals']);

      // Every offered operator is one of the nine, whatever the type.
      for (const type of ['string', 'time', 'boolean', 'number', undefined]) {
        for (const value of names(type, false)) {
          expect(PARAM_BINDABLE_OPS.has(value)).toBe(true, value);
        }
      }
    });

    it('lists the cube members the author picks from', () => {
      expect(cubeDimensionNames(CUBE_FILE, ''))
        .toEqual(['Country', 'Channel', 'Category', 'OrderDate', 'Returned']);
      expect(cubeDimensionNames(CUBE_FILE, 'shop-for-a-period')).toEqual(['OrderDate', 'Status']);
      // Nothing to read is no members, not a crash.
      expect(cubeDimensionNames(null, '')).toEqual([]);
      expect(cubeDimensionNames({ measures: [{ name: 'NetSales' }] }, '')).toEqual([]);
      // A dimension with no name is not a member anyone can bind to.
      expect(cubeDimensionNames({ dimensions: [{ name: 'Country' }, {}] }, '')).toEqual(['Country']);
    });
  });

  describe('what a binding becomes', () => {

    it('is a filter whose value is the parameter name', () => {
      const filters = bindingsAsFilters([{ param: 'country', member: 'Country', operator: 'in' }]);
      expect(filters).toEqual([{ member: 'Country', operator: 'in', values: ['${country}'] }]);
    });

    it('speaks the cube query name of the operator, not the chip one', () => {
      const filters = bindingsAsFilters([
        { param: 'country', member: 'Country', operator: 'not_in' },
        { param: 'floor', member: 'NetSales', operator: 'greater_or_equal' },
        { param: 'status', member: 'Status', operator: 'equals' },
      ]);
      expect(filters.map((filter) => filter.operator)).toEqual(['notIn', 'gte', 'equals']);
    });

    it('binds with `in` when the author said nothing', () => {
      expect(DEFAULT_BINDING_OPERATOR).toBe('in');
      const filters = bindingsAsFilters([{ param: 'country', member: 'Country' }]);
      // `IN (${country})` is what lets the dashboard's All through: `*` binds as 1=1, while
      // `equals` against '-- All --' would answer with no rows at all.
      expect(filters).toEqual([{ member: 'Country', operator: 'in', values: ['${country}'] }]);
    });

    it('binds one parameter per end for a between', () => {
      const filters = bindingsAsFilters([
        { param: 'fromDate', paramTo: 'toDate', member: 'OrderDate', operator: 'between' },
      ]);
      expect(filters).toEqual([
        { member: 'OrderDate', operator: 'between', values: ['${fromDate}', '${toDate}'] },
      ]);
      // One end is half a range, and half a range is not a filter yet.
      expect(bindingsAsFilters([
        { param: 'fromDate', member: 'OrderDate', operator: 'between' },
      ])).toEqual([]);
      expect(bindingsAsFilters([
        { param: 'fromDate', paramTo: '  ', member: 'OrderDate', operator: 'between' },
      ])).toEqual([]);
    });

    it('is nothing at all when it is half written or cannot be asked', () => {
      expect(bindingsAsFilters(undefined)).toEqual([]);
      expect(bindingsAsFilters([])).toEqual([]);
      // No parameter picked yet, no member picked yet, and whitespace for either.
      expect(bindingsAsFilters([{ param: '', member: 'Country' }])).toEqual([]);
      expect(bindingsAsFilters([{ param: 'country', member: '' }])).toEqual([]);
      expect(bindingsAsFilters([{ param: '  ', member: '  ' }])).toEqual([]);
      // An operator with no cube form is not silently turned into another one.
      expect(bindingsAsFilters([{ param: 'q', member: 'Country', operator: 'starts_with' }])).toEqual([]);
    });
  });

  describe('the question the canvas asks', () => {

    it('carries the bindings as filters beside the author\'s own', () => {
      const own = { member: 'Status', operator: 'notIn', values: ['Cancelled', 'Returned'] };
      const bound: CubeParamBinding[] = [{ param: 'country', member: 'Country', operator: 'in' }];
      const asked = selectionWithBindings(selection({ filters: [own] }), bound);
      expect(asked.filters).toEqual([
        own,
        { member: 'Country', operator: 'in', values: ['${country}'] },
      ]);
      // And the rest of the question is the one the tree reported.
      expect(asked.dimensions).toEqual(['Country']);
      expect(asked.measures).toEqual(['NetSales']);
    });

    it('reads the bindings the selection carries when it is given none', () => {
      const saved = selection({ paramBindings: [{ param: 'country', member: 'Country' }] });
      expect(selectionWithBindings(saved).filters)
        .toEqual([{ member: 'Country', operator: 'in', values: ['${country}'] }]);
    });

    it('changes nothing when there is nothing bound, and never edits what it was given', () => {
      const own = { member: 'Status', operator: 'notIn', values: ['Cancelled'] };
      const plain = selection({ filters: [own] });
      // The same object back: a canvas saved before bindings existed asks what it always asked.
      expect(selectionWithBindings(plain, [])).toBe(plain);
      expect(selectionWithBindings(plain, undefined)).toBe(plain);
      expect(selectionWithBindings(plain, [{ param: '', member: '' }])).toBe(plain);

      const bound = selection({ filters: [own] });
      selectionWithBindings(bound, [{ param: 'country', member: 'Country' }]);
      expect(bound.filters).toEqual([own], 'the selection the caller holds is untouched');
    });
  });
});
