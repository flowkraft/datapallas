export const tabGeneralSettingsTemplate = `<ng-template #tabGeneralSettingsTemplate>
  <div class="space-y-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.BURST-FILE-NAME' | translate }}</div>
      <div style="grid-column:span 8">
        <input id="burstFileName" class="input"[ngModel]="xmlSettings?.documentburster?.settings?.burstfilename"
          (ngModelChange)="setXmlPath('documentburster.settings.burstfilename', $event)" />
      </div>
      <div style="grid-column:span 2">
        <dburst-button-variables id="btnBurstFileNameVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('burstFileName',$event)">
        </dburst-button-variables>
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.OUTPUT-FOLDER' | translate }}</div>
      <div style="grid-column:span 8">
        <input id="outputFolder" class="input"[ngModel]="xmlSettings?.documentburster?.settings?.outputfolder"
          (ngModelChange)="setXmlPath('documentburster.settings.outputfolder', $event)" />
      </div>

      <div style="grid-column:span 2">
        <dburst-button-variables id="btnOutputFolderVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('outputFolder',$event)">
        </dburst-button-variables>
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.QUARANTINE-FOLDER' | translate }}</div>
      <div style="grid-column:span 8">
        <input id="quarantineFolder" class="input"
          [ngModel]="xmlSettings?.documentburster?.settings?.quarantinefolder"
          (ngModelChange)="setXmlPath('documentburster.settings.quarantinefolder', $event)" />
      </div>

      <div style="grid-column:span 2">
        <dburst-button-variables id="btnQuarantineFolderVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('quarantineFolder',$event)">
        </dburst-button-variables>
      </div>

    </div>
    <br>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 12">
        <a href="https://msdn.microsoft.com/en-us/library/aa365247#naming_conventions">
          {{
          'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.INVALID-CHARS-IN-PATHS' | translate }} <span
            class="badge badge-ghost">\
            / : * ? " &lt; &gt; |</span>
        </a>
      </div>

    </div>

    <br>
    @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <a id="btnEnableDisableDistribution" href="#" [routerLink]="[
            '/configuration',
            'enableDisableDistributionMenuSelected',
            settingsService.currentConfigurationTemplatePath,
            settingsService.currentConfigurationTemplateName
          ]" skipLocationChange="true">
            <button class="btn btn-outline btn-primary" type="button"> {{
              'AREAS.CONFIGURATION.TAB-GENERAL-SETTINGS.NEXT-ENABLE-DISABLE' | translate }}</button>
          </a>
        </div>
      </div>
    }
  </div>
</ng-template>
`;
