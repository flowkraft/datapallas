import { Component, OnDestroy, OnInit } from '@angular/core';
import { SHARED_IMPORTS } from '../../shared/shared-imports';

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
    standalone: true,
    imports: [...SHARED_IMPORTS],
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

  // Job types that go through AbstractBurster — they create .progress files
  // and honor .pause / .cancel signals. Everything else (email tests, license
  // activate/deactivate, SMS tests, docker/starter-pack ops, app updates) is
  // either too quick to pause meaningfully or doesn't use the signal-file flow.
  private static readonly PAUSABLE_JOB_TYPES = new Set(['burst', 'generate', 'merge']);

  shouldShowPauseCancelButtons() {
    const stats = this.executionStatsService.jobStats;

    // Already in a pause/cancel transition — hide to avoid re-triggering.
    if (stats.pauseJobFileExists > 0 || stats.cancelJobFileExists > 0) {
      return false;
    }

    // App update jobs aren't tracked in workingOnJobs but still bump active count.
    if (stats.numberOfActiveUpdateJobs > 0) {
      return false;
    }

    // Show only when at least one running job is a pausable type.
    return stats.workingOnJobs.some(j =>
      StatusBarComponent.PAUSABLE_JOB_TYPES.has(j?.jobType),
    );
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
