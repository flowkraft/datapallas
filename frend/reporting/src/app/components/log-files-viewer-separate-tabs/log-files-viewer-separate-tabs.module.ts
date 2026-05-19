import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { LogFileViewerModule } from '../log-file-viewer/log-file-viewer.module';
import { DpTabsComponent } from '../dp/tabs/dp-tabs.component';
import { DpTabComponent } from '../dp/tabs/dp-tab.component';

import { LogFilesViewerSeparateTabsComponent } from './log-files-viewer-separate-tabs.component';

@NgModule({
  declarations: [LogFilesViewerSeparateTabsComponent],
  exports: [LogFilesViewerSeparateTabsComponent],
  imports: [LogFileViewerModule, DpTabsComponent, DpTabComponent, TranslateModule],
})
export class LogFilesViewerSeparateTabsModule {}
