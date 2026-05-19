import { Component, inject, input } from '@angular/core';
import { ExecutionStatsService } from '../../providers/execution-stats.service';

@Component({
  selector: 'dburst-log-files-viewer-separate-tabs',
  templateUrl: './log-files-viewer-separate-tabs.component.html',
})
export class LogFilesViewerSeparateTabsComponent {
  viewerId = input<string>('logsViewer');

  protected executionStatsService = inject(ExecutionStatsService);
}
