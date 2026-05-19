import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared/shared.module';
import { StatusBarComponent } from './status-bar.component';
@NgModule({
  declarations: [StatusBarComponent],
  exports: [StatusBarComponent],
  imports: [SharedModule],
})
export class StatusBarModule {}
