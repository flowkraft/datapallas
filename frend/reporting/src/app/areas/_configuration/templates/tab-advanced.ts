export const tabAdvancedTemplate = `<ng-template #tabAdvancedTemplate>
  <div class="well">
    <div class="row" *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution">
      <div class="col-xs-4">
        <br>
        {{
        'AREAS.CONFIGURATION.TAB-ADVANCED.DELAY-EACH-BY' | translate }}
      </div>
      <div class="col-xs-8">
        <input id="delayEachDistributionBy" [(ngModel)]="
            xmlSettings?.documentburster?.settings.delayeachdistributionby
          "
          (ngModelChange)="markSettingsDirty($event)" class="form-control" />
      </div>
    </div>

    <div class="row" *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution">
      <div class="col-xs-4"></div>
      <div class="col-xs-8">
        <em> {{
          'AREAS.CONFIGURATION.TAB-ADVANCED.SECONDS' | translate }}</em>
      </div>
    </div>

    <br />

    <div class="row">
      <div class="col-xs-4"> {{
        'AREAS.CONFIGURATION.TAB-ADVANCED.NUMBER-USER-VARIABLES' | translate }}</div>
      <div class="col-xs-8">
        <input id="numberOfUserVariables" [(ngModel)]="
            xmlSettings?.documentburster?.settings.numberofuservariables
          "
          (ngModelChange)="markSettingsDirty($event)" class="form-control" />
      </div>
    </div>

    <br />

    <div class="row">
      <div class="col-xs-4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED.START-DELIMITER-TOKEN' | translate }}</div>
      <div class="col-xs-8">
        <input id="burstTokenDelimitersStart" [(ngModel)]="
            xmlSettings?.documentburster?.settings.bursttokendelimiters.start
          "
          (ngModelChange)="markSettingsDirty($event)" class="form-control" />
      </div>
    </div>
    <div class="row">
      <div class="col-xs-4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED.END-DELIMITER-TOKEN' | translate }}</div>
      <div class="col-xs-8">
        <input id="burstTokenDelimitersEnd" [(ngModel)]="
            xmlSettings?.documentburster?.settings.bursttokendelimiters.end
          "
          (ngModelChange)="markSettingsDirty($event)" class="form-control" />
      </div>
    </div>

    <br />

    <div class="row">
      <div class="col-xs-12">
        <input type="checkbox" id="btnReuseToken" [(ngModel)]="
            xmlSettings?.documentburster?.settings.reusetokenswhennotfound
          "
          (ngModelChange)="markSettingsDirty($event)" />
        <label for="btnReuseToken" class="checkboxlabel">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.REUSE-LAST-TOKEN' | translate }}</label>
      </div>
    </div>
    <br />
    <div class="row" *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution">
      <div class="col-xs-4">
        <input type="checkbox" id="btnHTMLEmailEditCode" [(ngModel)]="xmlSettings?.documentburster?.settings.htmlemaileditcode"
          (ngModelChange)="markSettingsDirty($event)" />
        <label for="btnHTMLEmailEditCode" class="checkboxlabel">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.EDIT-EMAIL-MESSAGE' | translate }}</label>
      </div>
      
    </div>
    <div class="row" *ngIf="xmlSettings?.documentburster?.settings.htmlemaileditcode">
      <div class="col-xs-4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED.DATASOURCE-RESOLVER' | translate }}</div>
      <div class="col-xs-8" >
        <input id="dataSourceResolver" [(ngModel)]="xmlSettings?.documentburster.settings.emailsettings.dsresolver"
          (ngModelChange)="markSettingsDirty($event)" class="form-control" />
      </div>
    </div>

    <br/>
    <div class="row">
      <div class="col-xs-12">
        <input type="checkbox" id="btnSplit2ndTime"
        [(ngModel)]="xmlSettings?.documentburster?.settings.split2ndtime"
        (ngModelChange)='markSettingsDirty($event)' />
      <label for="btnSplit2ndTime" class="checkboxlabel">
        <strong> {{
          'AREAS.CONFIGURATION.TAB-ADVANCED.SPLIT-2ND-TIME' | translate }}</strong>
      </label>
        </div>
    </div>
    <br/>
    <div class="row">
      <div class="col-xs-4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED.START-DELIMITER-TOKEN-2ND-SPLIT' | translate }}</div>
      <div class="col-xs-8">
        <input id="burstTokenDelimitersStart2nd" [(ngModel)]="
            xmlSettings?.documentburster?.settings.bursttokendelimiters.start2nd
          "
          (ngModelChange)="markSettingsDirty($event)" class="form-control" 
          [disabled]="!xmlSettings?.documentburster?.settings?.split2ndtime"/>
      </div>
    </div>
    <div class="row">
      <div class="col-xs-4">{{
        'AREAS.CONFIGURATION.TAB-ADVANCED.END-DELIMITER-TOKEN-2ND-SPLIT' | translate }}</div>
      <div class="col-xs-8">
        <input id="burstTokenDelimitersEnd2nd" [(ngModel)]="
            xmlSettings?.documentburster?.settings.bursttokendelimiters.end2nd
          "
          (ngModelChange)="markSettingsDirty($event)" class="form-control" 
          [disabled]="!xmlSettings?.documentburster?.settings?.split2ndtime"/>
      </div>
    </div>

    <br />

    <div class="row">
      <div class="col-xs-12">
        <input type="checkbox" id="btnEnableIncubatingFeatures" [(ngModel)]="
            xmlSettings?.documentburster?.settings.enableincubatingfeatures
          "
          (ngModelChange)="markSettingsDirty($event); refreshTabs()" />
        <label for="btnEnableIncubatingFeatures" class="checkboxlabel">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED.ENABLE-INCUBATING-FEATURES' | translate }}</label>
      </div>
    </div>


  </div>
</ng-template>
`;
