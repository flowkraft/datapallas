export const tabUploadFTPTemplate = `<ng-template #tabUploadFTPTemplate>
  <div class="well">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.COMMAND' | translate }}
      </div>
      <div style="grid-column:span 7">
        <input id="ftpCommand" [ngModel]="xmlSettings?.documentburster?.settings?.uploadsettings?.ftpcommand"
          (ngModelChange)="setXmlPath('documentburster.settings.uploadsettings.ftpcommand', $event)" class="input input-bordered" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnFtpVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('ftpCommand',$event)">
        </dburst-button-variables>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.SYNOPSIS' | translate }}
      </div>
      <div style="grid-column:span 7">
        <em>[{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.OPTIONS' | translate
          }}][URL...]</em>
      </div>
    </div>

    <br />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.EXAMPLE' | translate }}
      </div>
      <div style="grid-column:span 7">
        <em [innerHTML]="'--ftp-create-dirs -T \\$\\{extracted_file_path\\} -u user:password
          ftp://ftp.example.com/reports/'"></em>
      </div>
    </div>

    <br />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.HINT' | translate }}
      </div>
      <div style="grid-column:span 7">
        {{ 'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.FULL-CURL-POWER' | translate }} -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
        <span [innerHTML]="'AREAS.CONFIGURATION.TAB-UPLOAD-FTP.INNER-HTML.CURL-INTEGRATION'
        | translate"></span>
      </div>
    </div>
  </div>
</ng-template>
`;
