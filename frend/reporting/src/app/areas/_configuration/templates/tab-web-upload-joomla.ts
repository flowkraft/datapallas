export const tabWebUploadJoomlaTemplate = `<ng-template #tabWebUploadJoomlaTemplate>
  <div class="well">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 1">
        <a href="https://www.joomla.org" target="_blank">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/></svg>
        </a>
      </div>
      <div style="grid-column:span 11;left:-20px;top:-2px">
        <h5 [innerHTML]="'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-JOOMLA.INNER-HTML.USE-DOCUMENTBURSTER-JOOMLA' | translate">
        </h5>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-JOOMLA.COMMAND' | translate }}
      </div>
      <div style="grid-column:span 7">
        <input id="joomlaCommand" [ngModel]="xmlSettings?.documentburster?.settings?.webuploadsettings?.joomlacommand"
          (ngModelChange)="setXmlPath('documentburster.settings.webuploadsettings.joomlacommand', $event)" class="input input-bordered" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnJoomlaVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('joomlaCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-JOOMLA.EXAMPLE' | translate }}</div>
      <div style="grid-column:span 7">
        <em>--user "documentburster:password" -X POST --data "code=1234 &customer=Northridge Pharmaceuticals
          &product=Nebulizer
          Machine&amount=200.00 &date=December 28th, 2015&status=Unpaid"
          https://datapallas.com/wp-json/pods/invoices
        </em>
      </div>

    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-JOOMLA.EXAMPLES' | translate }}</div>
      <div style="grid-column:span 7">
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">https://datapallas.com/docs/document-portal/payments
        </a>
        <p></p>
        <p></p>
        &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">1. Web + DocumentBurster = Customer
          Payment Portal</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">2. Web + DocumentBurster =
          Invoices2People</a>
        <br> &nbsp;&nbsp;
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">3. Web + DocumentBurster =
          Bills2People</a>
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
          AnyDocument2People
        </a>
      </div>

    </div>

  </div>
</ng-template>
`;
