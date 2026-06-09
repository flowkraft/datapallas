export const chocolateyTemplate = ` <!--<ng-template #chocolateyTemplate> -->
  <div class="card card-border bg-base-100 shadow-sm">
    <h4 id="checkPointChocolatey">
      @if (!this.stateStore.configSys.sysInfo.setup.chocolatey.isChocoOk) {
        <div>
          <u
            >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.CHOCOLATEY.STEP1' |
            translate }} <em>Chocolatey</em></u
          >
        </div>
      }
      @if (this.stateStore.configSys.sysInfo.setup.chocolatey.isChocoOk) {
        <div>
          <s
            >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.CHOCOLATEY.STEP1' |
            translate }} <em>Chocolatey</em></s
          >&nbsp;&nbsp;<span class="badge badge-ghost"
            ><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg
            >&nbsp;{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.CHOCOLATEY.INSTALLED'
            | translate }}</span
          >
        </div>
      }
    </h4>
    <div
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.CHOCOLATEY.INNER-HTML.BEFORE-JAVA' | translate"
    ></div>
    <br /><br />
    @if (!this.stateStore.configSys.sysInfo.setup.chocolatey.isChocoOk) {
      <button
        id="btnInstallChocolatey"
        type="button"
        class="btn btn-outline btn-primary"
        [disabled]="installing"
        (click)="installChocolatey()"
      >
        @if (installing) {
          <span class="loading loading-spinner loading-sm"></span>
        } @else {
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg>
        }
        &nbsp;{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INSTALL' | translate}} <em>Chocolatey</em>
      </button>
      @if (installing) {
        <div class="mt-2 flex items-center gap-2 text-sm opacity-80">
          <span class="loading loading-spinner loading-sm"></span>
          <span>Please wait while <em>Chocolatey</em> is being installed&hellip; A confirmation will appear when it finishes.</span>
        </div>
      }
    }
  </div>
  <!--</ng-template> -->`;
