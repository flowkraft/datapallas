import { Injectable, inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';

import { AuthService } from './providers/auth.service';
import { StateStoreService } from './providers/state-store.service';

/**
 * Keeps unauthenticated callers off the app screens. It waves a caller through in one case only: an
 * installation whose Java is missing or too old. The backend cannot run without Java, so there is
 * nobody to authenticate against — that is not an unauthenticated user, it is a machine that has not
 * finished setting up, and its landing screen has to render to explain how to install Java.
 *
 * <p>Follows the shape of {@link NoJavaGuard}: a `canActivate` that either lets the route through or
 * redirects. It is composed alongside NoJavaGuard in the same `canActivate` arrays, so a route can
 * require both a working Java installation and an authenticated caller.
 *
 * <p>The desktop passes for the same reason everyone else does: it is authenticated. Electron signs
 * its requests with the installation's API key, so `/api/auth/me` reports an authenticated machine
 * and `DataPallas.exe` opens straight into the application. What it does NOT do any more is pass
 * because of its mode — a browser pointed at that same installation is a different caller, holds no
 * key, and is sent to the login screen.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthGuard {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly storeService = inject(StateStoreService);

  async canActivate(): Promise<boolean | UrlTree> {
    // Checked before the identity: on a machine without Java there is no backend to ask, and
    // redirecting to /login would hide the Install Java instructions for good.
    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      return true;
    }

    // The identity is normally resolved during bootstrap (InitService), but a deep link or a full
    // reload can reach a guard first — so make sure we have an answer before deciding.
    if (!this.authService.isResolved()) {
      await this.authService.loadIdentity();
    }

    if (this.authService.isAuthenticated()) {
      return true;
    }

    this.router.navigate(['/login'], { skipLocationChange: true });
    return false;
  }
}
