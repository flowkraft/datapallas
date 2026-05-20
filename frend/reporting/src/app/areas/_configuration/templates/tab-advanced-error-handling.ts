export const tabAdvancedErrorHandlingTemplate = `<ng-template #tabAdvancedErrorHandlingTemplate>
  <div class="space-y-4">

    <strong style="text-decoration: underline;"> {{
      'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.IF-ANY-RECIPIENT-FAILS' | translate }}</strong>
    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 12">

        <label class="label">
          <input type="radio" class="radio radio-sm" id="stopImmediatelyOnError" name="failJob"
            [ngModel]="xmlSettings?.documentburster?.settings?.failjobifanydistributionfails"
            (ngModelChange)="setXmlPath('documentburster.settings.failjobifanydistributionfails', $event)" [value]="true" />
          <span>{{
            'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.STOP-ALL-DOCUMENT' | translate }}</span>
        </label>

        <label class="label">
          <input type="radio" class="radio radio-sm" id="continueOnError" name="failJob"
            [ngModel]="xmlSettings?.documentburster?.settings?.failjobifanydistributionfails"
            (ngModelChange)="setXmlPath('documentburster.settings.failjobifanydistributionfails', $event)" [value]="false" />
          <span>{{
            'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.CONTINUE-DOCUMENT-DELIVERY' | translate }}</span>
        </label>

      </div>

    </div>

    <br>

    <input type="checkbox" id="btnEnableRetryPolicy"
      [ngModel]="xmlSettings?.documentburster?.settings?.enableretrypolicy"
      (ngModelChange)="setXmlPath('documentburster.settings.enableretrypolicy', $event)" />
    <label for="btnEnableRetryPolicy" class="checkboxlabel">

      <strong style="text-decoration: underline;"> {{
        'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.ENABLE-RETRY-POLICY' | translate }}</strong> ({{
      'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.WHEN-RECIPIENT-FAILS' | translate }})
    </label>
    <br>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 4">
        {{
          'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DELAY' | translate }}
        @if (!xmlSettings?.documentburster.settings.enableretrypolicy) {
          <span id='disabled1'>{{'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE'
            | translate }}</span>
        }
      </div>
      <div style="grid-column:span 8">
        <input id="retryPolicyDelay" [ngModel]="xmlSettings?.documentburster?.settings?.retrypolicy?.delay"
          (ngModelChange)="setXmlPath('documentburster.settings.retrypolicy.delay', $event)" class="input"
          [disabled]="!xmlSettings?.documentburster.settings.enableretrypolicy" />
      </div>

    </div>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 4"></div>
      <div style="grid-column:span 8">
        <em>{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.SECONDS' | translate }}</em>
        @if (!xmlSettings?.documentburster.settings.enableretrypolicy) {
          <span id='disabled2'> {{
            'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}
          </span>
        }
      </div>

    </div>

    <br>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.MAX-DELAY' | translate }}
        @if (!xmlSettings?.documentburster.settings.enableretrypolicy) {
          <span id='disabled3'>{{
            'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}</span>
        }
      </div>
      <div style="grid-column:span 8">
        <input id="retryPolicyMaxDelay" [ngModel]="xmlSettings?.documentburster?.settings?.retrypolicy?.maxdelay"
          (ngModelChange)="setXmlPath('documentburster.settings.retrypolicy.maxdelay', $event)" class="input"
          [disabled]="!xmlSettings?.documentburster.settings.enableretrypolicy" />
      </div>

    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 4"></div>
      <div style="grid-column:span 8">

        <em>{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.SECONDS' | translate }}</em>
        @if (!xmlSettings?.documentburster.settings.enableretrypolicy) {
          <span id='disabled4'> {{
            'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}</span>
        }

      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.MAX-NUMBER-RETRIES' | translate }}
        @if (!xmlSettings?.documentburster.settings.enableretrypolicy) {
          <span id='disabled5'>{{
            'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}</span>
        }
      </div>
      <div style="grid-column:span 8">
        <input id="retryPolicyMaxRetries" [ngModel]="xmlSettings?.documentburster?.settings?.retrypolicy?.maxretries"
          (ngModelChange)="setXmlPath('documentburster.settings.retrypolicy.maxretries', $event)" class="input"
          [disabled]="!xmlSettings?.documentburster.settings.enableretrypolicy" />
      </div>

    </div>
    @if (!xmlSettings?.documentburster.settings.enableretrypolicy) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 4"></div>
        <div style="grid-column:span 8">
          <span id='disabled6'>{{
            'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}</span>
        </div>
      </div>
    }
    <br>
    <em [innerHTML]="'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.INNER-HTML.SETS-DELAY' | translate">
    </em>.
    <br>
    <br>
    <span [innerHTML]="'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.INNER-HTML.RETRY-POLICY' | translate"></span>

  </div>
</ng-template>
`;
