import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { NgSelectModule } from '@ng-select/ng-select';

import { ProcessingComponent } from './processing.component';
import { AppRoutingModule } from '../../app-routing.module';

import { LicenseModule } from '../../components/license/license.module';
import { SharedModule } from '../../shared/shared.module';
import { LogFilesViewerSeparateTabsModule } from '../../components/log-files-viewer-separate-tabs/log-files-viewer-separate-tabs.module';

@NgModule({
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  declarations: [ProcessingComponent],
  exports: [ProcessingComponent],
  imports: [
    NgSelectModule,
    AppRoutingModule,
    SharedModule,
    LogFilesViewerSeparateTabsModule,
    LicenseModule,
  ],
})
export class ProcessingModule {}
