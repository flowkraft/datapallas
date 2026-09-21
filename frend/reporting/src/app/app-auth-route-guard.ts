import { Injectable, inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';

import { AuthService } from './providers/auth.service';

/**
 * Keeps unauthenticated callers off the app screens. In every deployment — there is no mode in which
 * this guard waves people through.
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

  async canActivate(): Promise<boolean | UrlTree> {
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
