import { Component, OnDestroy, OnInit } from '@angular/core';

import { Subscription } from 'rxjs';
import { ExecutionStatsService } from '../../providers/execution-stats.service';

//import * as jetpack from 'fs-jetpack';

//import * as path from 'path';
import Utilities from '../../helpers/utilities';
import { ConfirmService } from '../../components/dialog-confirm/confirm.service';
import { JobsService } from '../../providers/jobs.service';
import { StateStoreService } from '../../providers/state-store.service';
import { WebSocketService } from '../../providers/websocket.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';

@Component({
  selector: 'dburst-status-bar',
  templateUrl: './status-bar.template.html',
})
export class StatusBarComponent implements OnInit, OnDestroy {
  subscription: Subscription;

  constructor(
    protected confirmService: ConfirmService,
    protected jobsService: JobsService,
    protected executionStatsService: ExecutionStatsService,
    protected webSocketService: WebSocketService,
    protected storeService: StateStoreService,
    protected settingsService: ConfigurationRepository,
  ) {}

  async ngOnInit() {
    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      return;
    }

    this.webSocketService.BACKEND_URL =
      this.storeService.configSys.sysInfo.setup.BACKEND_URL;

    this.webSocketService.makeWSConnectionAndHandleMessages();
    //FIXME define a constant CHECK_INTERVAL = 333 to be reused across all ).subscribe

    //const repeat = interval(333);
    //const repeat = interval(3333);

    //this.subscription = repeat.subscribe((val) => {
    //  this.executionStatsService.checkJobsFolder();
    //  this.executionStatsService.checkLogsFolder();
    //  this.executionStatsService.checkResumeJobs();
    //});
  }

  ngOnDestroy() {
    this.webSocketService.wsSubscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.webSocketService.wsSubscriptions = [];
  }

  shouldShowPauseCancelButtons() {
    if (
      this.executionStatsService.jobStats.niceWorkingOnFileNames === 'email' ||
      this.executionStatsService.jobStats.niceWorkingOnFileNames ===
        'license' ||
      this.executionStatsService.jobStats.niceWorkingOnFileNames === 'twilio' ||
      this.executionStatsService.jobStats.pauseJobFileExists > 0 ||
      this.executionStatsService.jobStats.cancelJobFileExists > 0 ||
      this.executionStatsService.jobStats.numberOfActiveUpdateJobs > 0
    ) {
      return false;
    }

    return true;
  }

  // jobs
  doPauseCancelJob(fileName: string, command: string) {
    const message = command === 'pause'
      ? 'Pause ' + fileName + ' job processing?'
      : 'Cancel ' + fileName + ' job processing?';

    this.confirmService.askConfirmation({
      message,
      confirmAction: () => {
        const jobId = this.executionStatsService.jobStats.currentJobId;
        if (command === 'pause') {
          this.executionStatsService.jobStats.pauseJobFileExists = 1;
          if (jobId) this.jobsService.pauseJob(jobId);
        } else {
          this.executionStatsService.jobStats.cancelJobFileExists = 1;
          if (jobId) this.jobsService.cancelJob(jobId);
        }
      },
    });
  }
}
