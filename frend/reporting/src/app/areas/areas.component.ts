import { Component } from '@angular/core';
import { SHARED_IMPORTS } from '../shared/shared-imports';
import { TopMenuHeaderComponent } from './top-menu-header/top-menu-header.component';
import { StatusBarComponent } from './status-bar/status-bar.component';

@Component({
    selector: 'dburst-areas',
    templateUrl: './areas.template.html',
    standalone: true,
    imports: [...SHARED_IMPORTS, TopMenuHeaderComponent, StatusBarComponent],
})
export class AreasComponent {}
