export const tabSMSTwilioTemplate = `<ng-template #tabSMSTwilioTemplate>

  @if (isModalSMSVisible) {
  <dp-dialog header="{{'AREAS.CONFIGURATION.TAB-SMS-TWILIO.SEND-TEST-SMS-MESSAGE' | translate}}"
    [(visible)]="isModalSMSVisible">

    <div class="modal-body" id="modal-body" style="margin: 10px;">

      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">


        <div style="grid-column:span 4">
          {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.FROM-NUMBER' | translate }}
        </div>

        <div style="grid-column:span 8">
          <input type="text" id="fromNumber" class="input" [ngModel]="this.modalSMSInfo.fromNumber" (ngModelChange)="this.modalSMSInfo.fromNumber = $event" size="25"
            autofocus>
        </div>

      </div>
      <br>

      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

        <div style="grid-column:span 4">
          {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.TO-NUMBER' | translate }}
        </div>

        <div style="grid-column:span 8">
          <input type="text" id="toNumber" class="input" [ngModel]="this.modalSMSInfo.toNumber" (ngModelChange)="this.modalSMSInfo.toNumber = $event" size="25">
        </div>

      </div>

    </div>
    <div ngProjectAs="[footer]">
      <button id='btnOKConfirmation' class="btn btn-outline btn-primary" type="button" (click)="onSendTestSMS()"
        [disabled]="!this.modalSMSInfo.fromNumber || !this.modalSMSInfo.toNumber">
        {{ 'AREAS.CONFIGURATION.TAB-SMS-TWILIO.SEND-TEST-SMS' | translate }}</button>
      <button class="btn btn-ghost dburst-button-question-decline" type="button"
        (click)="onCloseSMSModal()">{{ 'BUTTONS.CANCEL' | translate }}</button>
    </div>

  </dp-dialog>
  }


  <div class="space-y-4">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">
        <a href="https://support.twilio.com/hc/en-us/articles/223136027-Auth-Tokens-and-how-to-change-them"
          target="_blank">Twilio
          Help</a>
      </div>
      <div style="grid-column:span 10">
        <a href="https://support.twilio.com/hc/en-us/articles/223136027-Auth-Tokens-and-how-to-change-them"
          target="_blank">What
          is the Auth Token?</a>
      </div>

    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-SMS-TWILIO.ACCOUNT-SID' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="accountSid" [ngModel]="xmlSettings?.documentburster?.settings?.smssettings?.twilio?.accountsid"
            (ngModelChange)="setXmlPath('documentburster.settings.smssettings.twilio.accountsid', $event)" type="text" class="input" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnAccountSidVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('accountSid',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-SMS-TWILIO.AUTH-TOKEN' | translate }}</div>
      <div style="grid-column:span 7">
        <div class="join">
          <input id="authToken" [ngModel]="xmlSettings?.documentburster?.settings?.smssettings?.twilio?.authtoken"
            (ngModelChange)="setXmlPath('documentburster.settings.smssettings.twilio.authtoken', $event)" [type]="showTwilioAuthToken ? 'text' : 'password'" class="input join-item" />
          <span id="btnToggleTwilioAuthToken" class="join-item btn btn-ghost" style="cursor:pointer" (click)="toggleRevealTwilioToken()">
            @if (showTwilioAuthToken) {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            }
          </span>
        </div>
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnAuthTokenVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('authToken',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-SMS-TWILIO.TEST-CONNECTION' | translate }}</div>
      <div style="grid-column:span 7">
        <button id="btnSendTestSMS" type="button" class="btn btn-outline btn-primary w-full" (click)="onShowSendTestSMSModal()"
          [disabled]="!xmlSettings?.documentburster.settings.smssettings.twilio.authtoken || !xmlSettings?.documentburster.settings.smssettings.twilio.accountsid">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>&nbsp;&nbsp;{{
          'AREAS.CONFIGURATION.TAB-SMS-TWILIO.SEND-TEST-SMS' | translate }}</button>
      </div>
      <div style="grid-column:span 3">
        <dburst-button-clear-logs></dburst-button-clear-logs>
      </div>

    </div>

  </div>
</ng-template>
`;
