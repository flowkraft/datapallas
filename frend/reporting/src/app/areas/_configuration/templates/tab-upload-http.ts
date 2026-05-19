export const tabUploadHTTPTemplate = `<ng-template #tabUploadHTTPTemplate>
  <div class="well">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.COMMAND' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="httpCommand" [ngModel]="xmlSettings?.documentburster?.settings?.uploadsettings?.httpcommand"
          (ngModelChange)="setXmlPath('documentburster.settings.uploadsettings.httpcommand', $event)" class="input input-bordered" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnHttpVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('httpCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">
        <em>{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.SYNOPSIS' | translate }}</em>
      </div>
      <div style="grid-column:span 7">
        <em>[{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.OPTIONS' | translate }}][URL...]</em>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.EXAMPLE' | translate }}</div>
      <div style="grid-column:span 7">
        <em [innerHTML]="'-T \\$\\{extracted_file_path\\} http://www.example.com/'"></em>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.HINT' | translate }}</div>
      <div style="grid-column:span 7">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.FULL-CURL-POWER' | translate }} -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
        <span [innerHTML]="'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.INNER-HTML.CURL-INTEGRATION'
        | translate"></span>
      </div>

    </div>

  </div>
</ng-template>
`;
