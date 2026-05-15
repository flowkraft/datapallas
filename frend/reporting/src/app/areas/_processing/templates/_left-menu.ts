export const leftMenuTemplate = `<!-- Sidebar Menu -->
<ul class="d-menu w-full py-2">
  <li class="d-menu-title">{{
    'AREAS.PROCESSING.LEFT-MENU.ACTIONS' | translate }}</li>

  <li routerLinkActive="d-active">
    <a href="#" [routerLink]="['/processing','burstMenuSelected']" skipLocationChange="true">
      <i class="fa fa-play"></i>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.BURST' | translate }}</span>
    </a>
  </li>
  <li routerLinkActive="d-active">
    <a id="leftMenuMergeBurst" href="#" [routerLink]="['/processing','mergeBurstMenuSelected']" skipLocationChange="true">
      <i class="fa fa-plus-square-o"></i>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.MERGE-BURST' | translate }}</span>
    </a>
  </li>
  <li routerLinkActive="d-active">
    <a id="leftMenuQualityAssurance" href="#" [routerLink]="['/processingQa','qualityMenuSelected']" skipLocationChange="true">
      <i class="fa fa-flag-checkered"></i>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.QUALITY-ASSURANCE' | translate }}</span>
    </a>
  </li>
  <li routerLinkActive="d-active">
    <a href="#" [routerLink]="['/processing','logsMenuSelected']" skipLocationChange="true">
      <i class="fa fa-file-text-o"></i>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.LOGGING-TRACING' | translate }}</span>
    </a>
  </li>
  <li routerLinkActive="d-active">
    <a id="leftMenuSamples" href="#" [routerLink]="['/processing','samplesMenuSelected']" skipLocationChange="true">
      <i class="fa fa-bell-o"></i>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.SAMPLES' | translate }}</span>
    </a>
  </li>
</ul>
`;
