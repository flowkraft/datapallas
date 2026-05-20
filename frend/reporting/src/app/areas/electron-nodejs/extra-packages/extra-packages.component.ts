import { Component, OnInit } from '@angular/core';

import { extraPackagesTemplate } from './extra-packages.template';

import { DesktopAdminService } from '../desktop-admin.service';
import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { ExecutionStatsService } from '../../../providers/execution-stats.service';
import Utilities from '../../../helpers/utilities';
import { TranslateService } from '@ngx-translate/core';
import UtilitiesElectron from '../utilities-electron';
import { StateStoreService } from '../../../providers/state-store.service';
//import { ElectronService } from '../electron.service';

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
}

@Component({
    selector: 'dburst-extra-packages',
    template: `${extraPackagesTemplate} `,
    standalone: false
})
export class ExtraPackagesComponent implements OnInit {
  protected extraPackages = [
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
      cmdUnInstall: 'choco uninstall docker-desktop',
      cmdGetInfo: 'choco info docker-desktop -lo',
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
      cmdUnInstall: 'choco uninstall vscode',
      cmdGetInfo: 'choco info vscode -lo',
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
      cmdUnInstall: 'choco uninstall winmerge',
      cmdGetInfo: 'choco info winmerge -lo',
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
      cmdUnInstall: 'choco uninstall notepadplusplus',
      cmdGetInfo: 'choco info notepadplusplus -lo',
    }
  ];

  constructor(
    protected translateService: TranslateService,
    protected desktopAdminService: DesktopAdminService,
    //protected electronService: ElectronService,
    protected stateStore: StateStoreService,
    protected executionStatsService: ExecutionStatsService,
    protected confirmService: ConfirmService,
  ) { }

  async ngOnInit() {
    await this.fetchExtraPackagesDetails();
  }

  async fetchExtraPackagesDetails() {
    for (const extraPackage of this.extraPackages) {
      const packageId = extraPackage.id;

      extraPackage.description = await this.translateService.instant(
        `AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.EXTRA-PACKAGES.INNER-HTML.${packageId.toUpperCase()}`,
      );

      //console.log(packageId);

      extraPackage.status = 'not-installed';

      if (packageId !== 'docker-desktop') {
        const chocoInfoCommand = `choco info ${packageId} -lo`;
        //const chocoInfoCommand = `choco --version`;

        try {
          const { stdout, stderr } =
            await UtilitiesElectron.childProcessExec(chocoInfoCommand);

          //console.log(`chocoInfo = ${chocoInfo}`);

          if (stdout && stdout.includes('1 packages installed.')) {
            extraPackage.status = 'installed';
          }
        } catch (error) {
          extraPackage.status = 'not-installed';
        }
      } else {
        extraPackage.status = this.stateStore.configSys.sysInfo.setup.docker.isDockerOk ? 'installed' : 'not-installed';
      }
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

  doInstallUninstallAction(pckage: ExtPackage, action: string) {
    const dialogQuestion = `${Utilities.titleCase(action)} ${pckage.name}?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: () => {
        this.desktopAdminService.typeCommandOnTerminalAndThenPressEnter(
          `choco ${action} ${pckage.id} --yes`,
        );
      },
    });
  }
}
