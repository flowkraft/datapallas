export const tabUploadHTTPTemplate = `<ng-template #tabUploadHTTPTemplate>
  <div class="well">

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.COMMAND' | translate }}</div>
      <div class="col-xs-7">
        <input id="httpCommand" [(ngModel)]="xmlSettings?.documentburster.settings.uploadsettings.httpcommand"
          (ngModelChange)='markSettingsDirty($event)' class="form-control" />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables id="btnHttpVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('httpCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <div class="row">

      <div class="col-xs-2">
        <em>{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.SYNOPSIS' | translate }}</em>
      </div>
      <div class="col-xs-7">
        <em>[{{
          'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.OPTIONS' | translate }}][URL...]</em>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.EXAMPLE' | translate }}</div>
      <div class="col-xs-7">
        <em [innerHTML]="'-T \\$\\{extracted_file_path\\} http://www.example.com/'"></em>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.HINT' | translate }}</div>
      <div class="col-xs-7">{{
        'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.FULL-CURL-POWER' | translate }} -
        <a href="http://curl.haxx.se/" target="_blank">http://curl.haxx.se/ </a>
        <span [innerHTML]="'AREAS.CONFIGURATION.TAB-UPLOAD-HTTP.INNER-HTML.CURL-INTEGRATION'
        | translate"></span>
      </div>

    </div>

  </div>
</ng-template>
`;
