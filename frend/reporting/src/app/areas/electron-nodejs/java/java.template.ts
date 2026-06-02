export const javaTemplate = `<!-- <ng-template #javaTemplate> -->

@if (!this.stateStore.configSys.sysInfo.setup.isRestartRequired) {
  <div>
    <span
      id="checkPointJavaPreRequisite"
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.REQUIRED-SHORT' | translate"
    ></span>
    <span
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.REQUIRED-LONG' | translate"
    ></span>

    <br /><br /><span
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.EXTRA' | translate"
    ></span>

    <br />
    @if (this.stateStore.configSys.sysInfo.setup.java.isJavaOk) {
      <div>
        <br />
        <span class="badge badge-success"
          id="labelGreatJavaWasFound"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>&nbsp;<strong
            >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.GREAT' | translate }},
            <em>Java</em>
            {{this.stateStore.configSys.sysInfo.setup.java.version}}
            {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.FOUND' | translate }}
            <em>DataPallas</em></strong
          ></span
        >
      </div>
    }

    @if (!this.stateStore.configSys.sysInfo.setup.java.isJavaOk) {
      <div>
        <span class="badge badge-warning"
          ><strong
            ><em>Java</em>
            {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.NOT-FOUND' | translate
            }}
          </strong></span
        >
        &nbsp;
        <span class="badge badge-primary"
          ><strong
            >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.BELOW-INSTRUCTIONS' |
            translate }} <em>Java</em></strong
          ></span
        >

        <br /><br />

        <dburst-chocolatey></dburst-chocolatey>
        <br />

        @if (this.stateStore.configSys.sysInfo.setup.chocolatey.isChocoOk) {
          <span class="badge badge-success"
            ><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>&nbsp;<strong
              ><em>Chocolatey</em>
              {{this.stateStore.configSys.sysInfo.setup.chocolatey.version}}
              {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.FOUND-READY' |
              translate }}
              <em>Java</em></strong
            ></span
          >
        }
        @if (!this.stateStore.configSys.sysInfo.setup.chocolatey.isChocoOk) {
          <span class="badge badge-warning"
            ><strong
              ><em>Chocolatey</em>
              {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.NOT-FOUND' | translate
              }}, {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.YOU-NEED-INSTALL' |
              translate }}
              <em>Chocolatey</em></strong
            ></span
          >
        }

        <br /><br />

        <div class="card card-border bg-base-100 shadow-sm">
          <h4 id="checkPointInstallJava">
            <u
              >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.STEP2' | translate
              }} <em>Java</em></u
            >
          </h4>

          <span
            [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.REQUIRED-LONG' | translate"
          ></span>

          <br /><br />

          <button
            id="btnInstallJava"
            type="button"
            class="btn btn-outline btn-primary"
            [disabled]="!this.stateStore.configSys.sysInfo.setup.chocolatey.isChocoOk"
            (click)="installJava()"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg
            >&nbsp;{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INSTALL' |
            translate }} <em>Java</em>
          </button>
          @if (!this.stateStore.configSys.sysInfo.setup.chocolatey.isChocoOk) {
            <span
              >&nbsp;&nbsp;<strong
                ><em
                  >( {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.FIRST' |
                  translate }} )</em
                ></strong
              ></span
            >
          }
        </div>
      </div>
    }
  </div>
}

@if (this.stateStore.configSys.sysInfo.setup.isRestartRequired) {
  <div>
    <div class="card card-border bg-base-100 shadow-sm">
      <h4 id="checkPointRestartDocumentBurster">
        <u
          >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.RESTARTING' |
          translate }}
          <em>DataPallas</em>
          {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.RESTARTING-REQUIRED' |
          translate }}
        </u>
      </h4>

      <br />

      <button
        id="btnRestartDocumentBurster"
        type="button"
        class="btn btn-outline btn-primary"
        (click)="restartApp()"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg
        >&nbsp;{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.RESTART' |
        translate }}Restart <em>DataPallas</em>
      </button>
    </div>
  </div>
}

  <!--  </ng-template>-->`;
