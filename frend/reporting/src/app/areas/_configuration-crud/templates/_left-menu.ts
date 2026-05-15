export const leftMenuTemplate = `<!-- Sidebar Menu -->
<ul class="d-menu w-full py-2">
  <li class="d-menu-title">Reports, Connections &amp; Cubes</li>
  <li [class.d-active]="activeSection === 'reports'">
    <a id="btnNavSectionReports" href="#" [routerLink]="['/configuration-crud', 'reports']" skipLocationChange="true">
      <i class="fa fa-files-o"></i> <span>Reports</span>
    </a>
  </li>
  <li [class.d-active]="activeSection === 'connections'">
    <a id="btnNavSectionConnections" href="#" [routerLink]="['/configuration-crud', 'connections']" skipLocationChange="true">
      <i class="fa fa-plug"></i> <span>Connections</span>
    </a>
  </li>
  <li [class.d-active]="activeSection === 'cubes'">
    <a id="btnNavSectionCubes" href="#" [routerLink]="['/configuration-crud', 'cubes']" skipLocationChange="true">
      <i class="fa fa-cube"></i> <span>Cubes / Semantic Layer</span>
    </a>
  </li>
</ul>`;
