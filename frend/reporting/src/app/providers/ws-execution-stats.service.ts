//import * as jetpack from 'fs-jetpack';
//import * as path from 'path';

import { Injectable } from '@angular/core';
import { ConfigurationRepository } from './configuration-repository.service';
import { TopicOptions, WebSocketEndpoint } from '../helpers/websocket-endpoint';
import { Constants } from '../helpers/constants';
import { ApiService } from './api.service';
import Utilities from '../helpers/utilities';
import { ExecutionStatsService } from './execution-stats.service';
import { ToastrMessagesService } from './toastr-messages.service';
import { StateStoreService } from './state-store.service';

@Injectable({
  providedIn: 'root',
})
export class WebSocketExecutionStatsService extends WebSocketEndpoint {
  //wsSubscription: Subscription;

  callBacksProcessing = {
    onProcessingComplete: null,
    onProcessingFailed: null,
  };

  constructor(
    public apiService: ApiService,
    public settingsService: ConfigurationRepository,
    protected executionStatsService: ExecutionStatsService,
    protected toastMessagesService: ToastrMessagesService,
    protected stateStore: StateStoreService,
  ) {
    super();
  }

  async makeWSConnectionAndHandleMessages() {
    //if server is started and the subscription is not already active
    const sOptions = new TopicOptions(
      Constants.WS_TOPIC_EXECUTION_STATS,
      this.handleExecutionStatsEvent,
    );

    // Set WebSocket endpoint and authentication
    this.socketUrl = Constants.WS_ENDPOINT;
    
    // TEMP: API key disabled for rollback - do not set access token
    this.accessToken = null;

    await this.makeWSConnection([sOptions]);
    //this.settingsService.activeWebSocketSubcriptions.push(sOptions);
  }

  handleExecutionStatsOnProcessEvent = (
    exitValue: number,
    exceptionMessage = '',
  ) => {
    this.executionStatsService.jobStats.currentJobId = null;

    if (this.callBacksProcessing.onProcessingComplete) {
      this.callBacksProcessing.onProcessingComplete();
      this.callBacksProcessing.onProcessingComplete = null;
    }

    if (exitValue == 0)
      this.toastMessagesService.showSuccess('Done', '', {
        messageClass: 'java-exited',
      });
    else
      this.toastMessagesService.showError(exceptionMessage, '', {
        messageClass: 'java-exited',
      });
  };

  handleExecutionStatsJobsEvent = (
    jobsEventDetails: {
      fileName: string;
      filePath: string;
      fileContent: string;
    }[],
  ) => {
    this.handleRunningJobs(jobsEventDetails);
    this.handleResumeJobs(jobsEventDetails);
  };

