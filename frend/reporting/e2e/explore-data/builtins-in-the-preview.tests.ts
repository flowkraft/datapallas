// Builtins in the preview (R9, TODO 18b).
//
// The canvas is the one screen that assembles SQL in the browser and runs it straight away. There
// is no viewer to fill ${dp_…} for - the author is looking at their own screen - so executeQuery
// asks the server what it would say about the author (/api/user-variables, once per load) and
// sends those values with the query. The SQL itself keeps its ${dp_…} text: run-sql binds it.
//
// Each spec below asserts what leaves the browser, on the real rb-api module.

interface Sent {
  url: string;
  init?: { method?: string; body?: string };
}

/** The module memoizes the values for the life of the page, so each spec gets its own load. */
function freshRbApi(): any {
  delete require.cache[require.resolve('@/lib/explore-data/rb-api')];
  return require('@/lib/explore-data/rb-api');
}

/** A server that answers the two calls the preview makes, and remembers what it was sent. */
function stubServer(userVariables: Record<string, string>, userVariablesStatus = 200): Sent[] {
  const sent: Sent[] = [];
  (global as any).fetch = (url: string, init?: any) => {
    sent.push({ url, init });
    if (url.endsWith('/user-variables')) {
      return Promise.resolve({
        ok: userVariablesStatus === 200,
        status: userVariablesStatus,
        json: () => Promise.resolve(userVariables),
        text: () => Promise.resolve(''),
      });
    }
    if (url.endsWith('/queries/run-sql')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ columns: ['tickets'], rows: [[307]] }),
        text: () => Promise.resolve(''),
      });
    }
    return Promise.reject(new Error('nothing stubbed for ' + url));
  };
  return sent;
}

function runSqlBody(sent: Sent[]): any {
  const call = sent.find((one) => one.url.endsWith('/queries/run-sql'));
  if (!call || !call.init || !call.init.body) throw new Error('run-sql was never called');
  return JSON.parse(call.init.body);
}

function countOf(sent: Sent[], ending: string): number {
  return sent.filter((one) => one.url.endsWith(ending)).length;
}

const AUTHOR = {
  dp_user_id: 'chiara.muller',
  dp_user_email: 'chiara.muller@support.cube-demo.example',
  dp_user_groups: 'Tier 2',
  dp_user_role: 'report_author',
  dp_tenant_id: 'cube-demo',
  dp_today: '2026-09-30',
  dp_now: '2026-09-30 14:05:00',
};

const MY_TICKETS =
  'SELECT count(*) AS tickets FROM cube_demo.support_tickets t' +
  ' JOIN cube_demo.support_agents a ON a.agent_id = t.agent_id' +
  ' WHERE a.email = ${dp_user_email} AND t.opened_date <= ${dp_today}';

describe('The canvas preview runs the author\'s own SQL as the author', () => {

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('sends the values the server gave for this person, and leaves the placeholders in the SQL', async () => {
    const sent = stubServer(AUTHOR);
    await freshRbApi().executeQuery('demo', MY_TICKETS);

    const body = runSqlBody(sent);
    expect(body.params.dp_user_email).toBe(AUTHOR.dp_user_email);
    expect(body.params.dp_today).toBe('2026-09-30');
    // The text travels: the server binds it, so nobody pastes a value into SQL in the browser.
    expect(body.sql).toContain('${dp_user_email}');
    expect(body.sql).toContain('${dp_today}');
  });

  it('says which of them are not text, so the backend binds a date as a date', async () => {
    const sent = stubServer(AUTHOR);
    await freshRbApi().executeQuery('demo', 'SELECT 1 WHERE d <= ${dp_today} AND ts <= ${dp_now} AND u = ${dp_user_id}');

    const body = runSqlBody(sent);
    expect(body.paramTypes.dp_today).toBe('Date');
    expect(body.paramTypes.dp_now).toBe('DateTime');
    // Everything else is text, and a type nobody declared is not invented here.
    expect(body.paramTypes.dp_user_id).toBeUndefined();
  });

  it('asks the server for them once per load, however many widgets run a query', async () => {
    const sent = stubServer(AUTHOR);
    const rbApi = freshRbApi();
    await Promise.all([
      rbApi.executeQuery('demo', MY_TICKETS),
      rbApi.executeQuery('demo', MY_TICKETS),
      rbApi.executeQuery('demo', 'SELECT 1 WHERE u = ${dp_user_email}'),
    ]);

    expect(countOf(sent, '/user-variables')).toBe(1);
    expect(countOf(sent, '/queries/run-sql')).toBe(3);
  });

  it('asks for nothing when the SQL names no builtin, and sends no parameters', async () => {
    const sent = stubServer(AUTHOR);
    await freshRbApi().executeQuery('demo', 'SELECT count(*) FROM cube_demo.support_tickets');

    expect(countOf(sent, '/user-variables')).toBe(0);
    const body = runSqlBody(sent);
    expect(body.params).toBeUndefined();
    expect(body.paramTypes).toBeUndefined();
  });

  it('does not overwrite a value the caller already set', async () => {
    const sent = stubServer(AUTHOR);
    await freshRbApi().executeQuery('demo', MY_TICKETS, { dp_today: '2025-06-30' });

    const body = runSqlBody(sent);
    expect(body.params.dp_today).toBe('2025-06-30');
    expect(body.params.dp_user_email).toBe(AUTHOR.dp_user_email);
  });

  it('sends no value rather than a guess when the server will not say who is asking', async () => {
    const sent = stubServer({}, 403);
    await freshRbApi().executeQuery('demo', MY_TICKETS);

    const body = runSqlBody(sent);
    // No value means no row matches, which is the safe end of the mistake - never everybody's rows.
    expect(body.params).toBeUndefined();
    expect(body.sql).toContain('${dp_user_email}');
  });
});
