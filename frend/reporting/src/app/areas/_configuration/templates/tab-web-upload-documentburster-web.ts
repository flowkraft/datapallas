export const tabWebUploadDocumentBursterWebTemplate = `<ng-template #tabWebUploadDocumentBursterWebTemplate>
  <div class="well">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 1">
        <a href="https://datapallas.com/docs/document-portal" target="_blank">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>
        </a>
      </div>
      <div style="grid-column:span 11;left:-15px;top:-10px">
        <h5 [innerHTML]="'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-DOCUMENTBURSTER.ACCEPT-FASTER-SAFER' | translate">
        </h5>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-DOCUMENTBURSTER.EXAMPLES' | translate }}</div>
      <div style="grid-column:span 7">
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">
          <span>https://datapallas.com/docs/document-portal/payments</span>
        </a>
        <br>
        <br>
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">1. Web + DocumentBurster = Customer Payment
          Portal</a>
        <br>
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">2. Web + DocumentBurster = Invoices2People</a>
        <br>
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">3. Web + DocumentBurster = Bills2People</a>
        <br>
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">4. Web + DocumentBurster =
          PurchaseOrders2People</a>
        <br>
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">5. Web + DocumentBurster =
          Statements2People</a>
        <br>
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">6. Web + DocumentBurster = Payslips2People</a>
        <br>
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">7. Web + DocumentBurster =
          SchoolReports2People</a>
        <br>
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">8. Web + DocumentBurster = Contracts2People</a>
        <br>
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">9. Web + DocumentBurster =
          AnyDocument2People</a>
      </div>

    </div>
    <br>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 3">
        <a href="https://datapallas.com/docs/document-portal/quickstart" target="_blank">
          <button class="btn btn-primary" type="button">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-DOCUMENTBURSTER.LIVE-DEMO'
            | translate }}</button>
        </a>
      </div>

    </div>

  </div>
</ng-template>
`;