  handleRunningJobs = async (
    jobsEventDetails: {
      fileName: string;
      filePath: string;
      fileContent: string;
    }[],
  ) => {
    const allJobFiles = jobsEventDetails;
    const processingJobs = [];
    for (const jobFile of allJobFiles) {
      // jobtype === 'burst' job files
      if (jobFile.fileName.endsWith('.job')) {
        const jobDetails = await Utilities.parseStringPromise(
          jobFile.fileContent,
          {
            trim: true,
            explicitArray: false,
          },
        );
        //console.log(jobDetails);
        processingJobs.push({ jobFilePath: jobFile.filePath, ...jobDetails });
      }
    }
    if (processingJobs.length == 0) {
      this.executionStatsService.jobStats.workingOnJobs = [];
      this.executionStatsService.jobStats.workingOnFileNames = [];

      this.executionStatsService.jobStats.niceWorkingOnFileNames = '';

      this.executionStatsService.jobStats.progressValue = 0;
      this.executionStatsService.jobStats.numberOfActiveJobs = 0;
    } else {
      if (
        this.executionStatsService.jobStats.progressValue <
        Constants.MAX_PROGRESS_LENGTH
      ) {
        this.executionStatsService.jobStats.progressValue += 1;
      } else {
        this.executionStatsService.jobStats.progressValue = 0;
      }
      this.executionStatsService.jobStats.numberOfActiveJobs =
        processingJobs.length;

      if (
        this.executionStatsService.jobStats.workingOnFileNames.length !==
        processingJobs.length
      ) {
        this.executionStatsService.jobStats.workingOnJobs = [];
        this.executionStatsService.jobStats.workingOnFileNames = [];
      }

      for (const activeJob of processingJobs) {
        let fileName = Utilities.getFileNameFromPath(activeJob.job.filepath);

        if (fileName === 'license.xml') {
          fileName = 'license';
        }
        if (fileName === 'email.groovy') {
          fileName = 'email';
        }

        if (fileName === 'twilio.groovy') {
          fileName = 'twilio';
        }

        if (
          this.executionStatsService.jobStats.workingOnFileNames.indexOf(
            fileName,
          ) < 0
        ) {
          this.executionStatsService.jobStats.workingOnFileNames.push(fileName);

          this.executionStatsService.jobStats.workingOnJobs.push({
            jobFilePath: activeJob.jobFilePath,
            fileName: fileName,
          });
        }
      }

      const newNiceListOfFileNames = this.getNiceListOfFileNames(
        this.executionStatsService.jobStats.workingOnFileNames.sort(),
      );

      if (
        newNiceListOfFileNames !==
        this.executionStatsService.jobStats.niceWorkingOnFileNames
      ) {
        this.executionStatsService.jobStats.niceWorkingOnFileNames =
          newNiceListOfFileNames;
        this.executionStatsService.jobStats.numberOfActiveJobs =
          processingJobs.length;
      }
    }

    // pause and cancel job files
    const pauseJobFiles = allJobFiles.filter((jobFile) =>
      jobFile.fileName.endsWith('.pause'),
    );

    if (pauseJobFiles && pauseJobFiles.length) {
      this.executionStatsService.jobStats.pauseJobFileExists =
        pauseJobFiles.length;
    } else {
      this.executionStatsService.jobStats.pauseJobFileExists = 0;
    }

    const cancelJobFiles = allJobFiles.filter((jobFile) =>
      jobFile.fileName.endsWith('.cancel'),
    );

    if (cancelJobFiles && cancelJobFiles.length) {
      this.executionStatsService.jobStats.cancelJobFileExists =
        cancelJobFiles.length;
    } else {
      this.executionStatsService.jobStats.cancelJobFileExists = 0;
    }

    const progressJobFiles = allJobFiles.filter((jobFile) =>
      jobFile.fileName.endsWith('.progress'),
    );

    if (progressJobFiles && progressJobFiles.length) {
      this.executionStatsService.jobStats.progressJobFileExists =
        progressJobFiles.length;
    } else {
      this.executionStatsService.jobStats.progressJobFileExists = 0;
    }
  };

  handleResumeJobs = async (
    jobsEventDetails: {
      fileName: string;
      filePath: string;
      fileContent: string;
    }[],
  ) => {
    const allJobFiles = jobsEventDetails;
    if (this.executionStatsService.jobStats.numberOfActiveJobs == 0) {
      const progressJobFiles = allJobFiles.filter((jobFile) =>
        jobFile.fileName.endsWith('.progress'),
      );

      if (progressJobFiles && progressJobFiles.length > 0) {
        if (
          this.executionStatsService.jobStats.jobsToResume.length !=
          progressJobFiles.length
        ) {
          this.executionStatsService.jobStats.jobsToResume = [];
        }

        for (let progressJobFile of progressJobFiles) {
          const progressJobFileAlreadyIndexed =
            this.executionStatsService.jobStats.jobsToResume.filter((job) => {
              if (job.jobFilePath === progressJobFile.filePath) {
                return job;
              }
            });

          if (
            !progressJobFileAlreadyIndexed ||
            progressJobFileAlreadyIndexed.length === 0
          ) {
            const jobProgressDetailsXML = await Utilities.parseStringPromise(
              progressJobFile.fileContent,
              {
                trim: true,
                explicitArray: false,
              },
            );
            this.executionStatsService.jobStats.jobsToResume.push({
              jobFilePath: progressJobFile.filePath,
              jobDate: jobProgressDetailsXML.jobprogress.currentdate,
              filePath: jobProgressDetailsXML.jobprogress.filepath,
              lastTokenProcessed:
                jobProgressDetailsXML.jobprogress.lasttokenprocessed,
              lastTokenInDocument:
                jobProgressDetailsXML.jobprogress.lasttokenindocument,
              testAll: jobProgressDetailsXML.jobprogress.testall,
              listOfTestTokens:
                jobProgressDetailsXML.jobprogress.listoftesttokens,
              numberOfRandomTestTokens:
                jobProgressDetailsXML.jobprogress.numberofrandomtesttokens,
              tokensCount: jobProgressDetailsXML.jobprogress.tokenscount,
              pagesCount: jobProgressDetailsXML.jobprogress.pagescount,
              numberOfRemainingTokens:
                jobProgressDetailsXML.jobprogress.numberofremainingtokens,
              indexOfLastTokenProcessed:
                jobProgressDetailsXML.jobprogress.indexoflasttokenprocessed,
            });
          }
        }
      } else this.executionStatsService.jobStats.jobsToResume = [];
    }
  };

