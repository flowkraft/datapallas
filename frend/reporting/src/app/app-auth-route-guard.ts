import { Injectable, inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';

import { AuthService } from './providers/auth.service';

/**
 * Keeps unauthenticated users off the app screens in multi-user deployments.
 *
 * <p>Follows the shape of {@link NoJavaGuard}: a `canActivate` that either lets the route through or
 * redirects. It is composed alongside NoJavaGuard in the same `canActivate` arrays, so a route can
 * require both a working Java installation and a logged-in user.
 *
 * <p>In standalone mode this guard is a straight pass-through. The desktop has no login route to
 * redirect to, and the backend has already authenticated the loopback caller — so returning true here
 * is what makes `DataPallas.exe` behave exactly as it did before authentication existed.
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

    if (!this.authService.isDataPallasServer()) {
      return true;
    }

    if (this.authService.isAuthenticated()) {
      return true;
    }

    this.router.navigate(['/login'], { skipLocationChange: true });
    return false;
  }
}
