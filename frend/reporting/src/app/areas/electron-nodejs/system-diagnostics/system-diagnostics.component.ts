import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { systemDiagnosticsTemplate } from './system-diagnostics.template';
import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { ConfigurationRepository } from '../../../providers/configuration-repository.service';
import { RbElectronService } from '../electron.service';
import { StateStoreService } from '../../../providers/state-store.service';

@Component({
    selector: 'dburst-system-diagnostics',
    template: ` ${systemDiagnosticsTemplate} `,
    standalone: true,
    imports: [CommonModule, TranslateModule],
})
export class SystemDiagnosticsComponent {
  constructor(
    //protected electronService: ElectronService,
    protected stateStore: StateStoreService,
    protected settingsService: ConfigurationRepository,
    protected confirmService: ConfirmService,
  ) {}

  restartApp() {
    this.confirmService.askConfirmation({
      message: 'Are you sure that you want to perform this action?',
      confirmAction: () => {
        //this.electronService.restartElectronApp();
      },
    });
  }
}
