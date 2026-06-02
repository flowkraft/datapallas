export const dockerTemplate = `
  <!-- Docker Desktop not found -->
  @if (!stateStore?.configSys?.sysInfo?.setup?.docker?.isDockerOk && !stateStore?.configSys?.sysInfo?.setup?.docker?.version) {
  <div>
    <br />
    <span class="badge badge-warning">
      <strong>
        <em>Docker Desktop</em>
        {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DOCKER.NOT-FOUND' | translate}}
      </strong>
    </span>
    <br />
    <br />
    <span
      id="checkPointDockerPreRequisite"
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DOCKER.INNER-HTML.REQUIRED-SHORT' | translate"
    ></span>
    <span
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DOCKER.INNER-HTML.REQUIRED-LONG' | translate"
    ></span>

    <br /><br />
    <span
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DOCKER.INNER-HTML.EXTRA' | translate"
    ></span>

    <br /><br />

    <a href="#" [routerLink]="['/help', 'appsMenuSelected']" [queryParams]="{activeTab: 'extraPackagesTab'}"
    skipLocationChange="true">
      <button id="btnInstallDockerTabPortal" type="button" class="btn btn-outline btn-primary">
        {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DOCKER.INSTALL' | translate}}
        <em>Docker Desktop</em>
      </button>
    </a>
    <br/><br/>
  </div>
  }

  <!-- Docker Desktop too old -->
  @if (!stateStore?.configSys?.sysInfo?.setup?.docker?.isDockerOk && stateStore?.configSys?.sysInfo?.setup?.docker?.version) {
  <div>
    <br /><br />
    <span id="dockerInstallationOld" class="badge badge-warning">
      <strong>
        <em>Docker Desktop</em>
        {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DOCKER.TOO-OLD' | translate}}
      </strong>
    </span>
    
    <br /><br />

    <span
      id="checkPointDockerPreRequisite"
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DOCKER.INNER-HTML.REQUIRED-SHORT' | translate"
    ></span>
    
    <br /><br />

    <span
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DOCKER.INNER-HTML.TOO-OLD' | translate"
    ></span>

    <br /><br />

    <a href="#" [routerLink]="['/help', 'appsMenuSelected']" [queryParams]="{activeTab: 'extraPackagesTab'}"
    skipLocationChange="true">
      <button id="btnUpdateDockerTabPortal" type="button" class="btn btn-outline btn-primary">
        {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DOCKER.UPDATE' | translate}}
        <em>Docker Desktop</em>
      </button>
    </a>
    <br/><br/>
  </div>
  }
`;
