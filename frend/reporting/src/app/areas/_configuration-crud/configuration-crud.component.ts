import { Component, inject, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { SHARED_IMPORTS } from '../../shared/shared-imports';
import { ConfigurationReportsComponent } from './configuration-reports.component';
import { ConnectionListComponent } from './configuration-connections.component';
import { CubeListComponent } from './configuration-cubes.component';
import { ActivatedRoute } from '@angular/router';

import { leftMenuTemplate } from './templates/_left-menu';

@Component({
    selector: 'dburst-configuration-crud',
    template: `
    <aside class="app-sidebar fixed overflow-y-auto z-[810]"
           style="top:calc(64px + var(--cet-offset)); left:0; bottom:30px; width:var(--sidebar-w); overflow-x:hidden; transition:width 0.2s ease; background-color:var(--app-sidebar-bg); border-right:1px solid var(--app-sidebar-border);">
      ${leftMenuTemplate}
    </aside>
    <div class="relative" style="margin-left:var(--sidebar-w); transition:margin-left 0.2s ease; padding-left:1rem; padding-right:1rem; min-height: calc(100vh - var(--app-header-h) - var(--app-statusbar-h) - var(--cet-offset) - var(--app-main-pt));">
      <section class="content">
        @switch (activeSection) {
          @case ('reports') {
            <dburst-configuration-reports></dburst-configuration-reports>
          }
          @case ('connections') {
            <dburst-connection-list></dburst-connection-list>
          }
          @case ('cubes') {
            <dburst-cube-list></dburst-cube-list>
          }
        }
      </section>
    </div>
  `,
    standalone: true,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [...SHARED_IMPORTS, ConfigurationReportsComponent, ConnectionListComponent, CubeListComponent],
})
export class ConfigurationCrudComponent implements OnInit {
  activeSection = 'reports';

  private route = inject(ActivatedRoute);

  ngOnInit() {
    this.route.params.subscribe((params) => {
      if (params.section) {
        this.activeSection = params.section;
      } else {
        this.activeSection = 'reports';
      }
    });
  }
}
