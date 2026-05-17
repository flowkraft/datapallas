import { Component } from '@angular/core';

@Component({
  selector: 'rb-brand',
  templateUrl: './brand.component.html',
})
export class BrandComponent {
  get isSidebarCollapsed(): boolean {
    return document.body.classList.contains('sidebar-collapse');
  }

  toggleSidebar(): void {
    document.body.classList.toggle('sidebar-collapse');
  }
}
