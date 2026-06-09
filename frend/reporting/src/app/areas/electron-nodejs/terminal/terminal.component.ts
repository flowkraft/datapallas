import {
  Component,
  AfterViewInit,
  ChangeDetectorRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { terminalTemplate } from './terminal.template';
import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { ToastrMessagesService } from '../../../providers/toastr-messages.service';
import { RbElectronService } from '../electron.service';
import UtilitiesElectron from '../utilities-electron';
import { DpTerminalComponent } from '../../../components/dp/terminal/dp-terminal.component';
import { DpDrawerComponent } from '../../../components/dp/drawer/dp-drawer.component';

@Component({
    selector: 'dburst-terminal',
    template: ` ${terminalTemplate} `,
    standalone: true,
    imports: [CommonModule, TranslateModule, DpDrawerComponent, DpTerminalComponent],
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
    protected messagesService: ToastrMessagesService,
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

        case 'mvn -version':
        case 'mvn --version':
          try {
            const { stdout } = await UtilitiesElectron.childProcessExec(
              'mvn --version',
            );
            response = stdout;
          } catch (error) {
            response = error;
          }
          break;

        case 'choco info docker-desktop':
        case 'choco info vscode':
        case 'choco info winmerge':
        case 'choco info notepadplusplus':
        case 'choco info maven':
          try {
            const { stdout } = await UtilitiesElectron.childProcessExec(command);
            response = stdout;
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
            // The uninstall runs in a separate elevated PowerShell window
            // (Start-Process -Wait -Verb RunAs); spawn resolves once that window
            // exits, so awaiting is the completion signal. Its output stays in the
            // elevated window and is not streamed back here.
            await this.electronService.getCommandReadyToBeRunAsAdministratorUsingPowerShell(
              unInstallCommand,
              testCommand,
            );
            response = 'Chocolatey uninstall finished.';
          } catch (error) {
            response = error;
          }
          break;

        case 'choco install openjdk --yes':
        case 'choco install temurin --yes':
        case 'choco install temurin17 --yes':
        case 'choco install maven --yes':
        case 'choco install notepadplusplus --yes':
        case 'choco install winmerge --yes':
        case 'choco install docker-desktop --yes':
        case 'choco install vscode --yes':
        case 'choco uninstall openjdk --yes':
        case 'choco uninstall temurin --yes':
        case 'choco uninstall temurin17 --yes':
        case 'choco uninstall maven --yes':
        case 'choco uninstall notepadplusplus --yes':
        case 'choco uninstall winmerge --yes':
        case 'choco uninstall docker-desktop --yes':
        case 'choco uninstall vscode --yes':
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

        case 'clear':
        case 'cls':
          this.dpTerminal()?.clear();
          response = '';
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

  /** Copy a documented command (from the "View Available Commands" panel) to the clipboard. */
  async copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      this.messagesService.showSuccess(command, 'Copied to clipboard');
    } catch {
      this.messagesService.showError('Could not copy to clipboard');
    }
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
