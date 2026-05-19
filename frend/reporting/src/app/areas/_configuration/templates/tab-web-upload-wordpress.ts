export const tabWebUploadWordPressTemplate = `<ng-template #tabWebUploadWordPressTemplate>
  <div class="well">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 1">
        <a href="https://wordpress.com/" target="_blank">
          <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-8 h-8 fill-current"><title>WordPress</title><path d="M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.109m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.075 1.125.105l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.720.89 1.643.89 2.977 0 .915-.354 1.994-.996 3.47l-1.31 4.37-4.734-14.073zM12 22.785A10.785 10.785 0 0 1 1.215 12c0-1.71.392-3.327 1.084-4.766l5.94 16.271a10.78 10.78 0 0 1-6.224-6.98A10.78 10.78 0 0 1 12 22.785zm0 0"/></svg>
        </a>
      </div>
      <div style="grid-column:span 11;left:-20px;top:-2px">
        <h5
          [innerHTML]="'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-WORDPRESS.INNER-HTML.USE-DOCUMENTBURSTER-WORDPRESS' | translate">
        </h5>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-WORDPRESS.COMMAND' | translate }}
      </div>
      <div style="grid-column:span 7">
        <input id="wordPressCommand"
          [ngModel]="xmlSettings?.documentburster?.settings?.webuploadsettings?.wordpresscommand"
          (ngModelChange)="setXmlPath('documentburster.settings.webuploadsettings.wordpresscommand', $event)" class="input input-bordered" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnWordPressVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('wordPressCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-WORDPRESS.EXAMPLE' | translate }}</div>
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

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-WORDPRESS.EXAMPLES' | translate }}</div>
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
          AnyDocument2People </a>

      </div>

    </div>

  </div>
</ng-template>
`;
