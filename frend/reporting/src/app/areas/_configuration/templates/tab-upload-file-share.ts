export const tabUploadFileShareTemplate = `<ng-template #tabUploadFileShareTemplate>
  <div class="well">

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FILE-SHARE.COMMAND' | translate }}</div>
      <div class="col-xs-7">
        <input id="fileShareCommand" [(ngModel)]="xmlSettings?.documentburster.settings.uploadsettings.filesharecommand"
          (ngModelChange)='markSettingsDirty($event)' class="form-control" />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables id="btnFileShareVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('fileShareCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FILE-SHARE.SYNOPSIS' | translate }}</div>
      <div class="col-xs-7">
        <em>[{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-FILE-SHARE.OPTIONS' | translate }}][URL...]</em>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FILE-SHARE.EXAMPLE' | translate }}</div>
      <div class="col-xs-7">
        <em [innerHTML]="'-T \\$\\{extracted_file_path\\} file://hostname/path/to/the%20folder'"></em>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FILE-SHARE.HINT' | translate }}</div>
      <div class="col-xs-7">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FILE-SHARE.FULL-CURL-POWER' | translate }}Full cURL power is available here -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
        <span [innerHTML]="'AREAS.CONFIGURATION.TAB-UPLOAD-FILE-SHARE.INNER-HTML.USE-CASES'
        | translate"></span>
      </div>

    </div>

  </div>
</ng-template>
`;
