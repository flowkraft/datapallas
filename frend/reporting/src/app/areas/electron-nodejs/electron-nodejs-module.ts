import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';

import { DpDrawerComponent } from '../../components/dp/drawer/dp-drawer.component';
import { DpTerminalComponent } from '../../components/dp/terminal/dp-terminal.component';

import { JavaComponent } from './java/java.component';
import { SystemDiagnosticsComponent } from './system-diagnostics/system-diagnostics.component';
import { ExtraPackagesComponent } from './extra-packages/extra-packages.component';
import { TerminalComponent } from './terminal/terminal.component';

import { ChocolateyComponent } from './chocolatey/chocolatey.component';

import { DesktopAdminService } from './desktop-admin.service';
import { RbElectronService } from './electron.service';
import { ButtonNativeSystemDialogComponent } from './button-native-system-dialog/button-native-system-dialog.component';
import { UpdateComponent } from './update/update.component';
import { WhenUpdatingComponent } from './update/when-updating';

@NgModule({
  declarations: [
    JavaComponent,
    ExtraPackagesComponent,
    TerminalComponent,
    SystemDiagnosticsComponent,
    ChocolateyComponent,
    ButtonNativeSystemDialogComponent,
    UpdateComponent,
    WhenUpdatingComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    DpDrawerComponent,
    DpTerminalComponent,
    TranslateModule,
  ],
  exports: [
    UpdateComponent,
    JavaComponent,
    ExtraPackagesComponent,
    TerminalComponent,
    SystemDiagnosticsComponent,
  ],
  providers: [DesktopAdminService, RbElectronService],
})
export class ElectronNodeJsModule {}
