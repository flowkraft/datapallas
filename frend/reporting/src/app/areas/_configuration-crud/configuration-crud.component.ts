import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { leftMenuTemplate } from './templates/_left-menu';

@Component({
  selector: 'dburst-configuration-crud',
  template: `
    <aside class="app-sidebar fixed overflow-y-auto z-[810]"
           style="top:calc(50px + var(--cet-offset)); left:0; bottom:30px; width:230px; background-color:var(--app-sidebar-bg); border-right:1px solid var(--app-sidebar-border);">
      ${leftMenuTemplate}
    </aside>
    <div class="relative" style="margin-left:230px; padding-top:calc(50px + var(--cet-offset)); min-height:calc(100vh - 80px - var(--cet-offset));">
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
