export const tabUploadFTPTemplate = `<ng-template #tabUploadFTPTemplate>
  <div class="well">
    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.COMMAND' | translate }}
      </div>
      <div class="col-xs-7">
        <input id="ftpCommand" [(ngModel)]="
            xmlSettings?.documentburster.settings.uploadsettings.ftpcommand
          " (ngModelChange)="markSettingsDirty($event)" class="form-control" />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables id="btnFtpVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('ftpCommand',$event)">
        </dburst-button-variables>
      </div>
    </div>

    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.SYNOPSIS' | translate }}
      </div>
      <div class="col-xs-7">
        <em>[{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.OPTIONS' | translate
          }}][URL...]</em>
      </div>
    </div>

    <br />

    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.EXAMPLE' | translate }}
      </div>
      <div class="col-xs-7">
        <em [innerHTML]="'--ftp-create-dirs -T \\$\\{extracted_file_path\\} -u user:password
          ftp://ftp.example.com/reports/'"></em>
      </div>
    </div>

    <br />

    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.HINT' | translate }}
      </div>
      <div class="col-xs-7">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.FULL-CURL-POWER' | translate }} -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
        <span [innerHTML]="'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.INNER-HTML.CURL-INTEGRATION'
        | translate"></span>
      </div>
    </div>
  </div>
</ng-template>
`;
