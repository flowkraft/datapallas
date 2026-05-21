import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MarkdownModule } from 'ngx-markdown';
import { NgxCodeJarComponent } from 'ngx-codejar';
import { DpDialogComponent } from '../components/dp/dialog/dp-dialog.component';
import { DpCarouselComponent } from '../components/dp/carousel/dp-carousel.component';
import { DpEditorComponent } from '../components/dp/editor/dp-editor.component';
import { DpTabsComponent } from '../components/dp/tabs/dp-tabs.component';
import { DpTabComponent } from '../components/dp/tabs/dp-tab.component';
import { DpTabHeadingDirective } from '../components/dp/tabs/dp-tab-heading.directive';
import { DockerComponent } from '../components/docker/docker.component';
import { LiveChatComponent } from '../components/live-chat/live-chat.component';
import { ButtonVariablesComponent } from '../components/button-variables/button-variables.component';
import { AppsManagerComponent } from '../components/apps-manager/apps-manager.component';
import { AiManagerComponent } from '../components/ai-manager/ai-manager.component';
import { ButtonWellKnownEmailProvidersComponent } from '../components/button-well-known/button-well-known.component';
import { ButtonHtmlPreviewComponent } from '../components/button-html-preview/button-html-preview.component';
import { LogFileViewerComponent } from '../components/log-file-viewer/log-file-viewer.component';
import { LogFilesViewerAllTogetherComponent } from '../components/log-files-viewer-all-together/log-files-viewer-all-together.component';
import { LogFilesViewerSeparateTabsComponent } from '../components/log-files-viewer-separate-tabs/log-files-viewer-separate-tabs.component';
import { ButtonClearLogsComponent } from '../components/button-clear-logs/button-clear-logs.component';
import { SafePipe } from './safe.pipe';
import { TabulatorColumnsPipe } from './tabulator-columns.pipe';

export const SHARED_IMPORTS = [
  CommonModule,
  FormsModule,
  ReactiveFormsModule,
  RouterModule,
  TranslateModule,
  MarkdownModule,
  NgxCodeJarComponent,
  DpDialogComponent,
  DpCarouselComponent,
  DpEditorComponent,
  DpTabsComponent,
  DpTabComponent,
  DpTabHeadingDirective,
  DockerComponent,
  LiveChatComponent,
  ButtonVariablesComponent,
  AppsManagerComponent,
  AiManagerComponent,
  ButtonWellKnownEmailProvidersComponent,
  ButtonHtmlPreviewComponent,
  LogFileViewerComponent,
  LogFilesViewerAllTogetherComponent,
  LogFilesViewerSeparateTabsComponent,
  ButtonClearLogsComponent,
  SafePipe,
  TabulatorColumnsPipe,
] as const;
