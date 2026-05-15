export const leftMenuTemplate = `<!-- Sidebar Menu -->
<ul class="d-menu w-full py-2">
  <li class="d-menu-title">
    {{ 'AREAS.CONFIGURATION.LEFT-MENU.TOP-TITLE' | translate }}
    (<strong>{{ settingsService.currentConfigurationTemplateName }}</strong>)
    <br *ngIf="settingsService.currentConfigurationTemplate?.type === 'config-jasper-reports'" />
    <span *ngIf="settingsService.currentConfigurationTemplate?.type === 'config-jasper-reports'"
          style="font-size: 0.8em; opacity: 0.85;">
      <i class="fa fa-diamond"></i> JasperReports
    </span>
  </li>

  <li routerLinkActive="d-active">
    <a id="leftMenuGeneralSettings" href="#" [routerLink]="[
        '/configuration',
        'generalSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <i class="fa fa-pencil-square-o"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.GENERAL' | translate }}</span>
    </a>
  </li>

  <li *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportgenerationmailmerge && settingsService.currentConfigurationTemplate?.type !== 'config-jasper-reports'" routerLinkActive="d-active">
    <a id="leftMenuReportingSettings" href="#" [routerLink]="[
        '/configuration',
        'reportingSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <i class="fa fa-file-text-o"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.REPORTING' | translate }}</span>
    </a>
  </li>

  <li *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution" routerLinkActive="d-active">
    <a id="leftMenuEnableDisableDistribution" href="#" [routerLink]="[
        '/configuration',
        'enableDisableDistributionMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <i class="fa fa-check-square-o"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.ENABLE-DISABLE-DELIVERY' | translate }}</span>
    </a>
  </li>

  <li *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution" routerLinkActive="d-active">
    <a id="leftMenuEmailSettings" href="#" [routerLink]="[
        '/configuration',
        'emailSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <i class="fa fa-envelope-o"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.EMAIL' | translate }}</span>
    </a>
    <ul>
      <li routerLinkActive="d-active">
        <a href="#" [routerLink]="[
            '/configuration',
            'cloudEmailProvidersMenuSelected',
            settingsService.currentConfigurationTemplatePath,
            settingsService.currentConfigurationTemplateName
          ]" skipLocationChange="true">
          <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.CLOUD-EMAIL-PROVIDERS' | translate }}</span>
        </a>
      </li>
    </ul>
  </li>

  <li *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution" routerLinkActive="d-active">
    <a id="leftMenuUploadSettings" href="#" [routerLink]="[
        '/configuration',
        'uploadSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <i class="fa fa-upload"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.UPLOAD' | translate }}</span>
    </a>
  </li>

  <li *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution" routerLinkActive="d-active">
    <a id="leftMenuDocuments2WebSettings" href="#" [routerLink]="[
        '/configuration',
        'documentBursterWebSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <i class="fa fa-credit-card"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.DOCUMENTS2WEB' | translate }}</span>
    </a>
  </li>

  <li *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution" routerLinkActive="d-active">
    <a id="leftMenuSMSSettings" href="#" [routerLink]="[
        '/configuration',
        'smsSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <i class="fa fa-commenting-o"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.SMS' | translate }}</span>
    </a>
    <ul>
      <li routerLinkActive="d-active">
        <a id="leftMenuTwilioSettings" href="#" [routerLink]="[
            '/configuration',
            'smsSettingsMenuSelected',
            settingsService.currentConfigurationTemplatePath,
            settingsService.currentConfigurationTemplateName
          ]" skipLocationChange="true">
          <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.TWILIO' | translate }}</span>
        </a>
      </li>
    </ul>
  </li>

  <li *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution" routerLinkActive="d-active">
    <a id="leftMenuQualitySettings" href="#" [routerLink]="[
        '/configuration',
        'qualitySettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <i class="fa fa-flag-checkered"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.QUALITY-ASSURANCE' | translate }}</span>
    </a>
    <ul>
      <li routerLinkActive="d-active">
        <a id="leftMenuTestEmailServerSettings" [routerLink]="[
            '/configuration',
            'qualitySettingsMenuSelected',
            settingsService.currentConfigurationTemplatePath,
            settingsService.currentConfigurationTemplateName
          ]" skipLocationChange="true">
          <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.TEST-EMAIL-SERVER' | translate }}</span>
        </a>
      </li>
    </ul>
  </li>

  <li routerLinkActive="d-active">
    <a id="leftMenuAdvancedSettings" href="#" [routerLink]="[
        '/configuration',
        'advancedSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <i class="fa fa-sliders"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.ADVANCED' | translate }}</span>
    </a>
    <ul *ngIf="xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution">
      <li routerLinkActive="d-active">
        <a id="leftMenuErrorHandlingSettings" href="#" [routerLink]="[
            '/configuration',
            'errorHandlingSettingsMenuSelected',
            settingsService.currentConfigurationTemplatePath,
            settingsService.currentConfigurationTemplateName
          ]" skipLocationChange="true">
          <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.ERROR-HANDLING' | translate }}</span>
        </a>
      </li>
    </ul>
  </li>

  <li style="padding: 0; margin: 0; list-style: none;">
    <hr style="border-color: var(--app-sidebar-active-bg); margin: 8px 10px;" />
  </li>
  <li class="d-menu-title">{{ 'AREAS.CONFIGURATION.LEFT-MENU.ALL-REPORTS' | translate }}</li>

  <li routerLinkActive="d-active">
    <a id="leftMenuReports" href="#" [routerLink]="[
        '/configuration',
        'reportsListMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true" style="font-weight: 600;">
      <i class="fa fa-list-ul" style="color: #00c0ef;"></i>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.REPORTS' | translate }}</span>
    </a>
  </li>
</ul>
`;
