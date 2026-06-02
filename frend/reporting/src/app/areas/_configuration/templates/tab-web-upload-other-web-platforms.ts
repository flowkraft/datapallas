export const tabWebUploadOtherWebPlatformsTemplate = `<ng-template #tabWebUploadOtherWebPlatformsTemplate>
  <div class="space-y-4">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 1">
        <a href="https://en.wikipedia.org/wiki/Content_management_system" target="_blank">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/></svg>
        </a>
      </div>
      <div style="grid-column:span 11;left:-20px;top:-10px">
        <h5 [innerHTML]="'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-OTHER.INNER-HTML.USE-DOCUMENTBURSTER-OTHER' | translate">
        </h5>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-OTHER.COMMAND' | translate }}
      </div>
      <div style="grid-column:span 7">
        <input id="otherWebPlatformsCommand"
          [ngModel]="xmlSettings?.documentburster?.settings?.webuploadsettings?.otherwebcommand"
          (ngModelChange)="setXmlPath('documentburster.settings.webuploadsettings.otherwebcommand', $event)" class="input" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnOtherWebPlatformsVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('otherWebPlatformsCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-OTHER.EXAMPLE' | translate }}</div>
      <div style="grid-column:span 7">
        <em [innerHTML]="'-T \\$\\{extracted_file_path\\} http://www.example.com/'"></em>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-OTHER.EXAMPLES' | translate }}</div>
      <div style="grid-column:span 7">
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
