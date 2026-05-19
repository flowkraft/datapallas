import { OnInit, Component, OnDestroy, input } from '@angular/core';

import { ExecutionStatsService } from '../../providers/execution-stats.service';
import { WebSocketService } from '../../providers/websocket.service';

@Component({
  selector: 'dburst-log-file-viewer',
  template:
    '@if (logFileName() == \'info.log\') {<div [innerHTML]="executionStatsService.logStats.infoLogContent" style="white-space: pre-wrap;"></div>}@if (logFileName() == \'warnings.log\') {<div [innerHTML]="executionStatsService.logStats.warningsLogContent" style="white-space: pre-wrap;"></div>}@if (logFileName() == \'errors.log\') {<div [innerHTML]="executionStatsService.logStats.errorsLogContent" style="white-space: pre-wrap;"></div>}',
})
export class LogFileViewerComponent implements OnInit, OnDestroy {
  logFileName = input<string>();

  constructor(
    protected executionStatsService: ExecutionStatsService,
    protected logsService: WebSocketService,
  ) {}

  async ngOnInit() {
    this.logsService.startTailing(this.logFileName());
  }

  ngOnDestroy() {
    this.logsService.tailerStop(this.logFileName());
  }
}
