import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DpDialogComponent } from '../dp/dialog/dp-dialog.component';
import { askForFeatureDialogTemplate } from './ask-for-feature-dialog.template';
import { ConfirmService } from '../dialog-confirm/confirm.service';
import Utilities from '../../helpers/utilities';
import { ApiService } from '../../providers/api.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { AppPathsService } from '../../providers/app-paths.service';

@Component({
  selector: 'dburst-ask-for-feature-dialog',
  standalone: true,
  imports: [DpDialogComponent, CommonModule, FormsModule, TranslateModule],
  template: `${askForFeatureDialogTemplate}`,
})
export class AskForFeatureDialogComponent implements OnInit {
  isVisible = true;
  onClose = new Subject<boolean>();
  title = '';
  msgTo = '';
  msgSubject = '';
  msgMessage = '';
  confirmLabel = '';

  constructor(
    protected settingsService: ConfigurationRepository,
    protected appPathsService: AppPathsService,
    protected confirmService: ConfirmService,
    protected apiService: ApiService,
    private router: Router,
  ) {}

  ngOnInit(): void {}

  async confirm(action?: string) {
    if (action == 'send-message') {
      this.confirmService.askConfirmation({
        message: `Send email inquiry to ${this.msgTo}?`,
        confirmAction: async () => {
          let xmlAskForFeatureFilePath = `${
            this.appPathsService.JOBS_FOLDER_PATH
          }/${Utilities.getRandomFileName('xml')}`;

          xmlAskForFeatureFilePath = Utilities.slash(xmlAskForFeatureFilePath);

          const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<documentburster>
    <featurerequest>
        <subject>${this.msgSubject}</subject>
        <message>${this.msgMessage}</message>
    </featurerequest>
</documentburster>`;

          await this.apiService.put(
            `/system/fs/content?path=${encodeURIComponent(xmlAskForFeatureFilePath)}`,
            xmlContent,
            new Headers({ 'Content-Type': 'text/plain' }),
          );

          this.apiService.post('/system/feedback/feature-request', {
            jobFilePath: xmlAskForFeatureFilePath,
          });

          this._close(true);
        },
      });
      return;
    } else if (action == 'configure-email-properly') {
      this.router.navigate(['/configuration-connections'], {
        skipLocationChange: true,
      });
    }
    this._close(true);
  }

  onVisibleChange(visible: boolean) {
    if (!visible) this._close(false);
  }

  private _close(result: boolean) {
    if (this.onClose.isStopped) return;
    this.isVisible = false;
    this.onClose.next(result);
    this.onClose.complete();
  }
}
