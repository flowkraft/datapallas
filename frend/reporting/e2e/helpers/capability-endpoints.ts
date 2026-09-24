/**
 * The door behind each capability the server reports for the signed-in person.
 *
 * `/api/auth/me` returns a flag per capability, and the frontend draws its screens from those
 * flags. Nothing in the product ties a flag to the endpoints it stands for, so the two can drift:
 * a flag that says yes over a door that refuses the role is a screen that fails the moment somebody
 * uses it, and a flag that says no over a door that admits them is a door nobody knows is open.
 *
 * This map is that missing tie, written down once and used by both halves of the pair in
 * `auth-authorization-server.spec.ts` — the positive test and the negative test — so the two can
 * never fall out of step with each other. A capability the server starts reporting without an entry
 * here fails those tests until somebody decides which door it stands for.
 *
 * **Chosen to be safe to call.** Every entry is a read, or a write aimed at something that does not
 * exist. Authorization is decided before the handler runs, so a door that opens answers with the
 * handler's own complaint — 400, 404, 500 — and never with 401 or 403. That is what `admitted`
 * means below, and it is why `reveal-password` can be used here at all: it is asked about a
 * connection id that was never created, so there is no secret for it to reveal even when the door
 * opens for an administrator.
 */
export type CapabilityDoor = {
  /** The call that stands for this capability. */
  method: string;
  path: string;
  /** Why this endpoint is the one that stands for this capability. */
  because: string;
};

/** A capability that deliberately stands for no door of its own, with the reason. */
export type NoDoor = { doorless: string };

export const CAPABILITY_DOORS: Record<string, CapabilityDoor | NoDoor> = {
  manageUsers: {
    method: 'GET',
    path: '/api/iam/users',
    because: 'the Users screen cannot draw a row without it, and /api/iam is ADMIN at class level',
  },
  manageConnections: {
    method: 'GET',
    path: '/api/connections/seed-templates',
    because:
      'the connection editor offers seed templates; listing connections is deliberately not used' +
      ' here because a REPORT_AUTHOR may list the ones they were granted',
  },
  revealSecrets: {
    method: 'POST',
    path: '/api/connections/e2e-no-such-connection/reveal-password',
    because:
      'the one endpoint that hands back a stored password, asked about a connection that does not' +
      ' exist, so an open door answers with "no such connection" and never with a secret',
  },
  manageSystem: {
    method: 'DELETE',
    path: '/api/analytics/cache?engine=duckdb',
    because:
      'system maintenance the product exposes to administrators only; a cache that clears is' +
      ' rebuilt on the next query, which the install, uninstall and update endpoints on the same' +
      ' tier could not honestly claim',
  },
  manageApps: {
    method: 'GET',
    path: '/api/system/apps',
    because: 'the Apps screen lists them through this endpoint and nothing else',
  },
  authorScripts: {
    method: 'GET',
    path: '/api/reports/e2e-no-such-report/script/startup',
    because:
      'reading a report script is the first thing the script editor does; the report id is one that' +
      ' does not exist, so an open door answers 404 rather than handing over somebody code',
  },
  editReports: {
    method: 'GET',
    path: '/api/reports/e2e-no-such-report/template',
    because:
      "the report editor loads the template; GET /api/reports/{id} is not used here because a" +
      ' JOB_OPERATOR may read a report they are allowed to run',
  },
  viewConfiguration: {
    method: 'GET',
    path: '/api/system/ai-prompts',
    because: 'the Configuration screens read this; GET /api/system/preferences is open to everyone',
  },
  runJobs: {
    method: 'GET',
    path: '/api/jobs',
    because: 'the Jobs screen is this endpoint, and JobsController is JOB_OPERATOR at class level',
  },
  dashboardsOnly: {
    doorless:
      'it is the absence of the other capabilities rather than a door of its own: it tells the' +
      ' frontend to draw a person their dashboards and nothing else',
  },
};

export function isDoorless(door: CapabilityDoor | NoDoor): door is NoDoor {
  return (door as NoDoor).doorless !== undefined;
}

/**
 * Admitted means method security let the call through to the handler. 401 and 403 are the two
 * answers authorization gives; anything else — including the handler's own 400, 404 or 500 — means
 * the door opened, which is exactly what the positive half of the pair is about.
 */
export function wasAdmitted(status: number): boolean {
  return status !== 401 && status !== 403;
}
