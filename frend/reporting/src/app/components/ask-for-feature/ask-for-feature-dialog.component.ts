import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { askForFeatureDialogTemplate } from './ask-for-feature-dialog.template';
import { ConfirmService } from '../dialog-confirm/confirm.service';
import Utilities from '../../helpers/utilities';
import { ApiService } from '../../providers/api.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { AppPathsService } from '../../providers/app-paths.service';

@Component({
  selector: 'dburst-ask-for-feature-dialog',
  template: `${askForFeatureDialogTemplate}`,
})
export class AskForFeatureDialogComponent implements OnInit {
  onClose: Subject<boolean>;
  title: string;

  msgTo: string;
  msgSubject: string;
  msgMessage: string;

  confirmLabel: string;

  constructor(
    protected bsModalRef: BsModalRef,
    protected settingsService: ConfigurationRepository,
    protected appPathsService: AppPathsService,
    protected confirmService: ConfirmService,
    protected apiService: ApiService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.onClose = new Subject();
  }

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

          this.onClose?.next(true);
          this.bsModalRef.hide();
        },
      });
      return;
    } else if (action == 'configure-email-properly') {
      this.router.navigate(['/configuration-connections'], {
        skipLocationChange: true,
      });
    }

    this.onClose?.next(true);
    this.bsModalRef.hide();
  }
}
