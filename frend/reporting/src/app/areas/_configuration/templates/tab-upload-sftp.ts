export const tabUploadSFTPTemplate = `<ng-template #tabUploadSFTPTemplate>
  <div class="well">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.COMMAND' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="sftpCommand" [ngModel]="xmlSettings?.documentburster?.settings?.uploadsettings?.sftpcommand"
          (ngModelChange)="setXmlPath('documentburster.settings.uploadsettings.sftpcommand', $event)" class="input input-bordered" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnSftpVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('sftpCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">
        <em>{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.SYNOPSIS' | translate }}</em>
      </div>
      <div style="grid-column:span 7">
        <em>[{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.OPTIONS' | translate }}][URL...]</em>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.EXAMPLE' | translate }}</div>
      <div style="grid-column:span 7">
        <em [innerHTML]="'-T \\$\\{extracted_file_path\\} -u user:password sftp://ftp.example.com/reports/'"></em>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.HINT' | translate }}</div>
      <div style="grid-column:span 7">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.FULL-CURL-POWER' | translate }} -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
        <span [innerHTML]="'AREAS.CONFIGURATION.TAB-UPLOAD-SFTP.INNER-HTML.CURL-INTEGRATION'
        | translate"></span>
      </div>

    </div>

  </div>
</ng-template>
`;
