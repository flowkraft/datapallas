export const tabAdvancedTemplate = `<ng-template #tabAdvancedTemplate>
  <div class="space-y-4">
    @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 4">
          <br>
          {{
          'AREAS.CONFIGURATION.TAB-ADVANCED.DELAY-EACH-BY' | translate }}
        </div>
        <div style="grid-column:span 8">
          <input id="delayEachDistributionBy"
            [ngModel]="xmlSettings?.documentburster?.settings?.delayeachdistributionby"
            (ngModelChange)="setXmlPath('documentburster.settings.delayeachdistributionby', $event)" class="input" />
        </div>
      </div>
    }

    @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 4"></div>
        <div style="grid-column:span 8">
          <em> {{
            'AREAS.CONFIGURATION.TAB-ADVANCED.SECONDS' | translate }}</em>
        </div>
      </div>
    }

    <br />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 4"> {{
        'AREAS.CONFIGURATION.TAB-ADVANCED.NUMBER-USER-VARIABLES' | translate }}</div>
      <div style="grid-column:span 8">
        <input id="numberOfUserVariables"
          [ngModel]="xmlSettings?.documentburster?.settings?.numberofuservariables"
          (ngModelChange)="setXmlPath('documentburster.settings.numberofuservariables', $event)" class="input" />
      </div>
    </div>

    <br />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED.START-DELIMITER-TOKEN' | translate }}</div>
      <div style="grid-column:span 8">
        <input id="burstTokenDelimitersStart"
          [ngModel]="xmlSettings?.documentburster?.settings?.bursttokendelimiters?.start"
          (ngModelChange)="setXmlPath('documentburster.settings.bursttokendelimiters.start', $event)" class="input" />
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED.END-DELIMITER-TOKEN' | translate }}</div>
      <div style="grid-column:span 8">
        <input id="burstTokenDelimitersEnd"
          [ngModel]="xmlSettings?.documentburster?.settings?.bursttokendelimiters?.end"
          (ngModelChange)="setXmlPath('documentburster.settings.bursttokendelimiters.end', $event)" class="input" />
      </div>
    </div>

    <br />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input type="checkbox" id="btnReuseToken"
          [ngModel]="xmlSettings?.documentburster?.settings?.reusetokenswhennotfound"
          (ngModelChange)="setXmlPath('documentburster.settings.reusetokenswhennotfound', $event)" />
        <label for="btnReuseToken" class="checkboxlabel">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.REUSE-LAST-TOKEN' | translate }}</label>
      </div>
    </div>
    <br/>
    @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 4">
          <input type="checkbox" id="btnHTMLEmailEditCode"
            [ngModel]="xmlSettings?.documentburster?.settings?.htmlemaileditcode"
            (ngModelChange)="setXmlPath('documentburster.settings.htmlemaileditcode', $event)" />
          <label for="btnHTMLEmailEditCode" class="checkboxlabel">{{
            'AREAS.CONFIGURATION.TAB-ADVANCED.EDIT-EMAIL-MESSAGE' | translate }}</label>
        </div>

      </div>
    }
    @if (xmlSettings?.documentburster?.settings.htmlemaileditcode) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 4">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.DATASOURCE-RESOLVER' | translate }}</div>
        <div style="grid-column:span 8" >
          <input id="dataSourceResolver"
            [ngModel]="xmlSettings?.documentburster?.settings?.emailsettings?.dsresolver"
            (ngModelChange)="setXmlPath('documentburster.settings.emailsettings.dsresolver', $event)" class="input" />
        </div>
      </div>
    }

    <br/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input type="checkbox" id="btnSplit2ndTime"
          [ngModel]="xmlSettings?.documentburster?.settings?.split2ndtime"
          (ngModelChange)="setXmlPath('documentburster.settings.split2ndtime', $event)" />
      <label for="btnSplit2ndTime" class="checkboxlabel">
        <strong> {{
          'AREAS.CONFIGURATION.TAB-ADVANCED.SPLIT-2ND-TIME' | translate }}</strong>
      </label>
        </div>
    </div>
    <br/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED.START-DELIMITER-TOKEN-2ND-SPLIT' | translate }}</div>
      <div style="grid-column:span 8">
        <input id="burstTokenDelimitersStart2nd"
          [ngModel]="xmlSettings?.documentburster?.settings?.bursttokendelimiters?.start2nd"
          (ngModelChange)="setXmlPath('documentburster.settings.bursttokendelimiters.start2nd', $event)" class="input"
          [disabled]="!xmlSettings?.documentburster?.settings?.split2ndtime"/>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED.END-DELIMITER-TOKEN-2ND-SPLIT' | translate }}</div>
      <div style="grid-column:span 8">
        <input id="burstTokenDelimitersEnd2nd"
          [ngModel]="xmlSettings?.documentburster?.settings?.bursttokendelimiters?.end2nd"
          (ngModelChange)="setXmlPath('documentburster.settings.bursttokendelimiters.end2nd', $event)" class="input"
          [disabled]="!xmlSettings?.documentburster?.settings?.split2ndtime"/>
      </div>
    </div>

    <br />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input type="checkbox" id="btnEnableIncubatingFeatures"
          [ngModel]="xmlSettings?.documentburster?.settings?.enableincubatingfeatures"
          (ngModelChange)="setXmlPath('documentburster.settings.enableincubatingfeatures', $event); refreshTabs()" />
        <label for="btnEnableIncubatingFeatures" class="checkboxlabel">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.ENABLE-INCUBATING-FEATURES' | translate }}</label>
      </div>
    </div>


  </div>
</ng-template>
`;
