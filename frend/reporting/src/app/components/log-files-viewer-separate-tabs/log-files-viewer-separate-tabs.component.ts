import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LogFileViewerComponent } from '../log-file-viewer/log-file-viewer.component';
import { DpTabsComponent } from '../dp/tabs/dp-tabs.component';
import { DpTabComponent } from '../dp/tabs/dp-tab.component';
import { ExecutionStatsService } from '../../providers/execution-stats.service';

@Component({
    selector: 'dburst-log-files-viewer-separate-tabs',
    templateUrl: './log-files-viewer-separate-tabs.component.html',
    standalone: true,
    imports: [CommonModule, LogFileViewerComponent, DpTabsComponent, DpTabComponent, TranslateModule],
})
export class LogFilesViewerSeparateTabsComponent {
  viewerId = input<string>('logsViewer');

  protected executionStatsService = inject(ExecutionStatsService);
}
