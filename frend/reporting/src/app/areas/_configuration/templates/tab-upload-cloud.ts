export const tabUploadCloudTemplate = `<ng-template #tabUploadCloudTemplate>
  <div class="well">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.COMMAND' | translate }}
      </div>
      <div style="grid-column:span 7">
        <input
          id="cloudUploadCommand"
          [ngModel]="xmlSettings?.documentburster?.settings?.uploadsettings?.cloudcommand"
          (ngModelChange)="setXmlPath('documentburster.settings.uploadsettings.cloudcommand', $event)"
          class="input input-bordered"
        />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables
          id="btnCloudUploadVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('cloudUploadCommand',$event)"
        >
        </dburst-button-variables>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        <em
          >{{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.SYNOPSIS' | translate }}</em
        >
      </div>
      <div style="grid-column:span 7">
        <em
          >[{{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.OPTIONS' | translate
          }}][URL...]</em
        >
      </div>
    </div>

    <br />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.HINT' | translate }}
      </div>
      <div style="grid-column:span 7">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.FULL_CURL_POWER' | translate }}
        -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <img src="assets/images/remote-backup-services.png" />
      </div>
    </div>
  </div>
</ng-template>
`;
