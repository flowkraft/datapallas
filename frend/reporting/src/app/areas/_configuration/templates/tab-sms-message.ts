export const tabSMSMessageTemplate = `<ng-template #tabSMSMessageTemplate>
  <div class="space-y-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.FROM-NUMBER' | translate }}
      </div>
      <div style="grid-column:span 7">
        <input
          id="fromTelephoneNumber"
          [ngModel]="xmlSettings?.documentburster?.settings?.smssettings?.fromtelephonenumber"
          (ngModelChange)="setXmlPath('documentburster.settings.smssettings.fromtelephonenumber', $event)"
          class="input"
        />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables
          id="btnFromTelephoneNumberVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('fromTelephoneNumber',$event)"
        >
        </dburst-button-variables>
      </div>
    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.TO-NUMBER' | translate }}
      </div>
      <div style="grid-column:span 7">
        <input
          id="toTelephoneNumber"
          [ngModel]="xmlSettings?.documentburster?.settings?.smssettings?.totelephonenumber"
          (ngModelChange)="setXmlPath('documentburster.settings.smssettings.totelephonenumber', $event)"
          class="input"
        />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables
          id="btnToTelephoneNumberVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('toTelephoneNumber',$event)"
        >
        </dburst-button-variables>
      </div>
    </div>

    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-SMS-MESSAGE.TEXT' | translate }}
      </div>
      <div style="grid-column:span 7">
        <textarea
          [ngModel]="xmlSettings?.documentburster?.settings?.smssettings?.text"
          (ngModelChange)="setXmlPath('documentburster.settings.smssettings.text', $event)"
          class="textarea textarea-bordered"
          rows="5"
          id="smsText"
        ></textarea>
      </div>

      <div style="grid-column:span 3">
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
