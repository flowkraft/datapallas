import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared/shared.module';

import { ReportsListComponent } from './reports-list.component';

@NgModule({
  declarations: [ReportsListComponent],
  exports: [ReportsListComponent],
  imports: [SharedModule],
})
export class ReportsListModule {}
