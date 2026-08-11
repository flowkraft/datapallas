export const loginTemplate = `
<div class="flex min-h-screen items-center justify-center p-4">
  <div class="card w-full max-w-md bg-base-100 shadow-xl">
    <div class="card-body">

      <h2 class="card-title justify-center mb-2">
        {{ 'AREAS.LOGIN.SIGN-IN' | translate }}
      </h2>

      <p class="text-center text-sm opacity-70 mb-4">
        {{ 'AREAS.LOGIN.SIGN-IN-HINT' | translate }}
      </p>

      @if (errorMessage) {
        <div id="loginError" role="alert" class="alert alert-error mb-4">
          <span>{{ errorMessage }}</span>
        </div>
      }

      <!-- Shown only while the shipped account still has its original password.
           This notice IS the warning: it prints the credentials in public, so anyone who opens this
           page can sign in as an administrator — which is far more persuasive than a banner telling
           people to change their password. It disappears by itself once the password changes,
           because the backend derives this from the password rather than from a flag. -->
      @if (usingDefaultCredentials) {
        <div id="defaultCredentialsNotice" role="alert" class="alert alert-warning mb-4 text-left">
          <div>
            <div class="font-bold mb-1">Default account &mdash; change this</div>
            <div class="font-mono text-base mb-2">
              {{ defaultUsername }} / {{ defaultPassword }}
            </div>
            <div class="text-sm">
              <b>Everyone who opens this page can read these credentials and sign in as an
              administrator.</b>
              Change the password &mdash; or create your own user and delete this one &mdash; under
              your own name in the top right &rarr; Users. This notice disappears as soon as you do.
            </div>
            <button id="btnUseDefaultCredentials" type="button"
                    class="btn btn-sm btn-outline mt-3" (click)="fillDefaultCredentials()">
              Sign in with the default account
            </button>
          </div>
        </div>
      }

      <form (ngSubmit)="signIn()">

        <label class="form-control w-full mb-3">
          <div class="label">
            <span class="label-text">{{ 'AREAS.LOGIN.USERNAME' | translate }}</span>
          </div>
          <input
            id="loginUsername"
            name="username"
            type="text"
            autocomplete="username"
            class="input input-bordered w-full"
            [(ngModel)]="username"
            [disabled]="isSigningIn" />
        </label>

        <label class="form-control w-full mb-5">
          <div class="label">
            <span class="label-text">{{ 'AREAS.LOGIN.PASSWORD' | translate }}</span>
          </div>
          <input
            id="loginPassword"
            name="password"
            type="password"
            autocomplete="current-password"
            class="input input-bordered w-full"
            [(ngModel)]="password"
            [disabled]="isSigningIn" />
        </label>

        <button
          id="btnLogin"
          type="submit"
          class="btn btn-primary w-full"
          [disabled]="isSigningIn || !username || !password">
          @if (isSigningIn) {
            <span class="loading loading-spinner"></span>
          }
          {{ 'AREAS.LOGIN.SIGN-IN' | translate }}
        </button>

      </form>

      <!-- Absent unless an administrator has configured an identity provider. The list comes from the
           registrations that actually exist, so a button can never appear for a provider that would
           fail on click. -->
      @if (federatedLogins.length) {
        <div class="divider text-xs opacity-60">or</div>

        @for (login of federatedLogins; track login.id) {
          <button
            [id]="'btnFederatedLogin-' + login.id"
            type="button"
            class="btn btn-outline w-full mb-2"
            [disabled]="isSigningIn"
            (click)="signInWith(login)">
            Sign in with {{ login.displayName }}
          </button>
        }
      }

    </div>
  </div>
</div>
`;
