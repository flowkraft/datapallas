export const leftMenuTemplate = `<!-- Sidebar Menu -->
<ul class="sidebar-menu menu w-full py-2">
  <li class="header menu-title">
    {{ 'AREAS.CONFIGURATION.LEFT-MENU.TOP-TITLE' | translate }}
    (<strong>{{ settingsService.currentConfigurationTemplateName }}</strong>)
    @if (settingsService.currentConfigurationTemplate?.type === 'config-jasper-reports') {
      <br />
      <span style="font-size: 0.8em; opacity: 0.85;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3"/></svg> JasperReports
      </span>
    }
  </li>

  <li routerLinkActive="active">
    <a id="leftMenuGeneralSettings" href="#" [routerLink]="[
        '/configuration',
        'generalSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.GENERAL' | translate }}</span>
    </a>
  </li>

  @if (xmlSettings?.documentburster?.settings?.capabilities?.reportgenerationmailmerge && settingsService.currentConfigurationTemplate?.type !== 'config-jasper-reports') {
  <li routerLinkActive="active">
    <a id="leftMenuReportingSettings" href="#" [routerLink]="[
        '/configuration',
        'reportingSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.REPORTING' | translate }}</span>
    </a>
  </li>
  }

  @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
  <li routerLinkActive="active">
    <a id="leftMenuEnableDisableDistribution" href="#" [routerLink]="[
        '/configuration',
        'enableDisableDistributionMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.ENABLE-DISABLE-DELIVERY' | translate }}</span>
    </a>
  </li>
  }

  @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
  <li routerLinkActive="active">
    <a id="leftMenuEmailSettings" href="#" [routerLink]="[
        '/configuration',
        'emailSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.EMAIL' | translate }}</span>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 ml-auto" [style.transform]="openSidebarSection==='email' ? 'rotate(-90deg)' : 'none'" style="margin-top:3px;transition:transform 0.2s;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
    </a>
    @if (openSidebarSection === 'email') {
    <ul>
      <li routerLinkActive="active">
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
    }
  </li>
  }

  @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
  <li routerLinkActive="active">
    <a id="leftMenuUploadSettings" href="#" [routerLink]="[
        '/configuration',
        'uploadSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.UPLOAD' | translate }}</span>
    </a>
  </li>
  }

  @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
  <li routerLinkActive="active">
    <a id="leftMenuDocuments2WebSettings" href="#" [routerLink]="[
        '/configuration',
        'documentBursterWebSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.DOCUMENTS2WEB' | translate }}</span>
    </a>
  </li>
  }

  @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
  <li routerLinkActive="active">
    <a id="leftMenuSMSSettings" href="#" [routerLink]="[
        '/configuration',
        'smsSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.SMS' | translate }}</span>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 ml-auto" [style.transform]="openSidebarSection==='sms' ? 'rotate(-90deg)' : 'none'" style="margin-top:3px;transition:transform 0.2s;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
    </a>
    @if (openSidebarSection === 'sms') {
    <ul>
      <li routerLinkActive="active">
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
    }
  </li>
  }

  @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
  <li routerLinkActive="active">
    <a id="leftMenuQualitySettings" href="#" [routerLink]="[
        '/configuration',
        'qualitySettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.QUALITY-ASSURANCE' | translate }}</span>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 ml-auto" [style.transform]="openSidebarSection==='quality' ? 'rotate(-90deg)' : 'none'" style="margin-top:3px;transition:transform 0.2s;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
    </a>
    @if (openSidebarSection === 'quality') {
    <ul>
      <li routerLinkActive="active">
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
    }
  </li>
  }

  <li routerLinkActive="active">
    <a id="leftMenuAdvancedSettings" href="#" [routerLink]="[
        '/configuration',
        'advancedSettingsMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.ADVANCED' | translate }}</span>
      @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution) {
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 ml-auto" [style.transform]="openSidebarSection==='advanced' ? 'rotate(-90deg)' : 'none'" style="margin-top:3px;transition:transform 0.2s;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
      }
    </a>
    @if (xmlSettings?.documentburster?.settings?.capabilities?.reportdistribution && openSidebarSection === 'advanced') {
    <ul>
      <li routerLinkActive="active">
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
    }
  </li>

  <li style="padding: 0; margin: 0; list-style: none;">
    <hr style="border-color: var(--app-sidebar-active-bg); margin: 8px 10px;" />
  </li>
  <li class="menu-title">{{ 'AREAS.CONFIGURATION.LEFT-MENU.ALL-REPORTS' | translate }}</li>

  <li routerLinkActive="active">
    <a id="leftMenuReports" href="#" [routerLink]="[
        '/configuration',
        'reportsListMenuSelected',
        settingsService.currentConfigurationTemplatePath,
        settingsService.currentConfigurationTemplateName
      ]" skipLocationChange="true" style="font-weight: 600;">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4" style="color: #00c0ef;"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>
      <span>{{ 'AREAS.CONFIGURATION.LEFT-MENU.REPORTS' | translate }}</span>
    </a>
  </li>
</ul>
`;
