import { Component } from '@angular/core';

import { chocolateyTemplate } from './chocolatey.template';
import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { RbElectronService } from '../electron.service';
import { StateStoreService } from '../../../providers/state-store.service';

@Component({
    selector: 'dburst-chocolatey',
    template: ` ${chocolateyTemplate} `,
    standalone: false
})
export class ChocolateyComponent {
  constructor(
    protected electronService: RbElectronService,
    protected stateStore: StateStoreService,
    protected confirmService: ConfirmService,
  ) {}

  installChocolatey() {
    this.confirmService.askConfirmation({
      message: 'Are you sure that you want to perform this action?',
      confirmAction: () => {
        this.electronService.typeCommandOnTerminalAndThenPressEnter(
          'install chocolatey',
        );
      },
    });
  }

  unInstallChocolatey() {
    this.confirmService.askConfirmation({
      message: 'Are you sure that you want to perform this action?',
      confirmAction: () => {
        this.electronService.typeCommandOnTerminalAndThenPressEnter(
          'uninstall chocolatey',
        );
      },
    });
  }
}
