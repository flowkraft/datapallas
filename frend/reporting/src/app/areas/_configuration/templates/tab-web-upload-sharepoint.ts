export const tabWebUploadSharePointTemplate = `<ng-template #tabWebUploadSharePointTemplate>
  <div class="well">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 1">
        <a href="http://www.sharepoint.com" target="_blank">
          <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-8 h-8 fill-current"><title>Microsoft</title><path d="M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z"/></svg>
        </a>
      </div>
      <div style="grid-column:span 11;left:-20px;top:-2px">
        <h5
          [innerHTML]="'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-SHAREPOINT.INNER-HTML.USE-DOCUMENTBURSTER-SHAREPOINT' | translate">
        </h5>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2"> {{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-SHAREPOINT.COMMAND' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="sharePointCommand"
          [ngModel]="xmlSettings?.documentburster?.settings?.webuploadsettings?.mssharepointcommand"
          (ngModelChange)="setXmlPath('documentburster.settings.webuploadsettings.mssharepointcommand', $event)" class="input input-bordered" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnSharePointVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('sharePointCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-SHAREPOINT.EXAMPLE' | translate }}</div>
      <div style="grid-column:span 7">
        <em [innerHTML]="'--ntlm -T \\$\\{extracted_file_path\\} -u user:password https://sharepointserver.com/reports/'"></em>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-SHAREPOINT.EXAMPLES' | translate }}</div>
      <div style="grid-column:span 7">
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
