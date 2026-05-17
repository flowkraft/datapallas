export const tabEnableDisableDeliveryTemplate = `<ng-template #tabEnableDisableDeliveryTemplate>
  <div class="well">
    <div class="row">
      <div class="col-xs-12">
        <input
          type="checkbox"
          id="btnSendDocumentsEmail"
          [(ngModel)]="xmlSettings?.documentburster.settings.sendfiles.email"
          (ngModelChange)="markSettingsDirty($event)"
        />
        <label for="btnSendDocumentsEmail" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.SEND-BY-EMAIL' |
          translate }}</label
        >
        <span
          id="btnEmailConfiguration"
          *ngIf="xmlSettings?.documentburster.settings.sendfiles.email"
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
            <button class="btn btn-primary btn-xs" type="button">
              {{
              'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.EMAIL-CONFIGURATION'
              | translate }}
            </button>
          </a>
        </span>
      </div>
    </div>
    <p></p>
    <div class="row">
      <div class="col-xs-12">
        <input
          type="checkbox"
          id="btnSendDocumentsUpload"
          [(ngModel)]="xmlSettings?.documentburster.settings.sendfiles.upload"
          (ngModelChange)="markSettingsDirty($event)"
        />
        <label for="btnSendDocumentsUpload" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.UPLOAD-DOCUMENTS' |
          translate }}</label
        >

        <span
          id="btnUploadConfiguration"
          *ngIf="xmlSettings?.documentburster.settings.sendfiles.upload"
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
            <button class="btn btn-primary btn-xs" type="button">
              {{
              'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.UPLOAD-CONFIGURATION'
              | translate }}
            </button>
          </a>
        </span>
      </div>
    </div>

    <p></p>
    <div class="row">
      <div class="col-xs-12">
        <input
          type="checkbox"
          id="btnSendDocumentsWeb"
          [(ngModel)]="xmlSettings?.documentburster.settings.sendfiles.web"
          (ngModelChange)="markSettingsDirty($event)"
        />
        <label for="btnSendDocumentsWeb" class="checkboxlabel"
          >&nbsp;<span
            [innerHTML]="'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.SEND-TO-WEB' | translate"
          ></span
        ></label>

        <span
          id="btnWebConfiguration"
          *ngIf="xmlSettings?.documentburster.settings.sendfiles.web"
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
            <button class="btn btn-primary btn-xs" type="button">
              {{
              'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.WEB-CONFIGURATION'
              | translate }}
            </button>
          </a>
        </span>
      </div>
    </div>

    <p></p>

    <div class="row">
      <div class="col-xs-12">
        <input
          type="checkbox"
          id="btnSendDocumentsSMS"
          [(ngModel)]="xmlSettings?.documentburster.settings.sendfiles.sms"
          (ngModelChange)="markSettingsDirty($event)"
        />
        <label for="btnSendDocumentsSMS" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.SEND-SMS-MESSAGES' |
          translate }}</label
        >
        <span
          id="btnSMSConfiguration"
          *ngIf="xmlSettings?.documentburster.settings.sendfiles.sms"
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
            <button class="btn btn-primary btn-xs" type="button">
              {{
              'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.SMS-CONFIGURATION'
              | translate }}
            </button>
          </a>
        </span>
      </div>
    </div>

    <hr />

    <div class="row">
      <div class="col-xs-12">
        <input
          type="checkbox"
          id="btnDeleteDocuments"
          [(ngModel)]="xmlSettings?.documentburster.settings.deletefiles"
          (ngModelChange)="markSettingsDirty($event)"
        />
        <label for="btnDeleteDocuments" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-ENABLE-DISABLE-DELIVERY.DELETE-DOCUMENTS-AFTER-DELIVERY'
          | translate }}</label
        >
      </div>
    </div>

    <p></p>

    <div class="row">
      <div class="col-xs-12">
        <input
          type="checkbox"
          id="btnQuarantineDocuments"
          [(ngModel)]="xmlSettings?.documentburster.settings.quarantinefiles"
          (ngModelChange)="markSettingsDirty($event)"
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
