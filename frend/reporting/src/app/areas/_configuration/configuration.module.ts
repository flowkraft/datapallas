import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { LicenseModule } from '../../components/license/license.module';

import { AppRoutingModule } from '../../app-routing.module';

import { SharedModule } from '../../shared/shared.module';
import { NgSelectModule } from '@ng-select/ng-select';
import { ConfigurationComponent } from './configuration.component';
import { AngularSplitModule } from 'angular-split';
import { ConnectionDetailsModule } from '../../components/connection-details/connection-details.module';
import { TemplatesGalleryModalModule } from '../../components/templates-gallery-modal/templates-gallery-modal.module';
import { ReportsListModule } from '../../components/reports-list/reports-list.module';

@NgModule({
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  declarations: [ConfigurationComponent],
  exports: [ConfigurationComponent],
  imports: [
    SharedModule,
    TemplatesGalleryModalModule,
    NgSelectModule,
    AppRoutingModule,
    LicenseModule,
    ConnectionDetailsModule,
    AngularSplitModule,
    ReportsListModule,
  ],
})
export class ConfigurationModule {}