  handleExecutionStatsEvent = (receivedEvent: string) => {
    //console.log(`handleExecutionStatsEvent receivedEvent = ${receivedEvent}`);

    this.settingsService.isJServerStarted = true;
    //this.stateStore.configSys.sysInfo.setup.java.isJavaOk = true;

    //const message = receivedEvent['message'];
    const message = JSON.parse(receivedEvent);

    //console.log(`message = ${JSON.stringify(message)}`);
    //console.log(`message.eventType = ${message.eventType}`);

    if (message.eventType === 'stats.jobs')
      this.handleExecutionStatsJobsEvent(message.filesPayload);
    else if (message.eventType === 'stats.logs')
      this.handleExecutionStatsLogsEvent(message.filesPayload);
    else if (message.eventType.startsWith('on.process.'))
      this.handleExecutionStatsOnProcessEvent(
        message.exitValue,
        message.exceptionMessage,
      );
  };

  handleExecutionStatsLogsEvent = (
    logsEventDetails: {
      fileName: string;
      fileSize: number;
    }[],
  ) => {
    //console.log(`logsEventDetails 2 = ${JSON.stringify(logsEventDetails)}`);
    this.executionStatsService.logStats.foundDirtyLogFiles = false;
    const allLogFiles = logsEventDetails;

    if (allLogFiles.length == 0) {
      this.executionStatsService.logStats.errorsLogFileSize = -1;
      this.executionStatsService.logStats.infoLogFileSize = -1;
      this.executionStatsService.logStats.warningsLogFileSize = -1;
    } else {
      const errorsLog = allLogFiles.find(
        (logFile) => logFile.fileName === 'errors.log',
      );

      if (!errorsLog)
        this.executionStatsService.logStats.errorsLogFileSize = -1;
      else {
        this.executionStatsService.logStats.errorsLogFileSize =
          errorsLog.fileSize;
      }

      const warningsLog = allLogFiles.find(
        (logFile) => logFile.fileName === 'warnings.log',
      );

      if (!warningsLog)
        this.executionStatsService.logStats.warningsLogFileSize = -1;
      else {
        this.executionStatsService.logStats.warningsLogFileSize =
          warningsLog.fileSize;
      }

      const infoLog = allLogFiles.find(
        (logFile) => logFile.fileName === 'info.log',
      );

      if (!infoLog) this.executionStatsService.logStats.infoLogFileSize = -1;
      else {
        this.executionStatsService.logStats.infoLogFileSize = infoLog.fileSize;
      }
    }

    if (
      this.executionStatsService.logStats.errorsLogFileSize > 0 ||
      this.executionStatsService.logStats.infoLogFileSize > 0 ||
      this.executionStatsService.logStats.warningsLogFileSize > 0
    ) {
      this.executionStatsService.logStats.foundDirtyLogFiles = true;
    }
    // /console.log(this.executionStatsService.logStats.errorsLogFileSize);
  };

  getNiceListOfFileNames(fileNames: Array<string>) {
    return [fileNames.slice(0, -1).join(', '), fileNames.slice(-1)[0]].join(
      fileNames.length < 2 ? '' : ' and ',
    );
  }
}
