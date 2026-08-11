import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from './api.service';
import { ToastrMessagesService } from './toastr-messages.service';

/** Mirrors the backend `IdentityDto`. */
export interface Identity {
  mode: 'standalone' | 'tenant' | 'gateway';
  authenticated: boolean;
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
 * The single most important thing this service decides is {@link isDataPallasServer}. When it is
 * false — DataPallas Desktop, which is always the case in Electron — the whole authentication surface
 * must disappear: no login screen, no user menu, no logout, no Users/Tenants screens. Same bundle,
 * same code paths, one flag.
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

  /**
   * Is this DataPallas Server? Everything auth-related in the UI hangs off this.
   *
   * `/api/auth/me` always answers, signed in or not, so `mode` is known from the first call — this is
   * not a guess. It stays FALSE only while the identity is genuinely absent: before bootstrap has run,
   * or when the backend could not be reached at all. Assuming Desktop there keeps a login screen from
   * flashing at a desktop user during startup, and costs nothing on a server, where the backend is the
   * one enforcing access and every call would 401 regardless of what the UI believes.
   */
  readonly isDataPallasServer = computed(() => {
    const current = this.identity();
    return current ? current.mode !== 'standalone' : false;
  });

  readonly isAuthenticated = computed(() => !!this.identity()?.authenticated);

  /**
   * Should the application shell — top menu, status bar — render at all?
   *
   * False only while a server is waiting for someone to sign in. The login screen is not a page
   * inside the app, it is the door: a menu bar behind it offers navigation that every guard would
   * refuse anyway, and a status bar that polls the backend only produces 401s. On the desktop this
   * is always true, because there is no door.
   */
  readonly showAppChrome = computed(
    () => !this.isDataPallasServer() || this.isAuthenticated(),
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
   * case arrives here as a perfectly ordinary body with `authenticated: false` — carrying the one
   * thing the UI cannot work without, the deployment mode.
   *
   * <p><b>A failure here is "not yet", not "no".</b> `/api/auth/me` is the one endpoint that answers
   * everybody, so the only way the request throws is that nothing is listening — and in Electron that
   * is the normal state for the first few seconds, because the app launches its own Java backend and
   * the renderer starts asking before it finishes booting. Recording that silence as "no identity" is
   * what made a secured server look like a desktop: `isDataPallasServer()` reads false without an
   * answer, so no login screen appears, no 401 redirects anywhere, and the user gets the whole
   * application with every single call behind it refused. Retrying until the backend answers is the
   * difference between "we do not know yet" and "there is nobody to sign in as".
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
   * Forget the person, keep the installation.
   *
   * <p>`mode` is a property of what was installed, not of who is signed in, so signing out must not
   * discard it. Setting the identity to null here instead would make a signed-out server
   * indistinguishable from a desktop — {@link isDataPallasServer} would read false, the guard would
   * wave everyone through, and the app would never ask anyone to sign in again for the rest of its
   * life. Everything except the mode is cleared, which is exactly what the backend reports for a
   * caller who is not signed in.
   */
  private signOut(): void {
    const current = this.identity();
    if (!current) return;

    this.identity.set({
      ...current,
      authenticated: false,
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
   * <p>There are two states where nothing is known and nothing should be hidden:
   * <ul>
   *   <li><b>No identity.</b> The desktop starts its own Java backend, so the first `/api/auth/me` can
   *       land before the backend is listening. That is a missing answer, not a denial — and a
   *       fail-closed reading of it takes the Configuration menu away from a desktop user who has no
   *       roles, no login and no way to get it back short of restarting.</li>
   *   <li><b>Standalone.</b> One user, who is an administrator, and no authentication UI anywhere. The
   *       backend does report every capability as true here; not depending on that is what keeps the
   *       desktop working when the backend has not answered yet.</li>
   * </ul>
   *
   * <p>On a server with a resolved identity — the only place hiding means anything — an unknown
   * capability name still answers false.
   */
  can(capability: string): boolean {
    const current = this.identity();
    if (!current || current.mode === 'standalone') return true;
    return current.capabilities?.[capability] === true;
  }

  hasRole(role: string): boolean {
    return this.roles().includes(role);
  }

  /**
   * Should the UI render user/role/tenant administration at all? Requires both a multi-user
   * deployment and the capability — in standalone the screens are hidden even though the DEFAULT
   * admin technically holds the right.
   */
  readonly showUserAdministration = computed(
    () => this.isDataPallasServer() && this.can('manageUsers'),
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

  /** Re-entrancy guard: `/auth/me` answering 401 would otherwise recurse through this handler. */
  private reprobing = false;

  private async handleUnauthorized(): Promise<void> {
    // A 401 with no identity is the state that must not be guessed at. The desktop never produces one
    // — the loopback caller is always authenticated — so a 401 here is evidence that this is a server
    // whose identity probe did not land. Ask once more before deciding: getting it wrong leaves the
    // user inside an application where every call fails and nothing offers them a way to sign in.
    if (!this.identity() && !this.reprobing) {
      this.reprobing = true;
      try {
        await this.loadIdentity();
      } finally {
        this.reprobing = false;
      }
    }

    // Never bounce the desktop to a login screen it does not have.
    if (!this.isDataPallasServer()) return;

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
