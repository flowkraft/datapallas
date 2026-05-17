export const tabGeneralSettingsTemplate = `<ng-template #tabGeneralSettingsTemplate>
  <div class="well">
    <div class="row">
      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.BURST-FILE-NAME' | translate }}</div>
      <div class="col-xs-6">
        <input id="burstFileName" class="form-control" [(ngModel)]="xmlSettings?.documentburster?.settings.burstfilename"
          (ngModelChange)='markSettingsDirty($event)' />
      </div>
      <div class="col-xs-2">
        <dburst-button-variables id="btnBurstFileNameVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('burstFileName',$event)">
        </dburst-button-variables>
      </div>
    </div>
    <p></p>
    <div class="row">
      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.OUTPUT-FOLDER' | translate }}</div>
      <div class="col-xs-6">
        <input id="outputFolder" class="form-control" [(ngModel)]="xmlSettings?.documentburster?.settings.outputfolder"
          (ngModelChange)='markSettingsDirty($event)' />
      </div>

      <div class="col-xs-2">
        <!--
        <dburst-button-native-system-dialog dialogType="folder" (pathsSelected)="onSelectOutputFolderPath($event)">
        </dburst-button-native-system-dialog>
        -->
      </div>

      <div class="col-xs-2">
        <dburst-button-variables id="btnOutputFolderVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('outputFolder',$event)">
        </dburst-button-variables>
      </div>
    </div>
    <p></p>
    <div class="row">
      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.QUARANTINE-FOLDER' | translate }}</div>
      <div class="col-xs-6">
        <input id="quarantineFolder" class="form-control"
          [(ngModel)]="xmlSettings?.documentburster?.settings.quarantinefolder"
          (ngModelChange)='markSettingsDirty($event)' />
      </div>

      <div class="col-xs-2">
        <!--
        <dburst-button-native-system-dialog dialogType="folder" (pathsSelected)="onSelectQuarantineFolderPath($event)">
        </dburst-button-native-system-dialog>
        -->
      </div>

      <div class="col-xs-2">
        <dburst-button-variables id="btnQuarantineFolderVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('quarantineFolder',$event)">
        </dburst-button-variables>
      </div>

    </div>
    <br>
    <div class="row">

      <div class="col-xs-12">
        <a href="https://msdn.microsoft.com/en-us/library/aa365247#naming_conventions">
          {{
          'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.INVALID-CHARS-IN-PATHS' | translate }} <span
            class="label label-default">\
            / : * ? " &lt; &gt; |</span>
        </a>
      </div>

    </div>

    <br>
    <div class="row" *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution">

      <div class="col-xs-12">
        <a id="btnEnableDisableDistribution" href="#" [routerLink]="[
          '/configuration',
          'enableDisableDistributionMenuSelected',
          settingsService.currentConfigurationTemplatePath,
          settingsService.currentConfigurationTemplateName
        ]" skipLocationChange="true">
          <button class="btn btn-primary" type="button"> {{
            'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.NEXT-ENABLE-DISABLE' | translate }}</button>
        </a>
      </div>

    </div>
  </div>
</ng-template>
`;
