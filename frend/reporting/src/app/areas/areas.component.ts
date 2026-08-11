import { Component, inject } from '@angular/core';
import { SHARED_IMPORTS } from '../shared/shared-imports';
import { TopMenuHeaderComponent } from './top-menu-header/top-menu-header.component';
import { StatusBarComponent } from './status-bar/status-bar.component';
import { AuthService } from '../providers/auth.service';

@Component({
    selector: 'dburst-areas',
    templateUrl: './areas.template.html',
    standalone: true,
    imports: [...SHARED_IMPORTS, TopMenuHeaderComponent, StatusBarComponent],
})
export class AreasComponent {
  protected authService = inject(AuthService);
}
