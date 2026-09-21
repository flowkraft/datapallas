import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { AuthService, FederatedLogin } from '../../providers/auth.service';
import { WebSocketService } from '../../providers/websocket.service';
import { loginTemplate } from './login.template';

/**
 * The sign-in screen for multi-user deployments.
 *
 * <p>Never reached in the Electron desktop. Standalone mode authenticates the loopback caller in the
 * backend, {@link AuthGuard} passes straight through, and this route is redirected away from below —
 * so a desktop user cannot land here even by typing the URL.
 */
@Component({
  selector: 'dburst-login',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `${loginTemplate}`,
})
export class LoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly webSocketService = inject(WebSocketService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  username = '';
  password = '';
  errorMessage = '';
  isSigningIn = false;

  /** True while the shipped account still has its original password — drives the notice. */
  usingDefaultCredentials = false;
  defaultUsername = '';
  defaultPassword = '';

  /** Empty unless an identity provider is configured, which is the default. */
  federatedLogins: FederatedLogin[] = [];

  async ngOnInit(): Promise<void> {
    if (!this.authService.isResolved()) {
      await this.authService.loadIdentity();
    }

    // Nothing to sign into: this caller is already authenticated — a person with a live session, or
    // the desktop presenting the installation's API key, which never needs the form.
    if (this.authService.isAuthenticated()) {
      await this.continueAfterSignIn();
      return;
    }

    this.showFederationFailure();

    // Read before anyone can sign in, so this endpoint is deliberately public. It only ever names
    // the documented defaults, and stops naming anything once the password changes.
    const status = await this.authService.defaultCredentialsStatus();
    this.usingDefaultCredentials = status.usingDefaultCredentials;
    this.defaultUsername = status.defaultUsername ?? '';
    this.defaultPassword = status.defaultPassword ?? '';

    this.federatedLogins = await this.authService.federatedLogins();
  }

  /**
   * A federated round trip that ends badly comes back here as a full page load, so the reason has to
   * travel in the URL — there is no in-memory state left to carry it.
   */
  private showFederationFailure(): void {
    switch (this.route.snapshot.queryParamMap.get('federation')) {
      case 'no-access':
        // Authentication worked; authorisation did not. Saying so is the difference between an
        // administrator fixing a group mapping and filing a bug about broken SSO.
        this.errorMessage =
          'Your account was recognised but has no access to DataPallas. Ask an administrator to map your group to a role.';
        break;
      case 'failed':
        this.errorMessage = 'Sign-in through your identity provider did not complete.';
        break;
    }
  }

  /**
   * Leaves the app entirely. OIDC is a browser redirect to the identity provider and back to a
   * callback endpoint on this server, so this cannot be an XHR — and it must bypass the Angular
   * router, which would only rewrite the URL as a client-side route.
   */
  signInWith(login: FederatedLogin): void {
    window.location.href = login.loginUrl;
  }

  /**
   * Where to go once signed in. A dashboard link opened without a session is sent here by the server
   * with its own address in returnUrl (SignInRedirectEntryPoint). That page is rendered by the server,
   * not an Angular route, so it needs a full page load. Only a path on this server is followed — never
   * another site, which would make this screen an open redirect.
   */
  private async continueAfterSignIn(): Promise<void> {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl && /^\/(?![\/\\])/.test(returnUrl)) {
      window.location.href = returnUrl;
      return;
    }
    await this.router.navigate(['/']);
  }

  /** One click to get a brand-new evaluator into the product. */
  async fillDefaultCredentials(): Promise<void> {
    this.username = this.defaultUsername;
    this.password = this.defaultPassword;
    await this.signIn();
  }

  async signIn(): Promise<void> {
    this.errorMessage = '';
    this.isSigningIn = true;

    try {
      await this.authService.login(this.username, this.password);
      // The live connection was first tried on this screen, before signing in, and refused: open it now,
      // not at its next scheduled retry, so no job event of the first seconds is missed.
      this.webSocketService.connectNowIfDisconnected();
      await this.continueAfterSignIn();
    } catch {
      // Deliberately one message for every failure. Distinguishing "no such user" from "wrong
      // password" would tell an attacker which usernames are real.
      this.errorMessage = 'Invalid username or password';
      this.password = '';
    } finally {
      this.isSigningIn = false;
    }
  }
}
