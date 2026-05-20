export const tabComparisonTemplate = `<ng-template #tabComparisonTemplate>
  <div class="space-y-4">

    <strong>
      <a href="https://www.pdfburst.com/features.html" target="_blank">
        <em>DataPallas</em> {{
        'AREAS.HELP.TAB-COMPARISON.FEATURES' | translate }}</a>
    </strong>

    <br>
    <br>

    <ol [innerHTML]="'AREAS.HELP.TAB-COMPARISON.INNER-HTML.DB-FEATURES' | translate">

    </ol>

    <br>

    <strong>
      <a id='checkPointHelpComparison' href="https://www.pdfburst.com/features.html" target="_blank">
        <em>DocumentBurster Server</em> {{
        'AREAS.HELP.TAB-COMPARISON.FEATURES' | translate }}</a>
    </strong>

    <br>
    <br>
    <div innerHTML="'AREAS.HELP.TAB-COMPARISON.INNER-HTML.DB-SERVER-FEATURES1' | translate"></div>

    <br>
    <br>

    <ol [innerHTML]="'AREAS.HELP.TAB-COMPARISON.INNER-HTML.DB-SERVER-FEATURES2' | translate">

    </ol>
    <br>
    <a href="https://www.pdfburst.com/features.html" target="_blank">
      <button class="btn btn-primary" type="button">{{
        'AREAS.HELP.TAB-COMPARISON.VIEW-ALL-FEATURES' | translate }}</button>
    </a>

  </div>
</ng-template>
`;
