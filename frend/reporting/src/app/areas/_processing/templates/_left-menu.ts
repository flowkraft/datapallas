export const leftMenuTemplate = `<!-- Sidebar Menu -->
<ul class="menu w-full py-2">
  <li class="menu-title">{{
    'AREAS.PROCESSING.LEFT-MENU.ACTIONS' | translate }}</li>

  <li>
    <a href="#" [routerLink]="['/processing','burstMenuSelected']" skipLocationChange="true" routerLinkActive="menu-active">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.BURST' | translate }}</span>
    </a>
  </li>
  <li>
    <a id="leftMenuMergeBurst" href="#" [routerLink]="['/processing','mergeBurstMenuSelected']" skipLocationChange="true" routerLinkActive="menu-active">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.MERGE-BURST' | translate }}</span>
    </a>
  </li>
  <li>
    <a id="leftMenuQualityAssurance" href="#" [routerLink]="['/processingQa','qualityMenuSelected']" skipLocationChange="true" routerLinkActive="menu-active">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/></svg>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.QUALITY-ASSURANCE' | translate }}</span>
    </a>
  </li>
  <li>
    <a href="#" [routerLink]="['/processing','logsMenuSelected']" skipLocationChange="true" routerLinkActive="menu-active">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.LOGGING-TRACING' | translate }}</span>
    </a>
  </li>
  <li>
    <a id="leftMenuSamples" href="#" [routerLink]="['/processing','samplesMenuSelected']" skipLocationChange="true" routerLinkActive="menu-active">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>
      <span>{{ 'AREAS.PROCESSING.LEFT-MENU.SAMPLES' | translate }}</span>
    </a>
  </li>
</ul>
`;
