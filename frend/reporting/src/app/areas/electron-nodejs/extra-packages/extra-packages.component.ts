import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { extraPackagesTemplate } from './extra-packages.template';

import { ExecutionStatsService } from '../../../providers/execution-stats.service';
import { TranslateService } from '@ngx-translate/core';
import UtilitiesElectron from '../utilities-electron';
import { StateStoreService } from '../../../providers/state-store.service';
import { ToastrMessagesService } from '../../../providers/toastr-messages.service';
import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { RbElectronService } from '../electron.service';

interface ExtPackage {
  id: string;
  name: string;
  icon: string;
  website: string;
  description: string;
  status: string;
  packageManager: string;
  dependsOn: string;
  cmdInstall: string;
  cmdUnInstall: string;
  cmdGetInfo: string;
  // True while an elevated install/uninstall is running for this package (drives the spinner).
  busy?: boolean;
}

@Component({
    selector: 'dburst-extra-packages',
    template: `${extraPackagesTemplate} `,
    standalone: true,
    imports: [CommonModule, TranslateModule],
})
export class ExtraPackagesComponent implements OnInit {
  protected extraPackages: ExtPackage[] = [
    {
      id: 'docker-desktop',
      name: 'Docker Desktop',
      icon: 'docker.svg',
      website: 'https://www.docker.com/products/docker-desktop/',
      description: ` a very good containerization software. Docker is required for running (some) DataPallas extra packages.`,
      status: 'not-installed',
      packageManager: 'choco',
      dependsOn: '',
      cmdInstall: 'choco install docker-desktop --yes',
      cmdUnInstall: 'choco uninstall docker-desktop --yes',
      cmdGetInfo: 'choco info docker-desktop',
    },
    {
      id: 'vscode',
      name: 'Visual Studio Code',
      icon: 'vscode-logo.svg',
      website: 'https://code.visualstudio.com',
      description: ` Code editing. Redefined.`,
      status: 'not-installed',
      packageManager: 'choco',
      dependsOn: '',
      cmdInstall: 'choco install vscode --yes',
      cmdUnInstall: 'choco uninstall vscode --yes',
      cmdGetInfo: 'choco info vscode',
    },
    {
      id: 'winmerge',
      name: 'WinMerge',
      icon: 'winmerge.png',
      website: 'https://winmerge.org',
      description: ` is an Open Source differencing and merging tool for Windows. WinMerge can compare both folders and files, presenting differences in a visual text format that is easy to understand and handle. WinMerge can be used for comparing DataPallas configuration files and scripts.`,
      status: 'not-installed',
      packageManager: 'choco',
      dependsOn: '',
      cmdInstall: 'choco install winmerge --yes',
      cmdUnInstall: 'choco uninstall winmerge --yes',
      cmdGetInfo: 'choco info winmerge',
    }
    ,
    {
      id: 'notepadplusplus',
      name: 'Notepad++',
      icon: 'notepad++.svg',
      website: 'https://notepad-plus-plus.org',
      description: ` is a free (as in “free speech” and also as in “free beer”) source code editor and Notepad replacement. Notepad++ is useful when editing DataPallas configuration files and scripts.`,
      status: 'not-installed',
      packageManager: 'choco',
      dependsOn: '',
      cmdInstall: 'choco install notepadplusplus --yes',
      cmdUnInstall: 'choco uninstall notepadplusplus --yes',
      cmdGetInfo: 'choco info notepadplusplus',
    }
    ,
    {
      id: 'maven',
      name: 'Apache Maven',
      icon: 'maven.svg',
      website: 'https://maven.apache.org',
      description: ` is a build automation and dependency management tool for Java projects.`,
      status: 'not-installed',
      packageManager: 'choco',
      dependsOn: '',
      cmdInstall: 'choco install maven --yes',
      cmdUnInstall: 'choco uninstall maven --yes',
      cmdGetInfo: 'choco info maven',
    }
  ];

  constructor(
    protected translateService: TranslateService,
    protected stateStore: StateStoreService,
    protected executionStatsService: ExecutionStatsService,
    protected messagesService: ToastrMessagesService,
    protected confirmService: ConfirmService,
    protected electronService: RbElectronService,
  ) { }

  /** Copy a command to the clipboard and confirm with a toast (same UX as the terminal panel). */
  async copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      this.messagesService.showSuccess(command, 'Copied to clipboard');
    } catch {
      this.messagesService.showError('Could not copy to clipboard');
    }
  }

  /** Run the package's choco install command elevated (same flow as the Install Java button). */
  installPackage(extraPackage: ExtPackage) {
    this.confirmService.askConfirmation({
      message: 'Are you sure that you want to perform this action?',
      confirmAction: () =>
        this.runPackageCommand(extraPackage, extraPackage.cmdInstall, 'installed'),
    });
  }

  /** Run the package's choco uninstall command elevated. */
  unInstallPackage(extraPackage: ExtPackage) {
    this.confirmService.askConfirmation({
      message: 'Are you sure that you want to perform this action?',
      confirmAction: () =>
        this.runPackageCommand(extraPackage, extraPackage.cmdUnInstall, 'not-installed'),
    });
  }

  // Fire an elevated choco command through the EXISTING admin-PowerShell mechanism (same one the
  // Install Java button uses). The elevated process detaches via UAC, so there is no completion
  // callback — we poll choco for the package status until it reaches the expected state or we
  // time out, keeping the per-package spinner up meanwhile.
  private async runPackageCommand(
    extraPackage: ExtPackage,
    command: string,
    expectedStatus: string,
  ) {
    extraPackage.busy = true;
    this.electronService
      .getCommandReadyToBeRunAsAdministratorUsingPowerShell(command, 'choco --version')
      .catch(() => {});
    const deadline = Date.now() + 5 * 60 * 1000;
    try {
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        extraPackage.status = await this.detectStatus(extraPackage);
        if (extraPackage.status === expectedStatus) break;
      }
    } finally {
      extraPackage.busy = false;
    }
  }

  async ngOnInit() {
    await this.fetchExtraPackagesDetails();
  }

  async fetchExtraPackagesDetails() {
    for (const extraPackage of this.extraPackages) {
      extraPackage.description = await this.translateService.instant(
        `AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.INNER-HTML.${extraPackage.id.toUpperCase()}`,
      );

      extraPackage.status = await this.detectStatus(extraPackage);
    }
    // Sort the extraPackages array so that installed packages come first
    this.extraPackages.sort((a, b) => {
      if (a.status === 'installed' && b.status !== 'installed') {
        return -1;
      } else if (a.status !== 'installed' && b.status === 'installed') {
        return 1;
      } else {
        return 0;
      }
    });
  }

  // Returns 'installed' / 'not-installed' for a package. Docker is authoritatively reported by the
  // global sysinfo flag; for everything else (and as a fallback for Docker once choco has it) we
  // ask choco directly so the status reflects reality right after an install/uninstall.
  private async detectStatus(extraPackage: ExtPackage): Promise<string> {
    if (
      extraPackage.id === 'docker-desktop' &&
      this.stateStore.configSys.sysInfo.setup.docker.isDockerOk
    ) {
      return 'installed';
    }
    try {
      const { stdout } = await UtilitiesElectron.childProcessExec(
        `choco info ${extraPackage.id} -lo`,
      );
      if (stdout && stdout.includes('1 packages installed.')) {
        return 'installed';
      }
    } catch {
      // choco errored or the package is absent — treat as not installed.
    }
    return 'not-installed';
  }
}
