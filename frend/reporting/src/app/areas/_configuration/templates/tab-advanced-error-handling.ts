export const tabAdvancedErrorHandlingTemplate = `<ng-template #tabAdvancedErrorHandlingTemplate>
  <div class="well">

    <strong style="text-decoration: underline;"> {{
      'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.IF-ANY-RECIPIENT-FAILS' | translate }}</strong>
    <br>

    <div class="row">

      <div class="col-xs-12">

        <div class="radio">
          <label>
            <input type="radio" id="stopImmediatelyOnError" name="failJob"
              [(ngModel)]="xmlSettings?.documentburster.settings.failjobifanydistributionfails"
              (ngModelChange)='markSettingsDirty($event)' [value]="true" />{{
            'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.STOP-ALL-DOCUMENT' | translate }}</label>
        </div>

        <div class="radio">
          <label>
            <input type="radio" id="continueOnError" name="failJob"
              [(ngModel)]="xmlSettings?.documentburster.settings.failjobifanydistributionfails"
              (ngModelChange)='markSettingsDirty($event)' [value]="false" />{{
            'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.CONTINUE-DOCUMENT-DELIVERY' | translate }}</label>
        </div>

      </div>

    </div>

    <br>

    <input type="checkbox" id="btnEnableRetryPolicy"
      [(ngModel)]="xmlSettings?.documentburster.settings.enableretrypolicy"
      (ngModelChange)='markSettingsDirty($event)' />
    <label for="btnEnableRetryPolicy" class="checkboxlabel">

      <strong style="text-decoration: underline;"> {{
        'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.ENABLE-RETRY-POLICY' | translate }}</strong> ({{
      'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.WHEN-RECIPIENT-FAILS' | translate }})
    </label>
    <br>
    <div class="row">

      <div class="col-xs-4">
        {{
          'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DELAY' | translate }}
        <span id='disabled1' *ngIf="!xmlSettings?.documentburster.settings.enableretrypolicy">{{'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE'
          | translate }}</span>
      </div>
      <div class="col-xs-8">
        <input id="retryPolicyDelay" [(ngModel)]="xmlSettings?.documentburster.settings.retrypolicy.delay"
          (ngModelChange)='markSettingsDirty($event)' class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.enableretrypolicy" />
      </div>

    </div>
    <div class="row">

      <div class="col-xs-4"></div>
      <div class="col-xs-8">
        <em>{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.SECONDS' | translate }}</em>
        <span id='disabled2' *ngIf="!xmlSettings?.documentburster.settings.enableretrypolicy"> {{
          'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}
        </span>
      </div>

    </div>

    <br>
    <div class="row">

      <div class="col-xs-4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.MAX-DELAY' | translate }}
        <span id='disabled3' *ngIf="!xmlSettings?.documentburster.settings.enableretrypolicy">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}</span>
      </div>
      <div class="col-xs-8">
        <input id="retryPolicyMaxDelay" [(ngModel)]="xmlSettings?.documentburster.settings.retrypolicy.maxdelay"
          (ngModelChange)='markSettingsDirty($event)' class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.enableretrypolicy" />
      </div>

    </div>

    <div class="row">

      <div class="col-xs-4"></div>
      <div class="col-xs-8">

        <em>{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.SECONDS' | translate }}</em>
        <span id='disabled4' *ngIf="!xmlSettings?.documentburster.settings.enableretrypolicy"> {{
          'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}</span>

      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.MAX-NUMBER-RETRIES' | translate }}
        <span id='disabled5' *ngIf="!xmlSettings?.documentburster.settings.enableretrypolicy">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}</span>
      </div>
      <div class="col-xs-8">
        <input id="retryPolicyMaxRetries" [(ngModel)]="xmlSettings?.documentburster.settings.retrypolicy.maxretries"
          (ngModelChange)='markSettingsDirty($event)' class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.enableretrypolicy" />
      </div>

    </div>
    <div class="row" *ngIf="!xmlSettings?.documentburster.settings.enableretrypolicy">

      <div class="col-xs-4"></div>
      <div class="col-xs-8">
        <span id='disabled6'>{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.DISABLED-CLICK-ENABLE' | translate }}</span>
      </div>

    </div>
    <br>
    <em [innerHTML]="'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.INNER-HTML.SETS-DELAY' | translate">
    </em>.
    <br>
    <br>
    <span [innerHTML]="'AREAS.CONFIGURATION.TAB-ADVANCED-ERROR-HANDLING.INNER-HTML.RETRY-POLICY' | translate"></span>

  </div>
</ng-template>
`;
