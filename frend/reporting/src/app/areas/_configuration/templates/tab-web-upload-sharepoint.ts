export const tabWebUploadSharePointTemplate = `<ng-template #tabWebUploadSharePointTemplate>
  <div class="well">

    <div class="row">

      <div class="col-xs-1">
        <a href="http://www.sharepoint.com" target="_blank">
          <i class="fa fa-windows fa-2x"></i>
        </a>
      </div>
      <div class="col-xs-11" style="left:-20px;top:-2px">
        <h5
          [innerHTML]="'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-SHAREPOINT.INNER-HTML.USE-DOCUMENTBURSTER-SHAREPOINT' | translate">
        </h5>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2"> {{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-SHAREPOINT.COMMAND' | translate }}</div>
      <div class="col-xs-7">
        <input id="sharePointCommand"
          [(ngModel)]="xmlSettings?.documentburster.settings.webuploadsettings.mssharepointcommand"
          (ngModelChange)='markSettingsDirty($event)' class="form-control" />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables id="btnSharePointVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('sharePointCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-SHAREPOINT.EXAMPLE' | translate }}</div>
      <div class="col-xs-7">
        <em [innerHTML]="'--ntlm -T \\$\\{extracted_file_path\\} -u user:password https://sharepointserver.com/reports/'"></em>
      </div>

    </div>

    <br>

    <div class="row">

      <div class="col-xs-2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-SHAREPOINT.EXAMPLES' | translate }}</div>
      <div class="col-xs-7">
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">https://datapallas.com/docs/document-portal/payments </a>
        <p></p>
        <p></p>
        &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">1. Web + DocumentBurster = Customer
          Payment Portal</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">2. Web + DocumentBurster =
          Invoices2People</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">3. Web + DocumentBurster = Bills2People</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">4. Web + DocumentBurster =
          PurchaseOrders2People</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">5. Web + DocumentBurster =
          Statements2People</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">6. Web + DocumentBurster =
          Payslips2People</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">7. Web + DocumentBurster =
          SchoolReports2People</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">8. Web + DocumentBurster =
          Contracts2People</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">9. Web + DocumentBurster =
          AnyDocument2People</a>
      </div>

    </div>

  </div>
</ng-template>
`;
