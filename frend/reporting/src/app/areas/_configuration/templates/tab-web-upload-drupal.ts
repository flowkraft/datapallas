export const tabWebUploadDrupalTemplate = `<ng-template #tabWebUploadDrupalTemplate>
  <div class="well">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 1">
        <a href="https://www.drupal.org" target="_blank">
          <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-8 h-8 fill-current"><title>Drupal</title><path d="M15.78 5.113C14.09 3.425 12.48 1.815 12.34 0c0 0-1.157 1.438-1.176 3.847-.013 1.518.66 3.145 1.845 4.315.6.564 1.367 1.113 2.087 1.589-.308-.74-.427-1.543-.316-2.638zM8.204 6.3c.134.143.271.285.406.425.87.905 1.776 1.789 2.498 2.809C9.3 8.388 7.62 7.093 5.855 6.67a7.463 7.463 0 00-2.268-.175 9.987 9.987 0 00-1.28.189C5.317 3.814 8.573 2.031 12 2.031c0 0-.021.193-.029.514-.011.443.007.98.064 1.538.07.678.208 1.408.441 2.023.11.292.24.565.387.817a6.793 6.793 0 01-4.659-.623zM20.064 8.02a9.879 9.879 0 00-5.025-3.097c.267.669.307 1.44.1 2.226-.135.512-.384 1.004-.674 1.436.564.226 1.104.492 1.574.771 1.956 1.169 2.888 2.566 2.888 3.706 0 1.17-.994 2.222-2.583 2.222-1.778 0-2.747-.985-2.747-2.073 0-.835.605-1.494 1.441-1.494.73 0 1.134.4 1.134.87 0 .439-.234.717-.636.717-.352 0-.472-.22-.472-.22s-.082.116-.082.375c0 .556.499.952 1.093.952.864 0 1.526-.658 1.526-1.593 0-1.12-.891-1.92-2.063-1.92-1.48 0-2.614 1.13-2.614 2.806 0 2.074 1.554 3.508 3.802 3.508 2.437 0 4.053-1.601 4.053-3.95 0-1.656-.717-3.085-2.316-4.342zM12 22.014c-2.818 0-5.352-1.072-7.257-2.826l1.04-.463c.796-.343 1.41-.924 1.638-1.83.115-.455.12-.913.124-1.37.007-.806.013-1.48.648-2.059a3.237 3.237 0 012.166-.792c.836 0 1.644.298 2.215.817a2.59 2.59 0 01.84 1.932c0 1.515-1.105 2.57-2.685 2.57-.835 0-1.56-.265-2.044-.746a2.193 2.193 0 01-.641-1.574c0-1.113.817-1.919 1.945-1.919.706 0 1.199.358 1.45.683.197.258.253.507.253.657v.028s-.221-.345-.72-.345c-.483 0-.854.37-.854.872 0 .55.435.958 1.032.958.766 0 1.31-.558 1.31-1.357a1.72 1.72 0 00-.563-1.28 2.432 2.432 0 00-1.638-.604 2.375 2.375 0 00-1.591.577c-.453.406-.605.903-.61 1.578-.004.507-.01 1.084-.165 1.695-.265 1.046-.944 1.754-1.952 2.18l-.608.273A9.963 9.963 0 0012 24c2.064 0 3.983-.627 5.575-1.699l-.347-.23c-1.012-.67-1.977-1.31-2.546-2.458-.374-.754-.453-1.536-.346-2.303l.03.03c.33.28.762.451 1.243.451.944 0 1.647-.664 1.647-1.549 0-.944-.741-1.612-1.799-1.612-.98 0-1.686.612-1.686 1.453 0 .578.254.966.446 1.16l.025.025s-.127-.053-.127-.419c0-.312.229-.56.543-.56.3 0 .54.239.54.56 0 .327-.233.574-.563.574a.567.567 0 01-.41-.166c-.116-.117-.218-.32-.218-.574 0-.709.568-1.209 1.38-1.209.875 0 1.507.588 1.507 1.395 0 .798-.567 1.449-1.55 1.449a2.11 2.11 0 01-1.394-.54 2.16 2.16 0 01-.65-1.43 2.163 2.163 0 01.647-1.739c.435-.436 1.066-.696 1.807-.696 1.493 0 2.637 1.08 2.637 2.58 0 .68-.224 1.336-.677 1.796.454.3.964.614 1.493.942l.414.262A9.99 9.99 0 0022 12C22 6.478 17.522 2 12 2S2 6.478 2 12c0 2.256.75 4.337 2.013 6.013.332-.15.67-.305.989-.462.997-.47 1.62-1.17 1.878-2.083.112-.403.118-.814.124-1.225.01-.724.018-1.395.567-1.909.38-.355.875-.537 1.464-.537.548 0 1.072.192 1.433.527.31.287.532.714.532 1.268 0 .99-.733 1.71-1.734 1.71-.53 0-.978-.17-1.267-.48a1.48 1.48 0 01-.388-.986c0-.744.543-1.28 1.29-1.28.463 0 .783.23.952.44.136.17.168.327.168.393l-.001.021s-.142-.228-.48-.228a.567.567 0 00-.558.588c0 .369.288.647.687.647.515 0 .882-.375.882-.911a1.11 1.11 0 00-.359-.837c-.247-.228-.617-.37-1.063-.37-.99 0-1.71.72-1.71 1.706 0 .648.249 1.2.703 1.6.414.366.992.576 1.624.576 1.31 0 2.178-.87 2.178-2.166a2.324 2.324 0 00-.67-1.668c-.448-.443-1.077-.686-1.806-.686a2.77 2.77 0 00-1.876.699c-.637.59-.875 1.353-.883 2.22-.006.47-.012.96-.147 1.455-.263.972-.912 1.674-1.988 2.172a22.3 22.3 0 01-.756.337A9.963 9.963 0 0112 22.014z"/></svg>
        </a>
      </div>
      <div style="grid-column:span 11;left:-20px;top:-2px">
        <h5 [innerHTML]="'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-DRUPAL.INNER-HTML.USE-DOCUMENTBURSTER-DRUPAL' | translate">
        </h5>
      </div>

    </div>

    <br>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-DRUPAL.COMMAND' | translate }}</div>
      <div style="grid-column:span 7">
        <input id="drupalCommand" [ngModel]="xmlSettings?.documentburster?.settings?.webuploadsettings?.drupalcommand"
          (ngModelChange)="setXmlPath('documentburster.settings.webuploadsettings.drupalcommand', $event)" class="input input-bordered" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnDrupalVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('drupalCommand',$event)">
        </dburst-button-variables>
      </div>

    </div>

    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-DRUPAL.EXAMPLE' | translate }}</div>
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

      <div style="grid-column:span 2">{{'AREAS.CONFIGURATION.TAB-WEB-UPLOAD-DRUPAL.EXAMPLES' | translate }}</div>
      <div style="grid-column:span 7">
        <a href="https://datapallas.com/docs/document-portal/payments" target="_blank">https://datapallas.com/docs/document-portal/payments
        </a>
        <p></p>
        <p></p> &nbsp;&nbsp;
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
