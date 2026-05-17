export const tabSMSMessageTemplate = `<ng-template #tabSMSMessageTemplate>
  <div class="well">
    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.FROM-NUMBER' | translate }}
      </div>
      <div class="col-xs-7">
        <input
          id="fromTelephoneNumber"
          [(ngModel)]="xmlSettings?.documentburster.settings.smssettings.fromtelephonenumber"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
        />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables
          id="btnFromTelephoneNumberVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('fromTelephoneNumber',$event)"
        >
        </dburst-button-variables>
      </div>
    </div>

    <p></p>

    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.TO-NUMBER' | translate }}
      </div>
      <div class="col-xs-7">
        <input
          id="toTelephoneNumber"
          [(ngModel)]="xmlSettings?.documentburster.settings.smssettings.totelephonenumber"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
        />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables
          id="btnToTelephoneNumberVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('toTelephoneNumber',$event)"
        >
        </dburst-button-variables>
      </div>
    </div>

    <p></p>
    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.TEXT' | translate }}
      </div>
      <div class="col-xs-7">
        <textarea
          [(ngModel)]="xmlSettings?.documentburster.settings.smssettings.text"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
          rows="5"
          id="smsText"
        ></textarea>
      </div>

      <div class="col-xs-3">
        <dburst-button-variables
          id="btnSmsTextVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('smsText',$event)"
        >
        </dburst-button-variables>
      </div>
    </div>
  </div>
</ng-template>
`
