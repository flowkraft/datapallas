import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from './api.service';
import { ToastrMessagesService } from './toastr-messages.service';

/** Mirrors the backend `IdentityDto`. */
export interface Identity {
  authenticated: boolean;
  /** The caller is the installation itself — its API key, or an embedding app — not a person. */
  machine: boolean;
  user: { username: string; email: string; platformAdmin: boolean } | null;
  tenant: { code: string; displayName: string } | null;
  roles: string[];
  capabilities: Record<string, boolean>;
  memberships: Record<string, string>;
}

/**
 * An identity provider the login screen can offer. Mirrors the backend
 * `FederatedLoginCatalog.FederatedLogin`.
 *
 * `loginUrl` is a full page navigation, not a fetch: OIDC works by handing the browser to the
 * identity provider and getting it back at a callback endpoint, so an XHR could never complete it.
 */
export interface FederatedLogin {
  id: string;
  displayName: string;
  loginUrl: string;
  protocol: string;
}

/**
 * Who is using the app, and therefore what the app is allowed to show.
 *
 * Every deployment authenticates — desktop, server, Docker, Windows, Linux — so the question this
 * service answers is never "is authentication switched on here", it is {@link isAuthenticated}: is
 * anybody behind this window, and {@link isPersonSignedIn}: is that somebody a person. The desktop
 * signs its own requests with the installation's API key, so it answers "yes, a machine" and walks
 * straight into the app without ever seeing the login screen — not because the screen was disabled
 * for it, but because it arrived already authenticated.
 *
 * <p>There is no deployment mode here any more, deliberately. The shell used to be told which shape
 * it was running in and to decide from that, which meant the product believed a string it could not
 * check — and a desktop shell sitting on a server's folder said "standalone" just as convincingly as
 * a real desktop. Every question the UI actually has (may this person administer users? is there an
 * account to sign out of?) is answered by who is calling and what the backend says they may do, both
 * of which are facts rather than declarations.
 *
 * Capabilities here are for rendering only. Every one of them is independently enforced by the
 * backend, so hiding a button is a courtesy to the user, never a security control.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);
  private readonly messagesService = inject(ToastrMessagesService);

  private readonly identity = signal<Identity | null>(null);

  /** True until the first /api/auth/me answer arrives, so guards can wait instead of guessing. */
  private readonly resolved = signal(false);

  readonly currentIdentity = computed(() => this.identity());
  readonly isResolved = computed(() => this.resolved());

  readonly isAuthenticated = computed(() => !!this.identity()?.authenticated);

  /**
   * Is a PERSON signed in — someone with an account, a name to show and a session to end?
   *
   * The desktop is authenticated but is not a person: it presents the installation's API key, which
   * has no account behind it. Anything that offers to display, switch or sign out of an account asks
   * this, never {@link isAuthenticated} — "Signed in as api-key-user · Sign out" is an offer the
   * desktop cannot keep.
   */
  readonly isPersonSignedIn = computed(() => {
    const current = this.identity();
    return !!current?.authenticated && !current.machine;
  });

  /**
   * Should the application shell — top menu, status bar — render at all?
   *
   * False only while the backend has told us, in so many words, that nobody is signed in. The login
   * screen is not a page inside the app, it is the door: a menu bar behind it offers navigation that
   * every guard would refuse anyway, and a status bar that polls the backend only produces 401s.
   *
   * A missing identity is not that answer. `/api/auth/me` answers everybody, so the only way to have
   * none is that nothing was listening — and a desktop whose own backend died should still render
   * its window and say so, rather than show a login door that leads nowhere.
   */
  readonly showAppChrome = computed(
    () => this.identity() === null || this.isAuthenticated(),
  );

  readonly username = computed(() => this.identity()?.user?.username ?? '');
  readonly tenantCode = computed(() => this.identity()?.tenant?.code ?? '');
  readonly roles = computed(() => this.identity()?.roles ?? []);

  /** The tenant as it was named by whoever created it, falling back to its code. */
  readonly tenantName = computed(
    () => this.identity()?.tenant?.displayName || this.tenantCode(),
  );

  /**
   * What this person is, in one word.
   *
   * Roles accumulate — an administrator also holds REPORT_AUTHOR and JOB_OPERATOR — so listing them raw
   * shows several shouted constants that say less than the single most capable one does. The names
   * below are the ones the product already uses for these roles in its own documentation.
   */
  readonly roleLabel = computed(() => {
    const roles = this.roles();
    if (roles.includes('PLATFORM_ADMIN') || roles.includes('ADMIN')) return 'Administrator';
    if (roles.includes('REPORT_AUTHOR')) return 'Author';
    if (roles.includes('JOB_OPERATOR')) return 'Operator';
    if (roles.includes('DASHBOARD_VIEWER')) return 'Viewer';
    return '';
  });

  constructor() {
    // ApiService cannot inject AuthService (AuthService needs ApiService to log in), so the 401 and
    // 403 hooks are handed over here instead of creating a circular dependency.
    this.apiService.onUnauthorized = () => this.handleUnauthorized();
    this.apiService.onForbidden = () => this.handleForbidden();
  }

  /**
   * Fetch the identity. Called from InitService during bootstrap, before the first navigation.
   *
   * The endpoint answers whether or not anyone is signed in, so the normal "nobody is logged in yet"
   * case arrives here as a perfectly ordinary body with `authenticated: false`, which is an answer
   * and not a failure.
   *
   * <p><b>A failure here is "not yet", not "no".</b> `/api/auth/me` is the one endpoint that answers
   * everybody, so the only way the request throws is that nothing is listening — and in Electron that
   * is the normal state for the first few seconds, because the app launches its own Java backend and
   * the renderer starts asking before it finishes booting. Treating that silence as "nobody is signed
   * in" would put a login screen in front of a desktop user two seconds before their own backend was
   * ready to accept the key it is holding. Retrying until the backend answers is the difference
   * between "we do not know yet" and "there is nobody to sign in as".
   */
  async loadIdentity(): Promise<Identity | null> {
    // ~10s of patience: comfortably longer than a cold JVM start, short enough that a genuinely dead
    // backend still lets the app render and report itself as broken.
    const attempts = 20;
    const delayMs = 500;

    try {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const identity = ((await this.apiService.get('/auth/me')) as Identity) ?? null;
          this.identity.set(identity);
          return identity;
        } catch {
          if (attempt === attempts) break;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      this.identity.set(null);
      return null;
    } finally {
      this.resolved.set(true);
    }
  }

  /**
   * Whether the shipped burst/burst account is still usable as-is.
   *
   * Public on the backend because the login screen reads it before anyone can sign in. It only ever
   * names the documented defaults, and names nothing once the password has been changed.
   */
  async defaultCredentialsStatus(): Promise<{
    usingDefaultCredentials: boolean;
    defaultUsername?: string;
    defaultPassword?: string;
  }> {
    try {
      return await this.apiService.get('/auth/first-run');
    } catch {
      return { usingDefaultCredentials: false };
    }
  }

  /**
   * The "Sign in with ..." buttons to offer, if any.
   *
   * Empty unless an administrator has configured an identity provider, so a downloaded DataPallas
   * shows only the username and password fields. A failure here must not block the password form —
   * federated sign-in is the optional path, not the primary one.
   */
  async federatedLogins(): Promise<FederatedLogin[]> {
    try {
      return (await this.apiService.get('/auth/providers')) as FederatedLogin[];
    } catch {
      return [];
    }
  }

  async login(username: string, password: string): Promise<Identity> {
    const identity = (await this.apiService.post('/auth/login', {
      username,
      password,
    })) as Identity;
    this.identity.set(identity);
    this.resolved.set(true);
    return identity;
  }

  async logout(): Promise<void> {
    try {
      await this.apiService.post('/auth/logout', {});
    } finally {
      this.signOut();
      await this.router.navigate(['/login']);
    }
  }

  /**
   * Forget the person.
   *
   * <p>Sets the identity to what the backend reports for a caller who is not signed in, rather than
   * to null: null means "no answer yet" — the state a desktop is in while its own backend boots —
   * and the app renders through that one, waiting. Having been refused is a different, settled fact,
   * and the shell reacts to it by showing the door.
   */
  private signOut(): void {
    this.identity.set({
      authenticated: false,
      machine: false,
      user: null,
      tenant: null,
      roles: [],
      capabilities: {},
      memberships: {},
    });
  }

  /**
   * Is a capability available?
   *
   * <p>Fails OPEN, and that is the whole point. These flags hide menus; they do not protect anything —
   * every endpoint behind them is enforced by the backend regardless of what this answers. So the two
   * ways to be wrong are not symmetrical: answering true for someone who may not act costs a refusal
   * they can see and understand, while answering false for someone who MAY act silently deletes their
   * application.
   *
   * <p>One state answers true for everything: <b>no identity</b>. The desktop starts its own Java
   * backend, so the first `/api/auth/me` can land before the backend is listening. That is a missing
   * answer, not a denial — and a fail-closed reading of it takes the Configuration menu away from a
   * desktop user who has no way to get it back short of restarting.
   *
   * <p>Once an identity exists the backend's own flags are used verbatim, desktop included: the
   * installation key holds ADMIN, so every capability comes back true there anyway. An unknown
   * capability name answers false.
   */
  can(capability: string): boolean {
    const current = this.identity();
    if (!current) return true;
    return current.capabilities?.[capability] === true;
  }

  hasRole(role: string): boolean {
    return this.roles().includes(role);
  }

  /**
   * Should the UI render user/role/tenant administration at all?
   *
   * <p>For a signed-in PERSON who may manage users — which is the honest reading of the screen: it
   * exists to let an administrator add, disable and re-role their colleagues. The desktop, signed in
   * as the installation itself, is not that person: it holds ADMIN because it owns the folder, and it
   * has nobody to administer. If its owner does sign in as an administrator the screens appear —
   * which is exactly how a desktop grows into a shared install.
   */
  readonly showUserAdministration = computed(
    () => this.isPersonSignedIn() && this.can('manageUsers'),
  );

  /**
   * The capabilities the menus and buttons are hidden by.
   *
   * Every one of them is a flag the backend computed in `capabilitiesOf()`, never a role name checked
   * here — so a screen is hidden by the same decision that would have refused the request behind it,
   * and the two cannot drift apart.
   *
   * All of them stay true on the desktop, where `/api/auth/me` reports the DEFAULT administrator and
   * nothing is meant to be hidden from anybody.
   */
  readonly canViewConfiguration = computed(() => this.can('viewConfiguration'));
  readonly canManageConnections = computed(() => this.can('manageConnections'));
  readonly canManageApps = computed(() => this.can('manageApps'));
  readonly canManageSystem = computed(() => this.can('manageSystem'));
  readonly canEditReports = computed(() => this.can('editReports'));

  /**
   * Does this person only open dashboards, in the AI Hub?
   *
   * <p>The one flag here that does NOT go through {@link can}, because it is the one that is read the
   * other way round: everything above hides a screen when it is false, while this one hides the whole
   * application when it is true. Failing open would mean that a desktop whose backend has not answered
   * yet — the very case {@link can} exists for — replaced its own screens with a note about the AI Hub.
   * So: no identity, no flag, no notice.
   */
  readonly opensDashboardsOnly = computed(
    () => this.identity()?.capabilities?.['dashboardsOnly'] === true,
  );

  /** Re-entrancy guard: `/auth/me` answering 401 would otherwise recurse through this handler. */
  private reprobing = false;

  private async handleUnauthorized(): Promise<void> {
    // A 401 with no identity is the state that must not be guessed at: it is equally consistent with
    // "your session ended" and "the probe never landed". Ask once more before deciding — getting it
    // wrong leaves the user inside an application where every call fails, or at a login screen they
    // did not need.
    if (!this.identity() && !this.reprobing) {
      this.reprobing = true;
      try {
        await this.loadIdentity();
      } finally {
        this.reprobing = false;
      }
    }

    // Whoever this is, they are not authenticated, and every deployment has a door — including the
    // desktop, whose API key is normally the thing that opens it. Offering the login screen is the
    // only outcome that leaves a way forward; the old shortcut of "the desktop has no login" left a
    // desktop with an unreadable key inside an application where nothing worked and nothing said so.
    this.signOut();
    void this.router.navigate(['/login']);
  }

  /**
   * Say the refusal out loud.
   *
   * <p>Deliberately vague about what was refused. The caller already knows which button they pressed,
   * and naming the resource — "connection ACME_SMTP is ADMIN-only" — would confirm that it exists to
   * someone who is not allowed to see it. What is NOT hidden is the fact of the refusal itself: that
   * is a rule working, and a user who cannot tell a refusal from a bug reports the bug.
   */
  private handleForbidden(): void {
    this.messagesService.showError('You do not have permission to do this.');
  }
}
