export const extraPackagesTemplate = `<!-- <ng-template #extraPackagesTemplate> -->

  @if (stateStore.configSys.sysInfo.setup.chocolatey.isChocoOk) {
    <div>
      <span [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.INNER-HTML.ABOUT' | translate"></span>
      @for (extraPackage of extraPackages; track $index) {
        <div
          [ngClass]="{'card border-primary': extraPackage.status != 'not-installed', 'card card-border' : extraPackage.status == 'not-installed' }"
        >
          <div class="card-title">
            <h3>
              <a href="{{extraPackage.website}}" target="_blank">{{extraPackage.website}}</a
              >&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              @if (extraPackage.status == 'not-installed') {
                <em>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.INSTALLED.NOT' | translate }}</em>
              }
              @if (extraPackage.status != 'not-installed') {
                <strong>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.INSTALLED.ALREADY' | translate }}</strong>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#16a34a" class="inline-block w-5 h-5" style="vertical-align:middle; margin-left:4px;" aria-label="installed"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clip-rule="evenodd"/></svg>
              }
            </h3>
          </div>

          <div id="package-{{extraPackage.id}}" class="card-body">
            <a href="{{extraPackage.website}}" target="_blank">
              @if (extraPackage.icon && extraPackage.icon.length > 0) {
                <img src="assets/images/{{extraPackage.icon}}" class="h-12 w-12 object-contain" />
              }
              {{extraPackage.name}}
            </a>
            {{extraPackage.description}}

            <!-- Show dependency information if it exists -->
            @if (extraPackage.dependsOn && extraPackage.dependsOn.length > 0) {
              <div>
                <br/>Depends on: <em><strong>{{extraPackage.dependsOn}}</strong></em>
              </div>
            }

            <!-- Only show commands if they exist -->
            @if (extraPackage.cmdInstall && extraPackage.cmdInstall.length > 0) {
              <div>
                <br/>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.COMMANDS.INSTALL' | translate }}:&nbsp;<em>{{extraPackage.cmdInstall}}</em>
                <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand(extraPackage.cmdInstall)"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
              </div>
            }

            @if (extraPackage.cmdUnInstall && extraPackage.cmdUnInstall.length > 0) {
              <div>
                <br/>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.COMMANDS.UNINSTALL' | translate }}:&nbsp;<em>{{extraPackage.cmdUnInstall}}</em>
                <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand(extraPackage.cmdUnInstall)"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
              </div>
            }

            @if (extraPackage.cmdGetInfo && extraPackage.cmdGetInfo.length > 0) {
              <div>
                <br/>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.COMMANDS.GET-INFO' | translate }}:&nbsp;<em>{{extraPackage.cmdGetInfo}}</em>
                <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand(extraPackage.cmdGetInfo)"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
              </div>
            }

            <br />
          </div>

        </div>
      }
    </div>
  }
  <!--  </ng-template>-->`;
