export const tabServicesTemplate = `<ng-template #tabServicesTemplate>
  <div class="well">
    <span [innerHTML]="'AREAS.HELP.TAB-SERVICES.INNER-HTML.SKRF-SERVICES' | translate"></span>
    <br>
    <br>
    <ol>
      <li [innerHTML]="'AREAS.HELP.TAB-SERVICES.INNER-HTML.SKRF-SERVICE1' | translate"></li>
      <br>
      <li [innerHTML]="'AREAS.HELP.TAB-SERVICES.INNER-HTML.SKRF-SERVICE2' | translate"></li>
    </ol>
    <br>
    <strong>{{'AREAS.HELP.TAB-SERVICES.SKRF-MANAGED-SERVICES' | translate }}</strong>
    <br>
    <br>
    <ol>
      <li>
        {{'AREAS.HELP.TAB-SERVICES.SKRF-MANAGED-SERVICE1' | translate }}
      </li>
      <br>
      <li>
        {{'AREAS.HELP.TAB-SERVICES.SKRF-MANAGED-SERVICE2' | translate }}
      </li>
      <br>
      <li [innerHTML]="'AREAS.HELP.TAB-SERVICES.INNER-HTML.SKRF-MANAGED-SERVICE3' | translate"></li>
    </ol>
    <br>
    <strong>{{'AREAS.HELP.TAB-SERVICES.REQUEST-QUOTE' | translate }}</strong>
    <br>
    <a href="mailto:sales&#64;datapallas.com" target="_blank">
      <h3 id='checkPointHelpServices'>sales&#64;datapallas.com</h3>
    </a>

  </div>
</ng-template>`;
