export const tabUploadCloudTemplate = `<ng-template #tabUploadCloudTemplate>
  <div class="well">
    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.COMMAND' | translate }}
      </div>
      <div class="col-xs-7">
        <input
          id="cloudUploadCommand"
          [(ngModel)]="xmlSettings?.documentburster.settings.uploadsettings.cloudcommand"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
        />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables
          id="btnCloudUploadVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('cloudUploadCommand',$event)"
        >
        </dburst-button-variables>
      </div>
    </div>

    <div class="row">
      <div class="col-xs-2">
        <em
          >{{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.SYNOPSIS' | translate }}</em
        >
      </div>
      <div class="col-xs-7">
        <em
          >[{{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.OPTIONS' | translate
          }}][URL...]</em
        >
      </div>
    </div>

    <br />

    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.HINT' | translate }}
      </div>
      <div class="col-xs-7">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-CLOUD.FULL_CURL_POWER' | translate }}
        -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
      </div>
    </div>

    <div class="row">
      <div class="col-xs-12">
        <img src="assets/images/remote-backup-services.png" />
      </div>
    </div>
  </div>
</ng-template>
`;
