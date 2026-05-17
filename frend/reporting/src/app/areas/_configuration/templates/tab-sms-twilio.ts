export const tabSMSTwilioTemplate = `<ng-template #tabSMSTwilioTemplate>

  <p-dialog header="{{'AREAS.CONFIGURATION.TAB-SMS-TWILIO.SEND-TEST-SMS-MESSAGE' | translate}}"
    [(visible)]="isModalSMSVisible" [baseZIndex]="1000" [modal]="true">
    <p-header>
    </p-header>

    <div class="modal-body" id="modal-body" style="margin: 10px;">

      <div class="row">


        <div class="col-xs-4">
          {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.FROM-NUMBER' | translate }}
        </div>

        <div class="col-xs-8">
          <input type="text" id="fromNumber" class="form-control" [(ngModel)]="this.modalSMSInfo.fromNumber" size="25"
            autofocus>
        </div>

      </div>
      <br>

      <div class="row">

        <div class="col-xs-4">
          {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.TO-NUMBER' | translate }}
        </div>

        <div class="col-xs-8">
          <input type="text" id="toNumber" class="form-control" [(ngModel)]="this.modalSMSInfo.toNumber" size="25">
        </div>

      </div>

    </div>
    <p-footer>

      <button id='btnOKConfirmation' class="btn btn-primary" type="button" (click)="onSendTestSMS()"
        [disabled]="!this.modalSMSInfo.fromNumber || !this.modalSMSInfo.toNumber">
        {{ 'AREAS.CONFIGURATION.TAB-SMS-TWILIO.SEND-TEST-SMS' | translate }}</button>
      <button class="btn btn-flat btn-default dburst-button-question-decline" type="button"
        (click)="onCloseSMSModal()">{{ 'BUTTONS.CANCEL' | translate }}</button>

    </p-footer>

  </p-dialog>


  <div class="well">

    <div class="row">

      <div class="col-xs-2">
        <a href="https://support.twilio.com/hc/en-us/articles/223136027-Auth-Tokens-and-how-to-change-them"
          target="_blank">Twilio
          Help</a>
      </div>
      <div class="col-xs-10">
        <a href="https://support.twilio.com/hc/en-us/articles/223136027-Auth-Tokens-and-how-to-change-them"
          target="_blank">What
          is the Auth Token?</a>
      </div>

    </div>

    <p></p>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-SMS-TWILIO.ACCOUNT-SID' | translate }}</div>
      <div class="col-xs-7">
        <input id="accountSid" [(ngModel)]="xmlSettings?.documentburster.settings.smssettings.twilio.accountsid"
            (ngModelChange)='markSettingsDirty($event)' type="text" class="form-control" />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables id="btnAccountSidVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('accountSid',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <p></p>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-SMS-TWILIO.AUTH-TOKEN' | translate }}</div>
      <div class="col-xs-7">
        <div class="input-group">
          <input id="authToken" [(ngModel)]="xmlSettings?.documentburster.settings.smssettings.twilio.authtoken"
            (ngModelChange)='markSettingsDirty($event)' [type]="showTwilioAuthToken ? 'text' : 'password'" class="form-control" />
          <span id="btnToggleTwilioAuthToken" class="input-group-addon" style="cursor:pointer" (click)="toggleRevealTwilioToken()">
            <i [class]="showTwilioAuthToken ? 'fa fa-eye-slash' : 'fa fa-eye'"></i>
          </span>
        </div>
      </div>

      <div class="col-xs-3">
        <dburst-button-variables id="btnAuthTokenVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('authToken',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <p></p>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-SMS-TWILIO.TEST-CONNECTION' | translate }}</div>
      <div class="col-xs-7">
        <button id="btnSendTestSMS" type="button" class="btn btn-primary btn-block" (click)="onShowSendTestSMSModal()"
          [disabled]="!xmlSettings?.documentburster.settings.smssettings.twilio.authtoken || !xmlSettings?.documentburster.settings.smssettings.twilio.accountsid">
          <i class="fa fa-paper-plane"></i>&nbsp;&nbsp;{{
          'AREAS.CONFIGURATION.TAB-SMS-TWILIO.SEND-TEST-SMS' | translate }}</button>
      </div>
      <div class="col-xs-3">
        <dburst-button-clear-logs></dburst-button-clear-logs>
      </div>

    </div>

  </div>
</ng-template>
`;
