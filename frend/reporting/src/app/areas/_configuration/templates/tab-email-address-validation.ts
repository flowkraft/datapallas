export const tabEmailAddressValidationTemplate = `<ng-template #tabEmailAddressValidationTemplate>
  <div class="well" style="height: 600px; overflow-y: scroll;">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <a href="http://www.ietf.org/rfc/rfc2822.txt" target="_blank">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.RFC2822-COMPLIANT' | translate }}</a> {{
            'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.RFC2822-ACHIEVED' | translate }}
      </div>
    </div>
    <br/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input type="checkbox" id="btnAllowQuotedIdentifiers"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailrfc2822validator?.allowquotedidentifiers"
          (ngModelChange)="setXmlPath('documentburster.settings.emailrfc2822validator.allowquotedidentifiers', $event)" />
        <label for="btnAllowQuotedIdentifiers" class="checkboxlabel" style="text-decoration: underline;">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.ALLOW_QUOTED_IDENTIFIERS' | translate }}</label> - <span [innerHTML]="'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.INNER-HTML.ALLOW_QUOTED_IDENTIFIERS' | translate"></span>
      </div>
    </div>
    <br/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input type="checkbox" id="btnAllowParensInLocalPart"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailrfc2822validator?.allowparensinlocalpart"
          (ngModelChange)="setXmlPath('documentburster.settings.emailrfc2822validator.allowparensinlocalpart', $event)" />
        <label for="btnAllowParensInLocalPart" class="checkboxlabel" style="text-decoration: underline;">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.ALLOW_PARENS_IN_LOCALPART' | translate }}</label> - <span [innerHTML]="'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.INNER-HTML.ALLOW_PARENS_IN_LOCALPART' | translate"></span>
      </div>
    </div>
    <br/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input type="checkbox" id="btnAllowDomainLiterals"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailrfc2822validator?.allowdomainliterals"
          (ngModelChange)="setXmlPath('documentburster.settings.emailrfc2822validator.allowdomainliterals', $event)" />
        <label for="btnAllowDomainLiterals" class="checkboxlabel" style="text-decoration: underline;">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.ALLOW_DOMAIN_LITERALS' | translate }}</label> - <span [innerHTML]="'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.INNER-HTML.ALLOW_DOMAIN_LITERALS' | translate"></span>
      </div>
    </div>
    <br/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input type="checkbox" id="btnAllowDotInaText"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailrfc2822validator?.allowdotinatext"
          (ngModelChange)="setXmlPath('documentburster.settings.emailrfc2822validator.allowdotinatext', $event)" />
        <label for="btnAllowDotInaText" class="checkboxlabel" style="text-decoration: underline;">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.ALLOW_DOT_IN_A_TEXT' | translate }}</label> - <span [innerHTML]="'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.INNER-HTML.ALLOW_DOT_IN_A_TEXT' | translate"></span>
       </div>
    </div>
    <br/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <input type="checkbox" id="btnAllowSquareBracketsInaText"
          [ngModel]="xmlSettings?.documentburster?.settings?.emailrfc2822validator?.allowsquarebracketsinatext"
          (ngModelChange)="setXmlPath('documentburster.settings.emailrfc2822validator.allowsquarebracketsinatext', $event)" />
        <label for="btnAllowSquareBracketsInaText" class="checkboxlabel" style="text-decoration: underline;">{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.ALLOW_SQUARE_BRACKETS_IN_A_TEXT' | translate }}</label> - <span [innerHTML]="'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.INNER-HTML.ALLOW_SQUARE_BRACKETS_IN_A_TEXT' | translate"></span>
      </div>
    </div>
    <hr/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <strong>{{
          'AREAS.CONFIGURATION.TAB-ADVANCED-EMAIL-VALIDATION.SKIP_EMAIL_VALIDATION' | translate }}</strong>
      </div>
    </div>
    <br/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <textarea class="textarea textarea-bordered" rows="14" id="txtSkipValidationFor"
        [ngModel]="xmlSettings?.documentburster?.settings?.emailrfc2822validator?.skipvalidationfor"
        (ngModelChange)="setXmlPath('documentburster.settings.emailrfc2822validator.skipvalidationfor', $event)"></textarea>
      </div>
    </div>
  </div>

</ng-template>`;
