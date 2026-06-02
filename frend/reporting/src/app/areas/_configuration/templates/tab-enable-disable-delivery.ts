export const tabEnableDisableDeliveryTemplate = `<ng-template #tabEnableDisableDeliveryTemplate>
  <div class="space-y-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input
          type="checkbox"
          id="btnSendDocumentsEmail"
          [ngModel]="xmlSettings?.documentburster?.settings?.sendfiles?.email"
          (ngModelChange)="setXmlPath('documentburster.settings.sendfiles.email', $event)"
        />
        <label for="btnSendDocumentsEmail" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.SEND-BY-EMAIL' |
          translate }}</label
        >
        @if (xmlSettings?.documentburster.settings.sendfiles.email) {
        <span
          id="btnEmailConfiguration"
        >
          <a
            href="#"
            [routerLink]="[
            '/configuration',
            'emailSettingsMenuSelected',
            settingsService.currentConfigurationTemplatePath,
            settingsService.currentConfigurationTemplateName
          ]" skipLocationChange="true"
            >&nbsp;
            <button class="btn btn-outline btn-primary btn-xs" type="button">
              {{
              'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.EMAIL-CONFIGURATION'
              | translate }}
            </button>
          </a>
        </span>
        }
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input
          type="checkbox"
          id="btnSendDocumentsUpload"
          [ngModel]="xmlSettings?.documentburster?.settings?.sendfiles?.upload"
          (ngModelChange)="setXmlPath('documentburster.settings.sendfiles.upload', $event)"
        />
        <label for="btnSendDocumentsUpload" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.UPLOAD-DOCUMENTS' |
          translate }}</label
        >

        @if (xmlSettings?.documentburster.settings.sendfiles.upload) {
        <span
          id="btnUploadConfiguration"
        >
          <a
            href="#"
            [routerLink]="[
          '/configuration',
          'ftpSettingsMenuSelected',
          settingsService.currentConfigurationTemplatePath,
          settingsService.currentConfigurationTemplateName
        ]" skipLocationChange="true"
            >&nbsp;
            <button class="btn btn-outline btn-primary btn-xs" type="button">
              {{
              'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.UPLOAD-CONFIGURATION'
              | translate }}
            </button>
          </a>
        </span>
        }
      </div>
    </div>

    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input
          type="checkbox"
          id="btnSendDocumentsWeb"
          [ngModel]="xmlSettings?.documentburster?.settings?.sendfiles?.web"
          (ngModelChange)="setXmlPath('documentburster.settings.sendfiles.web', $event)"
        />
        <label for="btnSendDocumentsWeb" class="checkboxlabel"
          >&nbsp;<span
            [innerHTML]="'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.SEND-TO-WEB' | translate"
          ></span
        ></label>

        @if (xmlSettings?.documentburster.settings.sendfiles.web) {
        <span
          id="btnWebConfiguration"
        >
          <a
            href="#"
            [routerLink]="[
          '/configuration',
          'documentBursterWebSettingsMenuSelected',
          settingsService.currentConfigurationTemplatePath,
          settingsService.currentConfigurationTemplateName
        ]" skipLocationChange="true"
            >&nbsp;
            <button class="btn btn-outline btn-primary btn-xs" type="button">
              {{
              'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.WEB-CONFIGURATION'
              | translate }}
            </button>
          </a>
        </span>
        }
      </div>
    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input
          type="checkbox"
          id="btnSendDocumentsSMS"
          [ngModel]="xmlSettings?.documentburster?.settings?.sendfiles?.sms"
          (ngModelChange)="setXmlPath('documentburster.settings.sendfiles.sms', $event)"
        />
        <label for="btnSendDocumentsSMS" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.SEND-SMS-MESSAGES' |
          translate }}</label
        >
        @if (xmlSettings?.documentburster.settings.sendfiles.sms) {
        <span
          id="btnSMSConfiguration"
        >
          <a
            href="#"
            [routerLink]="[
          '/configuration',
          'smsSettingsMenuSelected',
          settingsService.currentConfigurationTemplatePath,
          settingsService.currentConfigurationTemplateName
        ]" skipLocationChange="true"
            >&nbsp;
            <button class="btn btn-outline btn-primary btn-xs" type="button">
              {{
              'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.SMS-CONFIGURATION'
              | translate }}
            </button>
          </a>
        </span>
        }
      </div>
    </div>

    <hr />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input
          type="checkbox"
          id="btnDeleteDocuments"
          [ngModel]="xmlSettings?.documentburster?.settings?.deletefiles"
          (ngModelChange)="setXmlPath('documentburster.settings.deletefiles', $event)"
        />
        <label for="btnDeleteDocuments" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.DELETE-DOCUMENTS-AFTER-DELIVERY'
          | translate }}</label
        >
      </div>
    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input
          type="checkbox"
          id="btnQuarantineDocuments"
          [ngModel]="xmlSettings?.documentburster?.settings?.quarantinefiles"
          (ngModelChange)="setXmlPath('documentburster.settings.quarantinefiles', $event)"
        />
        <label for="btnQuarantineDocuments" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.QUARANTINE-DOCUMENTS-WHICH-FAIL'
          | translate }}</label
        >
      </div>
    </div>
  </div>
</ng-template>
`;
