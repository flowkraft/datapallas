import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';

import { AuthService } from './providers/auth.service';

/**
 * Keeps a route out of the hands of someone whose role cannot use it.
 *
 * <p>Follows the shape of {@link AuthGuard} and {@link NoJavaGuard}: a `canActivate` that either lets
 * the route through or redirects, composed alongside them in the same `canActivate` array.
 *
 * <p>The capability is named in the route's `data.capability` and is a flag the BACKEND computed —
 * never a role name compared here. That is what keeps the menus, the guards and the API in agreement:
 * all three descend from `capabilitiesOf()` in `AuthController`, so a screen becomes reachable and its
 * endpoints become callable by the same decision, at the same moment.
 *
 * <p>Hiding the menu entry is the primary defence and this is the second one, for the paths a menu
 * cannot cover: a bookmark, a deep link, a `router.navigate` left behind on a screen the user IS
 * allowed to see. Neither is a security control — the endpoints refuse independently — but landing on
 * a screen whose every button fails is a worse experience than never seeing it.
 *
 * <p>Refused navigation goes to Processing rather than to the login screen: the user is signed in
 * perfectly well, they simply may not go there, and bouncing them to a login form would suggest their
 * session had expired. On the desktop this never fires, because every capability is true there.
 */
@Injectable({
  providedIn: 'root',
})
export class CapabilityGuard {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
    const capability = route.data?.['capability'] as string | undefined;
    if (!capability) return true;

    // A deep link or a full reload can reach a guard before InitService has resolved the identity.
    if (!this.authService.isResolved()) {
      await this.authService.loadIdentity();
    }

    if (this.authService.can(capability)) {
      return true;
    }

    return this.router.createUrlTree(['/processing', 'burstMenuSelected']);
  }
}
