import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LogFileViewerComponent } from '../log-file-viewer/log-file-viewer.component';
import { ExecutionStatsService } from '../../providers/execution-stats.service';
import { ConfirmService } from '../dialog-confirm/confirm.service';
import { WebSocketService } from '../../providers/websocket.service';
import { JobsService } from '../../providers/jobs.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';

@Component({
    selector: 'dburst-log-files-viewer-all-together',
    templateUrl: './log-files-viewer-all-together.html',
    standalone: true,
    imports: [CommonModule, LogFileViewerComponent, TranslateModule],
})
export class LogFilesViewerAllTogetherComponent {
  constructor(
    protected confirmService: ConfirmService,
    protected executionStatsService: ExecutionStatsService,
    protected jobsService: JobsService,
    protected logsService: WebSocketService,
    protected settingsService: ConfigurationRepository,
  ) {}

  clearQuarantinedAndLogFiles(shouldClearLogFiles: boolean) {
    let dialogQuestion = 'Clear all quarantined files?';
    if (shouldClearLogFiles) {
      dialogQuestion = 'Clear all quarantined and log files?';
    }

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        await this.jobsService.clearQuarantine();
        if (shouldClearLogFiles) {
          await this.logsService.clearLogs();
        }
      },
    });
  }

  clearLogs(logFile: string) {
    let dialogQuestion = 'Clear file /logs/' + logFile + '?';
    if (!logFile) {
      dialogQuestion = 'Clear all log files?';
    }

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: () => {
        this.logsService.clearLogs(logFile);
      },
    });
  }
}
