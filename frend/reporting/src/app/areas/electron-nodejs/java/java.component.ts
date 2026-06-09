import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ChocolateyComponent } from '../chocolatey/chocolatey.component';

import { javaTemplate } from './java.template';

import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { RbElectronService } from '../electron.service';
import { StateStoreService } from '../../../providers/state-store.service';
import { InitService } from '../../../providers/init.service';

@Component({
    selector: 'dburst-java',
    template: ` ${javaTemplate} `,
    standalone: true,
    imports: [CommonModule, TranslateModule, ChocolateyComponent],
})
export class JavaComponent {
  installing = false;

  constructor(
    protected electronService: RbElectronService,
    protected stateStore: StateStoreService,
    protected confirmService: ConfirmService,
    protected initService: InitService,
    protected router: Router,
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
      confirmAction: async () => {
        this.installing = true;
        // Install Java 17 via the EXISTING Chocolatey (`choco install temurin17`) — a
        // different mechanism than installing Chocolatey itself (which bootstraps). Fire
        // it; don't await — the UAC elevation may detach the process.
        this.electronService
          .getCommandReadyToBeRunAsAdministratorUsingPowerShell(
            'choco install temurin17 --yes',
            'choco --version',
          )
          .catch(() => {});
        // Poll until Java is detected (refreshSystemInfo re-reads PATH/JAVA_HOME). The JDK
        // download is large, so allow a generous timeout.
        const deadline = Date.now() + 6 * 60 * 1000;
        let javaDetected = false;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await this.initService.refreshSystemInfo();
          if (this.stateStore.configSys.sysInfo.setup.java.isJavaOk) {
            javaDetected = true;
            break;
          }
        }
        if (javaDetected) {
          // Java is present now — bring the backend server up (it needs Java), then bring
          // the app to its normal working state IN-PLACE. We deliberately avoid
          // window.location.reload(): re-bootstrapping from a packaged file:// origin is
          // unreliable and was producing a blank screen. Instead we re-run the
          // backend-dependent init and router-navigate to the Processing home so its
          // components re-mount and re-fire their backend calls. In dev the server is owned
          // by the build flow, so backend.start is a no-op and we fall back to the restart prompt.
          const result = await this.electronService.startBackendServer();
          if (result?.started) {
            try {
              await this.initService.reinitializeAfterBackendStarted();
              // Angular no-ops a navigation to the route you're already on, and reuses the
              // component instance when only params change. Bounce through the install route
              // (a DIFFERENT component) first so the final navigation ALWAYS forces
              // ProcessingComponent to be destroyed and re-mounted (re-running its backend loads).
              await this.router.navigateByUrl('/help/installSetupMenuSelected', {
                skipLocationChange: true,
              });
              await this.router.navigate(['/processing', 'burstMenuSelected'], {
                skipLocationChange: true,
              });
            } finally {
              this.installing = false;
            }
            return;
          }
          this.stateStore.configSys.sysInfo.setup.isRestartRequired = true;
        }
        this.installing = false;
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
