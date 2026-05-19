export const tabQATemplate = `<ng-template #tabQATemplate>
  <div class="well">

  <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-QA.WEB-URL' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="qaWebURL" [ngModel]="xmlSettings?.documentburster?.settings?.qualityassurance?.emailserver?.weburl"
          (ngModelChange)="setXmlPath('documentburster.settings.qualityassurance.emailserver.weburl', $event)" class="input input-bordered" />
      </div>

  </div>
  <p></p>

  <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-QA.FROM-NAME' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="qaFromName" [ngModel]="xmlSettings?.documentburster?.settings?.qualityassurance?.emailserver?.name"
          (ngModelChange)="setXmlPath('documentburster.settings.qualityassurance.emailserver.name', $event)" class="input input-bordered" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnQaFromNameVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('qaFromName',$event)">
        </dburst-button-variables>
      </div>

    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-QA.FROM-ADDRESS' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="qaFromEmailAddress"
          [ngModel]="xmlSettings?.documentburster?.settings?.qualityassurance?.emailserver?.fromaddress"
          (ngModelChange)="setXmlPath('documentburster.settings.qualityassurance.emailserver.fromaddress', $event)" class="input input-bordered" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnQaFromEmailAddressVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('qaFromEmailAddress',$event)">
        </dburst-button-variables>
      </div>

    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-QA.HOST' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="qaEmailServerHost"
          [ngModel]="xmlSettings?.documentburster?.settings?.qualityassurance?.emailserver?.host"
          (ngModelChange)="setXmlPath('documentburster.settings.qualityassurance.emailserver.host', $event)" class="input input-bordered" />
      </div>

    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-QA.USER-NAME' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="qaUserName" [ngModel]="xmlSettings?.documentburster?.settings?.qualityassurance?.emailserver?.userid"
          (ngModelChange)="setXmlPath('documentburster.settings.qualityassurance.emailserver.userid', $event)" class="input input-bordered" />
      </div>

    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-QA.PASSWORD' | translate }}</div>
      <div style="grid-column:span 7">
        <div class="join">
          <input id="qaPassword"
            [ngModel]="xmlSettings?.documentburster?.settings?.qualityassurance?.emailserver?.userpassword"
            (ngModelChange)="setXmlPath('documentburster.settings.qualityassurance.emailserver.userpassword', $event)" [type]="showQaPassword ? 'text' : 'password'" class="input input-bordered join-item" />
          <span id="btnToggleQaPassword" class="join-item btn btn-ghost" style="cursor:pointer" (click)="toggleRevealQaPassword()">
            @if (showQaPassword) {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            }
          </span>
        </div>
      </div>

    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-QA.PORT' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="qaPort" [ngModel]="xmlSettings?.documentburster?.settings?.qualityassurance?.emailserver?.port"
          (ngModelChange)="setXmlPath('documentburster.settings.qualityassurance.emailserver.port', $event)" class="input input-bordered" />
      </div>

    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2"></div>

      <div style="grid-column:span 3">
        <input type="checkbox" id="btnQASSL"
          [ngModel]="xmlSettings?.documentburster?.settings?.qualityassurance?.emailserver?.usessl"
          (ngModelChange)="setXmlPath('documentburster.settings.qualityassurance.emailserver.usessl', $event)" ng-true-value="'true'" ng-false-value="'false'" />
        <label for="btnQASSL" class="checkboxlabel">&nbsp;{{
          'AREAS.CONFIGURATION.TAB-QA.SSL-ENABLED' | translate }}</label>
      </div>

      <div style="grid-column:span 3">
        <input type="checkbox" id="btnQATLS"
          [ngModel]="xmlSettings?.documentburster?.settings?.qualityassurance?.emailserver?.usetls"
          (ngModelChange)="setXmlPath('documentburster.settings.qualityassurance.emailserver.usetls', $event)" ng-true-value="'true'" ng-false-value="'false'" />
        <label for="btnQATLS" class="checkboxlabel">&nbsp;{{
          'AREAS.CONFIGURATION.TAB-QA.TLS-ENABLED' | translate }}</label>
      </div>

    </div>
  </div>
</ng-template>
`;
