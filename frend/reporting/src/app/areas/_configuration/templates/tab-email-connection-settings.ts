export const tabEmailConnectionSettingsTemplate = `<ng-template
  #tabEmailConnectionSettingsTemplate
>
  <div class="bg-base-200 rounded-box p-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.CONNECTION' |
        translate }}
      </div>
      <div style="grid-column:span 7">
        <input
          type="checkbox"
          id="btnUseExistingEmailConnection"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailserver?.useconn"
          (change)="onUseExistingEmailConnectionClick($event)"
          (ngModelChange)="setXmlPath('documentburster.settings.emailserver.useconn', $event)"
        />
        <label for="btnUseExistingEmailConnection" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.USE-EXISTING-CONNECTION'
          | translate }}</label
        >
        @if (xmlSettings?.documentburster.settings.emailserver.useconn) {
          <div class="dropdown dropdown-end">
            <button
              type="button"
              id="btnSelectedEmailConnection"
              tabindex="0"
              role="button"
              class="btn btn-sm"
              [ngClass]="xmlSettings?.documentburster.settings.emailserver.useconn ? 'btn-primary' : 'btn-ghost'"
            >
              {{selectedEmailConnectionFile?.connectionName}}
              @if (selectedEmailConnectionFile?.defaultConnection) {
                <span
                  id="selectedEmailConnectionDefault"
                  >(default)</span
                >
              }
              &#9660;
            </button>
            <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-[1050] min-w-max p-2">
              @for (connectionFile of settingsService.getEmailConnectionFiles(); track $index) {
                <li>
                  <a
                    id="{{connectionFile.connectionCode}}"
                    href="javascript:;"
                    (click)="onUsedExistingEmailConnectionChanged(connectionFile.connectionCode,connectionFile.connectionName)"
                    >{{connectionFile.connectionName}}
                    @if (connectionFile.defaultConnection) {
                      <span
                        >(default)</span
                      >
                    }</a
                  >
                </li>
              }
              <li><hr class="my-1 border-base-300"/></li>
              <li>
                <a
                  id="manageEmailConnections"
                  href="#"
                  [routerLink]="['/configuration-crud/connections']"
                  [queryParams]="{
                    goBackLocation: 'emailSettingsMenuSelected',
                    configurationFilePath: settingsService.currentConfigurationTemplatePath,
                    configurationFileName: settingsService.currentConfigurationTemplateName
                  }"
                  skipLocationChange="true"
                  >{{
                  'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.MANAGE-EMAIL-CONNECTIONS'
                  | translate }}</a
                >
              </li>
            </ul>
          </div>
        }
      </div>
    </div>
    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.FROM-NAME' |
        translate }}
      </div>
      <div style="grid-column:span 7">
        <input
          id="fromName"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailserver?.name"
          (ngModelChange)="setXmlPath('documentburster.settings.emailserver.name', $event)"
          class="input input-bordered"
          [disabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables
          id="btnFromNameVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('fromName',$event)"
          [shouldBeDisabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        >
        </dburst-button-variables>
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.FROM-ADDRESS' |
        translate }}
      </div>
      <div style="grid-column:span 7">
        <input
          id="fromEmailAddress"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailserver?.fromaddress"
          (ngModelChange)="setXmlPath('documentburster.settings.emailserver.fromaddress', $event)"
          class="input input-bordered"
          [disabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables
          id="btnFromEmailAddressVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('fromEmailAddress',$event)"
          [shouldBeDisabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        >
        </dburst-button-variables>
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.HOST' | translate
        }}
      </div>
      <div style="grid-column:span 7">
        <input
          id="emailServerHost"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailserver?.host"
          (ngModelChange)="setXmlPath('documentburster.settings.emailserver.host', $event)"
          class="input input-bordered"
          [disabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables
          id="btnEmailServerHostVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('emailServerHost',$event)"
          [shouldBeDisabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        >
        </dburst-button-variables>
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.USER-NAME' |
        translate }}
      </div>
      <div style="grid-column:span 7">
        <input
          id="userName"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailserver?.userid"
          (ngModelChange)="setXmlPath('documentburster.settings.emailserver.userid', $event)"
          class="input input-bordered"
          [disabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables
          id="btnUserNameVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('userName',$event)"
          [shouldBeDisabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        >
        </dburst-button-variables>
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.PASSWORD' |
        translate }}
      </div>
      <div style="grid-column:span 7">
        <div class="join">
          <input
            id="smtpPassword"
            [ngModel]="xmlSettings?.documentburster?.settings?.emailserver?.userpassword"
            (ngModelChange)="setXmlPath('documentburster.settings.emailserver.userpassword', $event)"
            [type]="showSmtpPassword ? 'text' : 'password'"
            class="input input-bordered join-item"
            [disabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
          />
          <span id="btnToggleSmtpPassword" class="join-item" style="cursor:pointer" (click)="toggleRevealSmtpPassword()">
            @if (showSmtpPassword) {<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>} @else {<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
          </span>
        </div>
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables
          id="btnSmtpPasswordVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('smtpPassword',$event)"
          [shouldBeDisabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        >
        </dburst-button-variables>
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.PORT' | translate
        }}
      </div>
      <div style="grid-column:span 7">
        <input
          id="smtpPort"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailserver?.port"
          (ngModelChange)="setXmlPath('documentburster.settings.emailserver.port', $event)"
          class="input input-bordered"
          [disabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables
          id="btnSmtpPortVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('smtpPort',$event)"
          [shouldBeDisabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        >
        </dburst-button-variables>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2"></div>

      <div style="grid-column:span 3">
        <input
          type="checkbox"
          id="btnSSL"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailserver?.usessl"
          (ngModelChange)="setXmlPath('documentburster.settings.emailserver.usessl', $event)"
          [disabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        />
        <label for="btnSSL" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.SSL-ENABLED' |
          translate }}</label
        >
      </div>

      <div style="grid-column:span 3">
        <input
          type="checkbox"
          id="btnTLS"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailserver?.usetls"
          (ngModelChange)="setXmlPath('documentburster.settings.emailserver.usetls', $event)"
          [disabled]="xmlSettings?.documentburster.settings.emailserver.useconn"
        />
        <label for="btnTLS" class="checkboxlabel"
          >&nbsp;{{
          'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.TLS-ENABLED' |
          translate }}</label
        >
      </div>
    </div>

    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.TEST-CONNECTION' |
        translate }}
      </div>

      <div style="grid-column:span 7">
        <button
          id="btnSendTestEmail"
          type="button"
          class="btn btn-primary w-full"
          (click)="doTestSMTPConnection()"
          [disabled]="isTestingEmailConnection"
        >
          @if (isTestingEmailConnection) {<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 animate-spin"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>} @else {<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.99972 12L3.2688 3.12451C9.88393 5.04617 16.0276 8.07601 21.4855 11.9997C16.0276 15.9235 9.884 18.9535 3.26889 20.8752L5.99972 12ZM5.99972 12L13.5 12"/></svg>}&nbsp;&nbsp;{{
          'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.SEND-TEST-EMAIL' |
          translate }}
        </button>
      </div>

      <div style="grid-column:span 3">
        <dburst-button-clear-logs></dburst-button-clear-logs>
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        <a href="https://products.office.com/en-us/exchange " target="_blank ">
          <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-8 h-8 fill-current" style="color:orange"><title>Microsoft Exchange</title><path d="M9.605 3.15c-2.983.55-5.355 2.82-6.052 5.775a8.48 8.48 0 000 3.66c.697 2.955 3.069 5.225 6.052 5.775l.36.068V3.082zm4.79 0v15.428l.36-.068c2.982-.55 5.354-2.82 6.05-5.775a8.48 8.48 0 000-3.66c-.696-2.955-3.068-5.225-6.05-5.775zm-2.395.218c.406 0 .804.03 1.195.086V20.55a8.455 8.455 0 01-2.39 0V3.454c.391-.056.79-.086 1.195-.086z"/></svg>
          <br />Microsoft Exchange
        </a>
      </div>

      <div style="grid-column:span 7">
        <span
          [innerHTML]="
        'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.INNER-HTML.DB-ALL-CLOUD-PROVIDERS' | translate"
        ></span>
        <br />
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
          <div>
            <a href="https://www.office.com" target="_blank ">
              <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-6 h-6 fill-current" style="color:red"><title>Microsoft 365</title><path d="M21.19 5.26H12L10.34 8.9l1.66 3.64H8.81L7.15 8.9l1.66-3.64H0v13.48h21.19z"/></svg>
              <p style="margin-top:2px ">Office 365</p>
            </a>
          </div>
          <div>
            <a href="https://gsuite.google.com " target="_blank ">
              <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-8 h-8 fill-current" style="color:gray"><title>Google</title><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
              <p style="margin-top:3px ">Google Apps</p>
            </a>
          </div>
          <div>
            <a href="https://aws.amazon.com/ses/ " target="_blank ">
              <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-8 h-8 fill-current" style="color:gold"><title>Amazon</title><path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.09.48-.256.19-.54.358-.842.524a22.282 22.282 0 01-9.235 2.132c-3.629 0-7.018-.769-10.1-2.285-.298-.15-.588-.3-.876-.456-.186-.1-.218-.244-.132-.404zm-.87-2.798c.064-.063.203-.082.384-.016.7.362 1.44.682 2.22.96C4.1 17.31 6.38 17.81 8.697 17.81c4.084 0 8.187-.76 12.306-2.28l.272-.1c.14-.05.24-.082.31-.1.17-.046.308-.006.414.12.103.118.112.256.02.412-.115.17-.285.34-.51.51-2.97 2.16-6.19 3.24-9.655 3.24a20.1 20.1 0 01-8.665-1.898c-.22-.095-.425-.19-.617-.286-.145-.075-.19-.19-.12-.33z"/></svg>
              <p style="margin-top:2px ">Amazon AWS</p>
            </a>
          </div>
        </div>
        @if (!xmlSettings?.documentburster.settings.emailserver.useconn) {
          <dburst-button-well-known-email-providers
            (sendSelectedProvider)="updateSMTPFormControlsWithSelectedProviderSettings($event)"
          >
          </dburst-button-well-known-email-providers>
        }
      </div>
    </div>
  </div>
</ng-template> `;
