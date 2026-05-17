export const tabUploadSFTPTemplate = `<ng-template #tabUploadSFTPTemplate>
  <div class="well">

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.COMMAND' | translate }}</div>
      <div class="col-xs-7">
        <input id="sftpCommand" [(ngModel)]="xmlSettings?.documentburster.settings.uploadsettings.sftpcommand"
          (ngModelChange)='markSettingsDirty($event)' class="form-control" />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables id="btnSftpVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('sftpCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <div class="row">

      <div class="col-xs-2">
        <em>{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.SYNOPSIS' | translate }}</em>
      </div>
      <div class="col-xs-7">
        <em>[{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.OPTIONS' | translate }}][URL...]</em>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.EXAMPLE' | translate }}</div>
      <div class="col-xs-7">
        <em [innerHTML]="'-T \\$\\{extracted_file_path\\} -u user:password sftp://ftp.example.com/reports/'"></em>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.HINT' | translate }}</div>
      <div class="col-xs-7">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.FULL-CURL-POWER' | translate }} -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
        <span [innerHTML]="'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.INNER-HTML.CURL-INTEGRATION'
        | translate"></span>
      </div>

    </div>

  </div>
</ng-template>
`;
