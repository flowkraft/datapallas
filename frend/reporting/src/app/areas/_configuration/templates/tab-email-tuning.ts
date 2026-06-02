export const tabEmailTuningTemplate = `<ng-template #tabEmailTuningTemplate>
  <div class="overflow-y-auto" style="height: 600px;">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input
          type="checkbox"
          id="btnSJMActive"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.active"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.active', $event)"
        />
        <label for="btnSJMActive" class="checkboxlabel">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.SJM-ACTIVE' |
          translate }}
        </label>
      </div>
    </div>

    <hr />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 4">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.REPLY-TO-ADDRESS' |
        translate }}
      </div>
      <div style="grid-column:span 3">
        <input
          id="replyToAddress"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.replytoaddress"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.replytoaddress', $event)"
          class="input"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.REPLY-TO-NAME' |
        translate }}
      </div>
      <div style="grid-column:span 3">
        <input
          id="replyToName"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.replytoname"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.replytoname', $event)"
          class="input"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 4">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.BOUNCE-TO-ADDRESS' |
        translate }}
      </div>
      <div style="grid-column:span 3">
        <input
          id="bounceToAddress"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.bouncetoaddress"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.bouncetoaddress', $event)"
          class="input"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.BOUNCE-TO-NAME' |
        translate }}
      </div>
      <div style="grid-column:span 3">
        <input
          id="bounceToName"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.bouncetoname"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.bouncetoname', $event)"
          class="input"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
    </div>

    <hr />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 4">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.READ-RECEIPT-ADDRESS'
        | translate }}
      </div>
      <div style="grid-column:span 3">
        <input
          id="receiptToAddress"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.receipttoaddress"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.receipttoaddress', $event)"
          class="input"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.READ-RECEIPT-NAME' |
        translate }}
      </div>
      <div style="grid-column:span 3">
        <input
          id="receiptToName"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.receipttoname"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.receipttoname', $event)"
          class="input"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 4">
        {{
        'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.DELIVERY-RECEIPT-ADDRESS'
        | translate }}
      </div>
      <div style="grid-column:span 3">
        <input
          id="dispositionNotificationToAddress"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.dispositionnotificationtoaddress"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.dispositionnotificationtoaddress', $event)"
          class="input"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.DELIVERY-RECEIPT-NAME'
        | translate }}
      </div>
      <div style="grid-column:span 3">
        <input
          id="dispositionNotificationToName"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.dispositionnotificationtoname"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.dispositionnotificationtoname', $event)"
          class="input"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
    </div>

    <hr />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.CUSTOM-EMAIL-HEADERS'
        | translate }}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <textarea
          class="textarea textarea-bordered"
          rows="5"
          id="textCustomEmailHeaders"
          placeholder="header1, value1&#x0a;header2, value2"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.customemailheaders"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.customemailheaders', $event)"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        ></textarea>
      </div>
    </div>

    <hr />
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        {{
        'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.CUSTOM-SESSION-PROPERTIES'
        | translate }}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <textarea
          class="textarea textarea-bordered"
          rows="5"
          id="textCustomSessionProperties"
          placeholder="property1, value1&#x0a;property2, value2"
          [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.customsessionproperties"
          (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.customsessionproperties', $event)"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        ></textarea>
      </div>
    </div>

    <hr />
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <input
            type="checkbox"
            id="btnJavaxMailDebug"
            [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.javaxmaildebug"
            (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.javaxmaildebug', $event)"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
          <label for="btnJavaxMailDebug" class="checkboxlabel">
            {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.DEBUG-EMAIL' |
            translate }}
          </label>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <input
            type="checkbox"
            id="btnTransportModeLoggingOnly"
            [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.transportmodeloggingonly"
            (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.transportmodeloggingonly', $event)"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
          <label for="btnTransportModeLoggingOnly" class="checkboxlabel"
            >{{
            'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.TRANSPORT-MODE-LOGGING'
            | translate }}
          </label>
        </div>
      </div>

      @if (xmlSettings?.documentburster.settings.enableincubatingfeatures) {
      <div>

      <hr />

      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 4">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-HOST' |
          translate }}
        </div>
        <div style="grid-column:span 3">
          <input
            id="proxyHost"
            [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.proxy?.host"
            (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.proxy.host', $event)"
            class="input"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-PORT' |
          translate }}
        </div>
        <div style="grid-column:span 3">
          <input
            id="proxyPort"
            [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.proxy?.port"
            (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.proxy.port', $event)"
            class="input"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 4">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-USER-NAME' |
          translate }}
        </div>
        <div style="grid-column:span 3">
          <input
            id="proxyUserName"
            [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.proxy?.username"
            (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.proxy.username', $event)"
            class="input"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-PASSWORD' |
          translate }}
        </div>
        <div style="grid-column:span 3">
          <input
            id="proxyPassword"
            [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.proxy?.password"
            (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.proxy.password', $event)"
            class="input"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 4">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-BRIDGE-PORT' |
          translate }}
        </div>
        <div style="grid-column:span 8">
          <input
            id="proxySocks5BridgePort"
            [ngModel]="xmlSettings?.documentburster?.settings?.simplejavamail?.proxy?.socks5bridgeport"
            (ngModelChange)="setXmlPath('documentburster.settings.simplejavamail.proxy.socks5bridgeport', $event)"
            class="input"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
      </div>
    </div>
    }
  </div>
</ng-template>
`;
