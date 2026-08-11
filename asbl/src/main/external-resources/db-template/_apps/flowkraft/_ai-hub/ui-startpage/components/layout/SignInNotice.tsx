'use client';

import { useEffect, useState } from 'react';
import { useDpSession } from '@/components/layout/DpSession';

/**
 * Signs the visitor in to DataPallas, without the AI Hub owning any of it.
 *
 * <p>There is no second account store here and no session of this app's own. The form posts through
 * this app's proxy to the DataPallas login endpoint, and the session the backend issues is relayed
 * straight back to the browser. Because a cookie is attributed to the host and ignores the port, that
 * one session then works for this app on :8440 and for DataPallas on :9090 alike — sign in from
 * either, and you are signed in to both.
 *
 * <p>So arriving at the AI Hub first works exactly as well as arriving at DataPallas first, which is
 * the point: nobody should have to know which of the two is "the real" login.
 *
 * <p>Renders its children untouched on DataPallas Desktop, and once someone is signed in.
 *
 * <h2>Signed in as the wrong person</h2>
 *
 * The AI Hub is for authoring, so {@code JOB_OPERATOR} has nothing to do here. That refusal is shown
 * on THIS screen, above this form, rather than on a page of its own — because "you cannot use this"
 * and "here is how to sign in as somebody who can" are the same moment. A separate refusal page is a
 * dead end: it names a problem and then offers no way to act on it, and the person reading it is
 * usually one password away from the thing they came to do.
 */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const { needsSignIn, resolved, canEditReports } = useDpSession();

  // Signed in, but not as an author. Same form, one banner more.
  const refusedRole = resolved && !needsSignIn && !canEditReports;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [defaults, setDefaults] = useState<{ username: string; password: string } | null>(null);

  // Whether the shipped account still has its original password. Public by necessity — it is read
  // before anyone can sign in — and it gives nothing away that this notice does not already print.
  useEffect(() => {
    if (!needsSignIn && !refusedRole) return;
    let cancelled = false;

    fetch('/api/dp/auth/first-run', { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((status) => {
        if (cancelled || !status?.usingDefaultCredentials) return;
        setDefaults({ username: status.defaultUsername, password: status.defaultPassword });
      })
      .catch(() => {
        // No notice is the safe failure: it only ever adds a warning, never gates anything.
      });

    return () => {
      cancelled = true;
    };
  }, [needsSignIn, refusedRole]);

  function signIn(event: React.FormEvent) {
    event.preventDefault();
    return submit(username, password);
  }

  /**
   * Takes the credentials as arguments rather than reading state.
   *
   * <p>The default-account button sets both fields and signs in at once, and a setState is not
   * visible to code running straight after it — reading state here would submit whatever was in the
   * boxes before the click.
   */
  async function submit(user: string, pass: string) {
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/dp/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });

      if (response.ok) {
        // Signed in — but the AI Hub is for authors. An operator's credentials are correct and their
        // session is real, so answering here rather than reloading is the difference between being
        // told why and watching the login screen come back for no stated reason.
        const identity = await response.json().catch(() => null);
        if (identity?.capabilities?.editReports === false) {
          setError('You need to be ADMIN or REPORT_AUTHOR to use this app.');
          return;
        }

        // Reload rather than update state: every panel behind this gate mounted while signed out.
        // Re-running them all is what the visitor means by "sign in".
        window.location.reload();
        return;
      }

      setError(response.status === 401 ? 'Wrong username or password.' : 'Could not sign in.');
    } catch {
      setError('Could not reach DataPallas.');
    } finally {
      setBusy(false);
    }
  }

  if (!needsSignIn && !refusedRole) return <>{children}</>;

  return (
    <div className="flex justify-center px-4 py-16">
      <form onSubmit={signIn} className="card bg-base-100 w-full max-w-sm p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Sign In</h2>
        <p className="text-sm opacity-70 mt-1">Sign in with your DataPallas account.</p>

        {/* Signed in, but not as an author. States the requirement and nothing else — naming the
            current account would echo an identity back to whoever is standing at the screen, which
            on a shared machine is somebody else's. The requirement is the only part that is
            actionable anyway, and the form to act on it is directly below. */}
        {refusedRole && (
          <div id="aiHubRoleNotice" role="alert" className="alert alert-warning mt-4 text-left text-sm">
            <div>
              <div className="font-bold mb-1">You cannot use this app</div>
              <div>
                You need to be <b>ADMIN</b> or <b>REPORT_AUTHOR</b> to use this app. It is for
                building explorations, dashboards and cubes.
              </div>
              <div className="mt-2">Sign in below with an account that has one of those roles.</div>
            </div>
          </div>
        )}

        {error && <div className="alert alert-error mt-4 text-sm">{error}</div>}

        {/* The same notice the main application shows, for the same reason: printing the credentials
            in public is far more persuasive than a banner asking people to change their password. It
            disappears by itself once the password changes, because the backend derives this from the
            password rather than from a flag. */}
        {defaults && (
          <div id="defaultCredentialsNotice" role="alert" className="alert alert-warning mt-4 text-left">
            <div>
              <div className="font-bold mb-1">Default account &mdash; change this</div>
              <div className="font-mono text-base mb-2">
                {defaults.username} / {defaults.password}
              </div>
              <div className="text-sm">
                <b>Everyone who opens this page can read these credentials and sign in as an
                administrator.</b>{' '}
                Change the password &mdash; or create your own user and delete this one &mdash; in
                DataPallas, under your own name in the top right &rarr; Users. This notice disappears
                as soon as you do.
              </div>
              <button id="btnUseDefaultCredentials" type="button"
                      className="btn btn-sm btn-outline mt-3"
                      disabled={busy}
                      onClick={() => {
                        // Fill AND sign in, as the main application does — the button says "sign in",
                        // so asking for a second click after it would be a step that means nothing.
                        setUsername(defaults.username);
                        setPassword(defaults.password);
                        void submit(defaults.username, defaults.password);
                      }}>
                Sign in with the default account
              </button>
            </div>
          </div>
        )}

        <label className="label mt-4" htmlFor="dp-username">Username</label>
        <input id="dp-username" className="input input-bordered w-full" autoFocus
               value={username} onChange={(e) => setUsername(e.target.value)} />

        <label className="label mt-2" htmlFor="dp-password">Password</label>
        <input id="dp-password" type="password" className="input input-bordered w-full"
               value={password} onChange={(e) => setPassword(e.target.value)} />

        <button type="submit" className="btn btn-primary mt-5"
                disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
