export const updateTemplate = `
@if (!succint()) {
  <div>
    @if (!licenseService?.isNewerVersionAvailable) {
      <div>
        <h4>
          <span class="badge badge-ghost"
            >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.NOTHING-UPDATE"
            | translate }}</span
          >
          ({{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.LATEST-VERSION" |
          translate }})
        </h4>
      </div>
    }
    @if (!licenseService?.isNewerVersionAvailable) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <hr />
        <div style="grid-column:span 12">
          <input
            type="checkbox"
            id="btnLetMeUpdateManually"
            [(ngModel)]="letMeUpdateManually"
            [disabled]="!this.storeService.configSys.sysInfo.setup.java.isJavaOk"
          />
          <label for="btnLetMeUpdateManually" class="checkboxlabel"
            >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.LET-ME1" |
            translate }}
            <em>{{ settingsService?.product }}</em>
            {{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.LET-ME2" |
            translate }}
          </label>
        </div>
      </div>
    }
    <br />
    @if (letMeUpdateManually) {
      <div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 9">
            <input
              id="oldDbInstallationFolder"
              [(ngModel)]="letMeUpdateSourceDirectoryPath"
              class="input input-bordered"
              autofocus
              required
            /><em
              >(*) {{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.SELECT" |
              translate }} DocumentBurster.exe/DataPallas.exe</em
            >
          </div>

          <div style="grid-column:span 3">
            <dburst-button-native-system-dialog
              btnId="btnSelectExistingInstallation"
              value="Select Existing Installation"
              dialogType='folder'
              screen='letmeupdate'
              (pathsSelected)="onExistingInstallationFolderSelected($event)"
            ></dburst-button-native-system-dialog>
          </div>
        </div>
        <br />
        @if (letMeUpdateSourceDirectoryPath) {
          <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
            @if (updateInfo?.errorMsg) {
              <div
                style="grid-column:span 12;overflow-x: scroll"
              >
                <span id="errorMsg" class="badge badge-warning" style="word-wrap: break-word"
                  >{{ updateInfo?.errorMsg }}</span
                >
              </div>
            }
            @if (!updateInfo?.errorMsg) {
              <div
                style="grid-column:span 9;height: 350px; overflow-y: scroll; overflow-x: auto"
              >
                <dburst-when-updating [updateInfo]="updateInfo"></dburst-when-updating
                ><br />
                <strong
                  >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING1" |
                  translate }} {{ updateInfo?.updateSourceDirectoryPath }}
                  @if (updateInfo?.updateSourceVersion) {
                    <span
                      >(v{{ updateInfo?.updateSourceVersion }})</span
                    >
                  }
                  {{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING2" |
                  translate }} {{ homeDirectoryPath }} (v{{ settingsService?.version
                  }})</strong
                >
                <br /><br />
                <strong
                  >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING3" |
                  translate }}</strong
                ><br /><br />
                <ol>
                  @for (configFile of updateInfo?.migrateConfigFiles; track $index) {
                    <li>
                      {{ configFile[0] }} - {{ configFile[1] }}
                    </li>
                  }
                </ol>
                <br />
                @if (updateInfo?.migrateScriptFiles.length == 0) {
                  <strong
                    ><u
                      >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING4"
                      | translate }}</u
                    ></strong
                  >
                }
                @if (updateInfo?.migrateScriptFiles.length > 0) {
                  <div>
                    <strong
                      >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING5"
                      | translate }}</strong
                    ><br /><br />
                    <ol>
                      @for (scriptFile of updateInfo?.migrateScriptFiles; track $index) {
                        <li>
                          {{ scriptFile[0] }} - {{ scriptFile[1] }}
                        </li>
                      }
                    </ol>
                  </div>
                }
                <br />
                @if (updateInfo?.templatesFolders.length == 0) {
                  <strong
                    ><u
                      >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING6"
                      | translate }}</u
                    ></strong
                  >
                }
                @if (updateInfo?.templatesFolders.length > 0) {
                  <div>
                    <strong
                      >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING7"
                      | translate }}</strong
                    ><br /><br />
                    <ol>
                      @for (templatesFolder of updateInfo?.templatesFolders; track $index) {
                        <li>
                          {{ templatesFolder[0] }} - {{ templatesFolder[1] }}
                        </li>
                      }
                    </ol>
                  </div>
                }
              </div>
            }
            @if (!updateInfo?.errorMsg && !letMeUpdateSourceDirectoryPath.includes('playwright/')) {
              <div style="grid-column:span 9">
                <br />
                <button
                  id="btnMigrate"
                  type="button"
                  class="btn btn-primary"
                  (click)="handleMigrateCopyAboveFiles()"
                  [disabled]="executionStatsService?.jobStats.numberOfActiveJobs > 0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"/></svg>&nbsp;{{
                  "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING13" |
                  translate }}
                </button>
              </div>
            }
            @if (letMeUpdateSourceDirectoryPath.includes('playwright/')) {
              <div style="grid-column:span 9">
                <br />
                <button
                  id="btnE2EFillInfo"
                  type="button"
                  class="btn btn-primary"
                  (click)="onExistingInstallationFolderSelected('playwright/')"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"/></svg>&nbsp;Fill Info
                </button>
              </div>
            }
          </div>
        }
      </div>
    }
  </div>
} `;
