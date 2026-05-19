import { NgModule } from '@angular/core';

import { AreasComponent } from './areas.component';

import { SharedModule } from '../shared/shared.module';

import { ProcessingModule } from './_processing/processing.module';
import { AppRoutingModule } from '../app-routing.module';
import { ConfigurationCrudModule } from './_configuration-crud/configuration-crud.module';
import { HelpModule } from './_help/help.module';
import { ConfigurationModule } from './_configuration/configuration.module';
import { StatusBarModule } from './status-bar/status-bar.module';
import { TopMenuHeaderModule } from './top-menu-header/top-menu-header.module';

@NgModule({
  declarations: [AreasComponent],
  exports: [AreasComponent],
  imports: [
    SharedModule,
    TopMenuHeaderModule,
    StatusBarModule,
    ProcessingModule,
    ConfigurationModule,
    ConfigurationCrudModule,
    HelpModule,
  ],
})
export class AreasModule {}
