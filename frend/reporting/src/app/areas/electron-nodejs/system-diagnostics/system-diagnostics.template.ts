export const systemDiagnosticsTemplate = `<!--<ng-template #systemDiagnosticsTemplate> -->
<strong id='checkPointHelpJavaPreRequisite'
  >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.DIAGNOSTICS.STATUS' | translate
  }}</strong
>
<br /><br />

@if (!this.stateStore.configSys.sysInfo.setup.java.isJavaOk) {
<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
  <div style="grid-column:span 2">
    <span class="badge badge-warning"
      ><strong
        ><em>Java</em> {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.NOT-FOUND'
        | translate }}</strong
      ></span
    >
  </div>

  <!--
  <div>
    <button type="button" class="btn btn-outline btn-primary" (click)="restartApp()">
      <i class="fa fa-play"></i
      >&nbsp;{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.RESTART' | translate
      }} <em>DataPallas</em>
    </button>
  </div>
  -->
</div>
}

@if (this.stateStore.configSys.sysInfo.setup.java.isJavaOk) {
<span id="labelGreatJavaWasFound" class="badge badge-success"
  ><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>&nbsp;<strong
    >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.GREAT' | translate }},
    <em>Java</em>
    {{this.stateStore.configSys.sysInfo.setup.java.version}}
    {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.FOUND' | translate }}
    <em>DataPallas</em></strong
  ></span
>
}

<br /><br />
<strong>Environment Variables</strong>
<br /><br />
<ol>
  <li>
    <em>%JAVA_HOME%</em> (process.env) <code>{{this.stateStore.configSys.sysInfo.setup.env.JAVA_HOME}}</code>
  </li>
  <li>
    <em>%JRE_HOME%</em> (process.env) <code>{{this.stateStore.configSys.sysInfo.setup.env.JRE_HOME}}</code>
  </li>
  <li><em>%PATH%</em> (process.env) <code>{{this.stateStore.configSys.sysInfo.setup.env.PATH}}</code></li>

</ol>


`;
