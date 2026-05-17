export const tabEmailTuningTemplate = `<ng-template #tabEmailTuningTemplate>
  <div class="well" style="height: 600px; overflow-y: scroll">
    <div class="row">
      <div class="col-xs-12">
        <input
          type="checkbox"
          id="btnSJMActive"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.active"
          (ngModelChange)="markSettingsDirty($event)"
        />
        <label for="btnSJMActive" class="checkboxlabel">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.SJM-ACTIVE' |
          translate }}
        </label>
      </div>
    </div>

    <hr />

    <div class="row">
      <div class="col-xs-4">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.REPLY-TO-ADDRESS' |
        translate }}
      </div>
      <div class="col-xs-3">
        <input
          id="replyToAddress"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.replytoaddress"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.REPLY-TO-NAME' |
        translate }}
      </div>
      <div class="col-xs-3">
        <input
          id="replyToName"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.replytoname"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
    </div>

    <div class="row">
      <div class="col-xs-4">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.BOUNCE-TO-ADDRESS' |
        translate }}
      </div>
      <div class="col-xs-3">
        <input
          id="bounceToAddress"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.bouncetoaddress"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.BOUNCE-TO-NAME' |
        translate }}
      </div>
      <div class="col-xs-3">
        <input
          id="bounceToName"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.bouncetoname"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
    </div>

    <hr />

    <div class="row">
      <div class="col-xs-4">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.READ-RECEIPT-ADDRESS'
        | translate }}
      </div>
      <div class="col-xs-3">
        <input
          id="receiptToAddress"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.receipttoaddress"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.READ-RECEIPT-NAME' |
        translate }}
      </div>
      <div class="col-xs-3">
        <input
          id="receiptToName"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.receipttoname"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
    </div>

    <div class="row">
      <div class="col-xs-4">
        {{
        'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.DELIVERY-RECEIPT-ADDRESS'
        | translate }}
      </div>
      <div class="col-xs-3">
        <input
          id="dispositionNotificationToAddress"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.dispositionnotificationtoaddress"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.DELIVERY-RECEIPT-NAME'
        | translate }}
      </div>
      <div class="col-xs-3">
        <input
          id="dispositionNotificationToName"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.dispositionnotificationtoname"
          (ngModelChange)="markSettingsDirty($event)"
          class="form-control"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        />
      </div>
    </div>

    <hr />

    <div class="row">
      <div class="col-xs-12">
        {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.CUSTOM-EMAIL-HEADERS'
        | translate }}
      </div>
    </div>

    <div class="row">
      <div class="col-xs-12">
        <textarea
          class="form-control"
          rows="5"
          id="textCustomEmailHeaders"
          placeholder="header1, value1&#x0a;header2, value2"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.customemailheaders"
          (ngModelChange)="markSettingsDirty($event)"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        ></textarea>
      </div>
    </div>

    <hr />
    <div class="row">
      <div class="col-xs-12">
        {{
        'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.CUSTOM-SESSION-PROPERTIES'
        | translate }}
      </div>
    </div>

    <div class="row">
      <div class="col-xs-12">
        <textarea
          class="form-control"
          rows="5"
          id="textCustomSessionProperties"
          placeholder="property1, value1&#x0a;property2, value2"
          [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.customsessionproperties"
          (ngModelChange)="markSettingsDirty($event)"
          [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
        ></textarea>
      </div>
    </div>

    <hr />
      <div class="row">
        <div class="col-xs-12">
          <input
            type="checkbox"
            id="btnJavaxMailDebug"
            [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.javaxmaildebug"
            (ngModelChange)="markSettingsDirty($event)"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
          <label for="btnJavaxMailDebug" class="checkboxlabel">
            {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.DEBUG-EMAIL' |
            translate }}
          </label>
        </div>
      </div>
    
      <div class="row">
        <div class="col-xs-12">
          <input
            type="checkbox"
            id="btnTransportModeLoggingOnly"
            [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.transportmodeloggingonly"
            (ngModelChange)="markSettingsDirty($event)"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
          <label for="btnTransportModeLoggingOnly" class="checkboxlabel"
            >{{
            'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.TRANSPORT-MODE-LOGGING'
            | translate }}
          </label>
        </div>
      </div>

      <div *ngIf="xmlSettings?.documentburster.settings.enableincubatingfeatures">
    
      <hr />

      <div class="row">
        <div class="col-xs-4">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-HOST' |
          translate }}
        </div>
        <div class="col-xs-3">
          <input
            id="proxyHost"
            [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.proxy.host"
            (ngModelChange)="markSettingsDirty($event)"
            class="form-control"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-PORT' |
          translate }}
        </div>
        <div class="col-xs-3">
          <input
            id="proxyPort"
            [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.proxy.port"
            (ngModelChange)="markSettingsDirty($event)"
            class="form-control"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
      </div>
      <div class="row">
        <div class="col-xs-4">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-USER-NAME' |
          translate }}
        </div>
        <div class="col-xs-3">
          <input
            id="proxyUserName"
            [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.proxy.username"
            (ngModelChange)="markSettingsDirty($event)"
            class="form-control"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-PASSWORD' |
          translate }}
        </div>
        <div class="col-xs-3">
          <input
            id="proxyPassword"
            [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.proxy.password"
            (ngModelChange)="markSettingsDirty($event)"
            class="form-control"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
      </div>
      <div class="row">
        <div class="col-xs-4">
          {{ 'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-TUNING.PROXY-BRIDGE-PORT' |
          translate }}
        </div>
        <div class="col-xs-8">
          <input
            id="proxySocks5BridgePort"
            [(ngModel)]="xmlSettings?.documentburster.settings.simplejavamail.proxy.socks5bridgeport"
            (ngModelChange)="markSettingsDirty($event)"
            class="form-control"
            [disabled]="!xmlSettings?.documentburster.settings.simplejavamail.active"
          />
        </div>
      </div>
    </div>
  </div>
</ng-template>
`;
