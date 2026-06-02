export const tabUploadFTPSTemplate = `<ng-template #tabUploadFTPSTemplate>
  <div class="space-y-4">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FTPS.COMMAND' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="ftpsCommand" [ngModel]="xmlSettings?.documentburster?.settings?.uploadsettings?.ftpscommand"
          (ngModelChange)="setXmlPath('documentburster.settings.uploadsettings.ftpscommand', $event)" class="input" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnFtpsVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('ftpsCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FTPS.SYNOPSIS' | translate }}</div>
      <div style="grid-column:span 7">
        <em>[{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-FTPS.OPTIONS' | translate }}][URL...]</em>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FTPS.EXAMPLE' | translate }}</div>
      <div style="grid-column:span 7">
        <em [innerHTML]="'-ssl -T \\$\\{extracted_file_path\\} -u user:password ftp://ftp.example.com/reports/'"></em>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FTPS.HINT' | translate }}</div>
      <div style="grid-column:span 7">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-FTPS.FULL-CURL-POWER' | translate }} -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
        <span [innerHTML]="'AREAS.CONFIGURATION.TAB-UPLOAD-FTPS.INNER-HTML.CURL-INTEGRATION'
        | translate"></span>
      </div>

    </div>

  </div>
</ng-template>
`;
