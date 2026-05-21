import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ChocolateyComponent } from '../chocolatey/chocolatey.component';

import { javaTemplate } from './java.template';

import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { RbElectronService } from '../electron.service';
import { StateStoreService } from '../../../providers/state-store.service';

@Component({
    selector: 'dburst-java',
    template: ` ${javaTemplate} `,
    standalone: true,
    imports: [CommonModule, TranslateModule, ChocolateyComponent],
})
export class JavaComponent {
  constructor(
    protected electronService: RbElectronService,
    protected stateStore: StateStoreService,
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

  //by default DocumentBurster installs Java17
  installJava() {
    this.confirmService.askConfirmation({
      message: 'Are you sure that you want to perform this action?',
      confirmAction: () => {
        //this.electronService.typeCommandOnTerminalAndThenPressEnter(
        //  'choco install jre8 -PackageParameters "/exclude:64" --yes',
        //);
        this.electronService.typeCommandOnTerminalAndThenPressEnter(
          'choco install temurin17 --yes',
        );
      },
    });
  }

  unInstallJava() {
    this.confirmService.askConfirmation({
      message: 'Are you sure that you want to perform this action?',
      confirmAction: () => {
        this.electronService.typeCommandOnTerminalAndThenPressEnter(
          'choco uninstall temurin17 --yes',
        );
      },
    });
  }
}
