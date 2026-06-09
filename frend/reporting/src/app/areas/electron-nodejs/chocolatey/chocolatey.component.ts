import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { chocolateyTemplate } from './chocolatey.template';
import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { RbElectronService } from '../electron.service';
import { StateStoreService } from '../../../providers/state-store.service';
import { InitService } from '../../../providers/init.service';

@Component({
    selector: 'dburst-chocolatey',
    template: ` ${chocolateyTemplate} `,
    standalone: true,
    imports: [CommonModule, TranslateModule],
})
export class ChocolateyComponent {
  installing = false;

  constructor(
    protected electronService: RbElectronService,
    protected stateStore: StateStoreService,
    protected confirmService: ConfirmService,
    protected initService: InitService,
  ) {}

  installChocolatey() {
    this.confirmService.askConfirmation({
      message: 'Are you sure that you want to perform this action?',
      confirmAction: async () => {
        this.installing = true;
        // Fire the elevated install. We don't await it — the batch/UAC elevation can
        // detach the process — and instead poll below for Chocolatey to actually appear.
        this.electronService.installChocolatey().catch(() => {});
        // Poll until Chocolatey is detected (refreshSystemInfo re-reads PATH so detection
        // sees the freshly-installed choco) or we time out. This keeps the spinner up
        // until the install genuinely finishes and updates the UI WITHOUT a restart —
        // works whether the app is already elevated or goes through a UAC prompt.
        const deadline = Date.now() + 3 * 60 * 1000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await this.initService.refreshSystemInfo();
          if (this.stateStore.configSys.sysInfo.setup.chocolatey.isChocoOk) break;
        }
        this.installing = false;
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
