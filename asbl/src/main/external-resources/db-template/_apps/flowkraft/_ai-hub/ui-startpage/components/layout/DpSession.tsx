'use client';

import { createContext, useContext, useEffect, useState } from 'react';

/** Mirrors the backend `IdentityDto`, of which only these fields matter here. */
type Identity = {
  mode: 'standalone' | 'tenant' | 'gateway';
  authenticated: boolean;
  user: { username: string } | null;
  roles: string[];
  capabilities: Record<string, boolean>;
};

type DpSession = {
  /** True only on a server with nobody signed in — the one state that hides things. */
  needsSignIn: boolean;
  /** False until the first answer arrives, so nothing flashes while it is unknown. */
  resolved: boolean;
  /** Empty on the desktop, where there is nobody to name. */
  username: string;
  /** The most capable role held, worded the way the product words it. */
  roleLabel: string;
  /**
   * May this person build and save dashboards here?
   *
   * <p>The flag is `editReports`, computed by the backend in `AuthController.capabilitiesOf()` — the
   * same one the main application hides its Configuration menu by, and the same decision that
   * `@PreAuthorize("hasRole('REPORT_AUTHOR')")` on `/api/explorations` and `/api/cubes` enforces. This
   * app deciding for itself, from role names, is exactly how the two would drift into disagreeing.
   *
   * <p>Defaults to true so the desktop — and the moment before the answer arrives — shows everything.
   */
  canEditReports: boolean;
};

/**
 * One word for what someone is. Roles accumulate — an administrator also holds every weaker role —
 * so the strongest one says more than the whole list does. Matches the main application's wording.
 */
function labelFor(roles: string[]): string {
  if (roles.includes('PLATFORM_ADMIN') || roles.includes('ADMIN')) return 'Administrator';
  if (roles.includes('REPORT_AUTHOR')) return 'Author';
  if (roles.includes('JOB_OPERATOR')) return 'Operator';
  return '';
}

const Context = createContext<DpSession>({
  needsSignIn: false,
  resolved: false,
  username: '',
  roleLabel: '',
  canEditReports: true,
});

/** Who is using the AI Hub. One probe, read by the navbar and the gate alike. */
export function useDpSession() {
  return useContext(Context);
}

/**
 * Resolves the DataPallas identity once, for the whole app.
 *
 * <p>The rule is the one the main application uses — hide the chrome only when this is a server AND
 * nobody is signed in — so the two apps behave the same way for the same person, and neither has an
 * opinion of its own about who that is. Everything comes from `GET /api/auth/me` through the proxy.
 *
 * <p>Defaults to showing everything while the answer is unknown, so a desktop user never sees a
 * flicker of a sign-in screen that does not apply to them.
 */
export function DpSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<DpSession>({
    needsSignIn: false,
    resolved: false,
    username: '',
    roleLabel: '',
    canEditReports: true,
  });

  useEffect(() => {
    let cancelled = false;

    // Also what earns a CSRF token: the backend sets it on any response and the proxy relays it, so
    // the sign-in POST has one to echo.
    fetch('/api/dp/auth/me', { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? (response.json() as Promise<Identity>) : null))
      .then((identity) => {
        if (cancelled || !identity) return;
        setSession({
          // Nobody is named on the desktop: it has no sign-in, so showing a user menu there would
          // invent an experience the main application deliberately does not have either.
          needsSignIn: identity.mode !== 'standalone' && !identity.authenticated,
          resolved: true,
          username: identity.mode === 'standalone' ? '' : identity.user?.username ?? '',
          roleLabel: identity.mode === 'standalone' ? '' : labelFor(identity.roles ?? []),
          // Absent capabilities mean an older backend, not a refusal — keep the app usable.
          canEditReports: identity.capabilities?.editReports !== false,
        });
      })
      .catch(() => {
        // An unreachable backend is a different failure with its own symptoms. Staying quiet keeps
        // "needs sign-in" meaning one thing only.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <Context.Provider value={session}>{children}</Context.Provider>;
}
