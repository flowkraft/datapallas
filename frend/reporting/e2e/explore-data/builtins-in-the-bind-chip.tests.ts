// Builtins in the bind chip (R9, TODO 18c).
//
// The chip beside a filter's value binds it to a name instead of a literal. It used to offer only
// the canvas's own parameters, so a widget that had to read "my own rows" could not be built
// without typing ${dp_user_email} by hand. It now offers the `dp_` variables as well - the ones
// the server said it sets for this caller, which is the same answer the preview binds its values
// from, so there is no second list of names in the browser to fall behind.

import { bindableParams, buildSql, isParamRef, paramRefOf } from '@/lib/explore-data/sql-builder';
import type { VisualQuery } from '@/lib/stores/canvas-store';

const COLUMN_KINDS = new Map<string, string>([
  ['agent_email', 'string'],
  ['team', 'string'],
  ['opened_date', 'date'],
]);

function query(patch: Partial<VisualQuery>): VisualQuery {
  return {
    kind: 'table',
    table: 'support_tickets',
    filters: [],
    summarize: [],
    groupBy: [],
    sort: [],
    limit: 0,
    ...patch,
  } as VisualQuery;
}

function whereOf(filters: Record<string, string>[]): string {
  const sql = buildSql(query({ filters } as Partial<VisualQuery>),
    { connectionType: 'sqlite', columnKinds: COLUMN_KINDS } as any);
  const parts = sql.split('\nWHERE ');
  return parts.length > 1 ? parts[1] : '';
}

/** The seven a normal installation answers with, plus what an embed token carries. */
const FROM_THE_SERVER = [
  'dp_user_id',
  'dp_user_email',
  'dp_user_groups',
  'dp_user_role',
  'dp_tenant_id',
  'dp_user_timezone',
  'dp_user_locale',
  'dp_today',
  'dp_now',
  'dp_attr_customer_id',
];

describe('The bind chip offers the values the server sets, not only the dashboard\'s own', () => {

  it('offers the dashboard\'s parameters first and the server\'s after them, marked as the server\'s', () => {
    const offered = bindableParams(['country', 'fromDate'], FROM_THE_SERVER);

    expect(offered.slice(0, 2)).toEqual([
      { id: 'country', fromServer: false },
      { id: 'fromDate', fromServer: false },
    ]);
    expect(offered.filter((one) => one.fromServer).map((one) => one.id)).toEqual(FROM_THE_SERVER);
    // The ones the TODO names are all there, including the groups list and the two days.
    for (const name of ['dp_user_id', 'dp_user_email', 'dp_user_groups', 'dp_user_role',
      'dp_tenant_id', 'dp_today', 'dp_now']) {
      expect(offered.some((one) => one.id === name && one.fromServer)).withContext(name).toBe(true);
    }
  });

  it('offers a name once, whichever side it came from', () => {
    const offered = bindableParams(['country', 'country'], ['country', 'dp_today']);

    expect(offered.map((one) => one.id)).toEqual(['country', 'dp_today']);
    expect(offered[0].fromServer).toBe(false);
  });

  it('is what it always was when the server says nothing', () => {
    // A session that may not ask (a viewer, an older backend) gets an empty answer, and the chip
    // then offers the dashboard\'s own parameters alone - never a guessed list.
    expect(bindableParams(['country'], [])).toEqual([{ id: 'country', fromServer: false }]);
    expect(bindableParams([], [])).toEqual([]);
    expect(bindableParams(null, null)).toEqual([]);
  });

  it('writes ${dp_user_email} when one of them is bound, and reads it back as a binding', () => {
    const written = paramRefOf('dp_user_email');

    expect(written).toBe('${dp_user_email}');
    // The chip shows a bound value as a chip, and the generator keeps it out of the literals,
    // because both ask the same question about it.
    expect(isParamRef(written)).toBe(true);
    expect(isParamRef('chiara.muller@support.cube-demo.example')).toBe(false);
  });

  it('sends a bound builtin into the SQL as the name, never as text', () => {
    const where = whereOf([{ column: 'agent_email', operator: 'equals', value: paramRefOf('dp_user_email') }]);

    expect(where).toContain('${dp_user_email}');
    // Quoted, it would be a string nobody binds and a WHERE that matches no row for everybody.
    expect(where).not.toContain("'${dp_user_email}'");
  });

  it('writes the groups as a list, so a person in two teams reads both', () => {
    const where = whereOf([{ column: 'team', operator: 'in', value: paramRefOf('dp_user_groups') }]);

    expect(where).toContain('IN (${dp_user_groups})');
  });
});

describe('The names the chip offers come from the server', () => {

  function freshRbApi(): any {
    delete require.cache[require.resolve('@/lib/explore-data/rb-api')];
    return require('@/lib/explore-data/rb-api');
  }

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('offers exactly what /api/user-variables answered, in its order', async () => {
    const answered: Record<string, string> = {};
    for (const name of FROM_THE_SERVER) answered[name] = 'x';
    (global as any).fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answered) });

    // Including dp_attr_customer_id, which no list in the browser could know about: the names are
    // the server's own (UserVariables), so a variable added there is offered here by itself.
    expect(await freshRbApi().fetchBuiltinParamNames()).toEqual(FROM_THE_SERVER);
  });

  it('offers none of them when the server will not say', async () => {
    (global as any).fetch = () => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) });

    expect(await freshRbApi().fetchBuiltinParamNames()).toEqual([]);
  });
});
