import { ModuleWithProviders, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TranslateModule } from '@ngx-translate/core';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgxCodeJarComponent } from 'ngx-codejar';

import { ToastrMessagesService } from '../providers/toastr-messages.service';
import { ConfirmService } from '../components/dialog-confirm/confirm.service';
import { DpTabsComponent } from '../components/dp/tabs/dp-tabs.component';
import { DpTabComponent } from '../components/dp/tabs/dp-tab.component';
import { DpTabHeadingDirective } from '../components/dp/tabs/dp-tab-heading.directive';
import { BrowserModule } from '@angular/platform-browser';
import { InfoService } from '../components/dialog-info/info.service';
import { AskForFeatureService } from '../components/ask-for-feature/ask-for-feature.service';
import { ButtonWellKnownEmailProvidersComponent } from '../components/button-well-known/button-well-known.component';
import { ButtonClearLogsModule } from '../components/button-clear-logs/button-clear-logs.module';
import { ButtonHtmlPreviewComponent } from '../components/button-html-preview/button-html-preview.component';
import { LogFilesViewerAllTogetherModule } from '../components/log-files-viewer-all-together/log-files-viewer-all-together.module';
import { LogFilesViewerSeparateTabsModule } from '../components/log-files-viewer-separate-tabs/log-files-viewer-separate-tabs.module';
import { LogFileViewerModule } from '../components/log-file-viewer/log-file-viewer.module';
import { ConfigurationRepository } from '../providers/configuration-repository.service';
import { WebSocketService } from '../providers/websocket.service';
import { FsService } from '../providers/fs.service';
import { ApiService } from '../providers/api.service';
import { StateStoreService } from '../providers/state-store.service';
import { LiveChatComponent } from '../components/live-chat/live-chat.component';
import { SafePipe } from './safe.pipe';
import { AppRoutingModule } from '../app-routing.module';
import { RouterModule } from '@angular/router';
import { ButtonVariablesComponent } from '../components/button-variables/button-variables.component';
import { TabulatorColumnsPipe } from './tabulator-columns.pipe';
import { AiManagerComponent } from '../components/ai-manager/ai-manager.component';
import { AppsManagerComponent } from '../components/apps-manager/apps-manager.component';
import { MarkdownModule } from 'ngx-markdown';
import { DockerComponent } from '../components/docker/docker.component';
import { DpDialogComponent } from '../components/dp/dialog/dp-dialog.component';
import { DpCarouselComponent } from '../components/dp/carousel/dp-carousel.component';
import { DpEditorComponent } from '../components/dp/editor/dp-editor.component';

@NgModule({
  imports: [
    TranslateModule,
    MarkdownModule.forRoot(),
    RouterModule,
    DpDialogComponent,
    DpCarouselComponent,
    DpEditorComponent,
    DpTabsComponent,
    DpTabComponent,
    DpTabHeadingDirective,
    CommonModule,
    FormsModule,
    NgxCodeJarComponent,
    ReactiveFormsModule,
    AppRoutingModule,
  ],
  declarations: [
    DockerComponent,
    LiveChatComponent,
    ButtonVariablesComponent,
    AppsManagerComponent,
    AiManagerComponent,
    ButtonWellKnownEmailProvidersComponent,
    ButtonHtmlPreviewComponent,
    SafePipe,
    TabulatorColumnsPipe,
  ],
  exports: [
    CommonModule,
    BrowserModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    DpDialogComponent,
    DpCarouselComponent,
    DpEditorComponent,
    DpTabsComponent,
    DpTabComponent,
    DpTabHeadingDirective,
    MarkdownModule,
    NgxCodeJarComponent,
    DockerComponent,
    LiveChatComponent,
    LogFileViewerModule,
    LogFilesViewerAllTogetherModule,
    LogFilesViewerSeparateTabsModule,
    ButtonClearLogsModule,
    ButtonVariablesComponent,
    ButtonWellKnownEmailProvidersComponent,
    AppsManagerComponent,
    AiManagerComponent,
    ButtonHtmlPreviewComponent,
    SafePipe,
    TabulatorColumnsPipe,
  ],
  providers: [
    StateStoreService,
    ConfigurationRepository,
    ConfigurationRepository,
    FsService,
    WebSocketService,
    ToastrMessagesService,
    ConfirmService,
    InfoService,
    AskForFeatureService,
    ApiService,
  ],
})
export class SharedModule {
  static forRoot(): ModuleWithProviders<SharedModule> {
    return {
      ngModule: SharedModule,
      providers: [StateStoreService],
    };
  }
}
