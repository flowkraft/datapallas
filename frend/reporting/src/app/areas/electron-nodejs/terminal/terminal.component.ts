import {
  Component,
  AfterViewInit,
  ChangeDetectorRef,
  viewChild,
} from '@angular/core';

import { terminalTemplate } from './terminal.template';
import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { RbElectronService } from '../electron.service';
import UtilitiesElectron from '../utilities-electron';
import { DpTerminalComponent } from '../../../components/dp/terminal/dp-terminal.component';

@Component({
    selector: 'dburst-terminal',
    template: ` ${terminalTemplate} `,
    standalone: false
})
export class TerminalComponent implements AfterViewInit {
  readOnly = true;
  availableCommandsVisible = false;

  headerLevel = 'Commands (Read-only)';

  dpTerminal = viewChild<DpTerminalComponent>('dpTerminal');

  constructor(
    protected electronService: RbElectronService,
    protected confirmService: ConfirmService,
    protected changeDetectorRef: ChangeDetectorRef,
  ) {}

  ngAfterViewInit() {
    this.electronService.pTerminalInput = this.dpTerminal()?.inputElement;
    this.changeDetectorRef.detectChanges();
  }

  async onTerminalCommand(command: string) {
    let response: string;
    let jobFilePath: string;
    try {
      if (command.includes('install')) {
        const threeWordsKebab = command.split(' ').slice(0, 3).join('-');
        jobFilePath = await this.electronService.createJobFile(threeWordsKebab);
      }
      switch (command) {
        case 'java -version':
        case 'java --version':
          try {
            const throwError = false;
            response = await this.electronService.checkJavaVersion(throwError);
          } catch (error) {
            response = error;
          }
          this.electronService.typeCommandOnTerminalAndThenPressEnter('choco --version');
          break;

        case 'choco --version':
          try {
            const throwError = false;
            const version = await this.electronService.checkChocoVersion(throwError);
            response = 'Chocolatey ' + version;
          } catch (error) {
            response = error;
          }
          break;

        case 'install chocolatey':
          try {
            await this.electronService.installChocolatey();
          } catch (error) {
            response = error;
          }
          break;

        case 'uninstall chocolatey':
          try {
            const unInstallCommand = `& ${this.electronService.PORTABLE_EXECUTABLE_DIR}/tools/chocolatey/uninstall.ps1`;
            const testCommand = 'choco --version';
            const elevatedScript =
              await this.electronService.getCommandReadyToBeRunAsAdministratorUsingPowerShell(
                unInstallCommand,
                testCommand,
              );
            elevatedScript.stderr.on('data', (data) => {
              response = response + '\n' + data;
            });
            for await (const data of elevatedScript.stdout) {
              response = response + '\n' + data;
            }
          } catch (error) {
            response = error;
          }
          break;

        case 'choco install openjdk --yes':
        case 'choco install temurin --yes':
        case 'choco install temurin17 --yes':
        case 'choco install notepadplusplus --yes':
        case 'choco install winmerge --yes':
        case 'choco uninstall openjdk --yes':
        case 'choco uninstall temurin --yes':
        case 'choco uninstall temurin17 --yes':
        case 'choco uninstall notepadplusplus --yes':
        case 'choco uninstall winmerge --yes':
          try {
            const testCommand = 'choco --version';
            await this.electronService.getCommandReadyToBeRunAsAdministratorUsingPowerShell(
              command,
              testCommand,
            );
          } catch (error) {
            response = error;
          }
          break;

        case '':
          response = '';
          break;

        default:
          response = 'Unknown command: ' + command;
      }
    } finally {
      if (response) {
        response = response.toString();
        await UtilitiesElectron.logAsync(response.replace('undefined', ''), 'info');
        this.dpTerminal()?.addResponse(response);
      }
      if (jobFilePath) await this.electronService.deleteJobFile(jobFilePath);
      this.changeDetectorRef.detectChanges();
    }
  }

  honourReadOnly() {
    return !this.readOnly;
  }

  toggleReadOnly() {
    if (this.readOnly) {
      this.confirmService.askConfirmation({
        message:
          "If you don't understand the commands you can break the system. Are you sure that you want to continue?",
        confirmAction: () => {
          this.electronService.typeCommandOnTerminalAndThenPressEnter('');
          this.readOnly = false;
          this.headerLevel = 'Type Your Commands Here';
        },
      });
    } else {
      this.readOnly = true;
      this.headerLevel = 'Commands (Read-only)';
    }
  }
}
