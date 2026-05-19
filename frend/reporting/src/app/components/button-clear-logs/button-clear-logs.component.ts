import { Component, input } from '@angular/core';

import { ExecutionStatsService } from '../../providers/execution-stats.service';
import { ConfirmService } from '../dialog-confirm/confirm.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { WebSocketService } from '../../providers/websocket.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';

@Component({
  selector: 'dburst-button-clear-logs',
  templateUrl: './button-clear-logs.component.html',
  styles: [':host {display: inline-block; width: 100%}'],
})
export class ButtonClearLogsComponent {
  btnId = input<string>();
  value = input<string>();
  title = input<string>();
  question = input<string>();

  constructor(
    protected logsService: WebSocketService,
    protected executionStatsService: ExecutionStatsService,
    protected confirmService: ConfirmService,
    protected messagesService: ToastrMessagesService,
  ) {}

  onClick() {
    const dialogQuestion = this.question() ? this.question() : 'Clear log files?';

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        await this.logsService.clearLogs();
        this.executionStatsService.logStats.foundDirtyLogFiles = false;
        this.executionStatsService.logStats.errorsLogFileSize = -1;
        this.executionStatsService.logStats.warningsLogFileSize = -1;
        this.executionStatsService.logStats.infoLogFileSize = -1;
        this.messagesService.showInfo('Logs cleared.');
      },
    });
  }
}
