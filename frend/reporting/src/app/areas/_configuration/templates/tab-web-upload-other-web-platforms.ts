export const tabWebUploadOtherWebPlatformsTemplate = `<ng-template #tabWebUploadOtherWebPlatformsTemplate>
  <div class="well">

    <div class="row">

      <div class="col-xs-1">
        <a href="https://en.wikipedia.org/wiki/Content_management_system" target="_blank">
          <i class="fa fa-skyatlas fa-2x"></i>
        </a>
      </div>
      <div class="col-xs-11" style="left:-20px;top:-10px">
        <h5 [innerHTML]="'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-OTHER.INNER-HTML.USE-DOCUMENTBURSTER-OTHER' | translate">
        </h5>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-OTHER.COMMAND' | translate }}
      </div>
      <div class="col-xs-7">
        <input id="otherWebPlatformsCommand"
          [(ngModel)]="xmlSettings?.documentburster.settings.webuploadsettings.otherwebcommand"
          (ngModelChange)='markSettingsDirty($event)' class="form-control" />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables id="btnOtherWebPlatformsVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('otherWebPlatformsCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-OTHER.EXAMPLE' | translate }}</div>
      <div class="col-xs-7">
        <em [innerHTML]="'-T \\$\\{extracted_file_path\\} http://www.example.com/'"></em>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-OTHER.EXAMPLES' | translate }}</div>
      <div class="col-xs-7">
        Publish, archive or file reports to web platforms like
        <em>IBM WebSphere Portal</em>,
        <em>Oracle Portal</em>,
        <em>SAP NetWeaver</em>,
        <em>Tibco PortalBuilder</em>,
        <em>Samsung ACUBE Portal</em> or to any of the major open source portal applications such as
        <em>Liferay Portal</em>,
        <em>Hippo portal</em>,
        <em>JBoss Enterprise Portal</em>,
        <em>eXo</em>,
        <em>Apache Portal</em>, etc.
        <br>
        <br> Publish, archive or file reports to document management systems such as
        <em>EMC Documentum</em>,
        <em>OpenText ECM</em>,
        <em>Alfresco</em>, etc.
      </div>

    </div>

  </div>
</ng-template>
`;
