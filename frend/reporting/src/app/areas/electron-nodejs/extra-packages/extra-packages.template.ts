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
              <a href="{{extraPackage.website}}" target="_blank"
                ><span>{{extraPackage.website}}</span
                >&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                @if (extraPackage.status == 'not-installed') {
                  <span
                    ><em>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.INSTALLED.NOT' | translate }}</em></span
                  >
                }
                @if (extraPackage.status != 'not-installed') {
                  <span
                    ><strong><u>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.INSTALLED.ALREADY' | translate }}</u></strong></span
                  >
                }</a
              >

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
                <br/>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.COMMANDS.INSTALL' | translate }}:&nbsp;<em><strong>{{extraPackage.cmdInstall}}</strong></em>
              </div>
            }

            @if (extraPackage.cmdUnInstall && extraPackage.cmdUnInstall.length > 0) {
              <div>
                <br/>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.COMMANDS.UNINSTALL' | translate }}:&nbsp;<em><strong>{{extraPackage.cmdUnInstall}}</strong></em>
              </div>
            }

            @if (extraPackage.cmdGetInfo && extraPackage.cmdGetInfo.length > 0) {
              <div>
                <br/>{{ 'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.COMMANDS.GET-INFO' | translate }}:&nbsp;<em><strong>{{extraPackage.cmdGetInfo}}</strong></em>
              </div>
            }

            <br />
          </div>

        </div>
      }
    </div>
  }
  <!--  </ng-template>-->`;
