import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { AngularSplitModule } from 'angular-split';

import { AppRoutingModule } from '../../app-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { LicenseModule } from '../../components/license/license.module';
import { ReportsListModule } from '../../components/reports-list/reports-list.module';
import { ConnectionDetailsModule } from '../../components/connection-details/connection-details.module';

import { ConfigurationCrudComponent } from './configuration-crud.component';
import { ConfigurationReportsComponent } from './configuration-reports.component';
import { ConnectionListComponent } from './configuration-connections.component';
import { CubeListComponent } from './configuration-cubes.component';

@NgModule({
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  declarations: [
    ConfigurationCrudComponent,
    ConfigurationReportsComponent,
    ConnectionListComponent,
    CubeListComponent,
  ],
  exports: [ConfigurationCrudComponent],
  imports: [
    // Shared deps
    AppRoutingModule,
    SharedModule,
    LicenseModule,
    // Reports-specific
    ReportsListModule,
    // Connections & Cubes
    ConnectionDetailsModule,
    // Cubes-specific
    AngularSplitModule,
  ],
})
export class ConfigurationCrudModule {}
