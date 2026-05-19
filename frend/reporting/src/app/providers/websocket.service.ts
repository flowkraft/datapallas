import { Subject, Subscription, interval } from 'rxjs';
import { TopicOptions, WebSocketEndpoint } from '../helpers/websocket-endpoint';
import { ConfigurationRepository } from './configuration-repository.service';
import { Constants } from '../helpers/constants';
import { ApiService } from './api.service';
import { Injectable } from '@angular/core';
import { ExecutionStatsService } from './execution-stats.service';
import Utilities from '../helpers/utilities';
import { ToastrMessagesService } from './toastr-messages.service';
import { StateStoreService } from './state-store.service';

@Injectable({
  providedIn: 'root',
})
export class WebSocketService extends WebSocketEndpoint {
  constructor(
    protected apiService: ApiService,
    protected settingsService: ConfigurationRepository,
    protected executionStatsService: ExecutionStatsService,
    protected toastMessagesService: ToastrMessagesService,
    protected stateStore: StateStoreService,
  ) {
    super();
    this.logsSubjects = new Map<string, Subject<string>>();
    this.subscriptionsLogFileContent = new Map<string, Subscription>();
  }

  async makeWSConnectionAndHandleMessages() {
    //console.log(
    //  `this.BACKEND_URL = ${this.BACKEND_URL}, this.apiService.BACKEND_URL = ${this.apiService.BACKEND_URL}`,
    //);
    if (this.BACKEND_URL == '/api' && this.apiService.BACKEND_URL != '/api') {
      this.BACKEND_URL = this.apiService.BACKEND_URL;

      //console.log(
      //  `LogsServiceWebSocket.makeWSConnectionAndHandleMessages() BACKEND_URL: ${this.BACKEND_URL})}`,
      //);
    }

    //if server is started and the subscription is not already active
    const topicOptionsExecutionStats = new TopicOptions(
      Constants.WS_TOPIC_EXECUTION_STATS,
      this.handleExecutionStatsEvent.bind(this),
    );

    const topicOptionsFilesTailer = new TopicOptions(
      Constants.WS_TOPIC_TAILER,
      this.handleFileTailerEvent.bind(this),
    );

    this.socketUrl = Constants.WS_ENDPOINT;
    
    // TEMP: API key disabled for rollback - do not set access token
    this.accessToken = null;

    await this.makeWSConnection([
      topicOptionsExecutionStats,
      topicOptionsFilesTailer,
    ]);
  }

  //logs tailing - START
  logsSubjects: Map<string, Subject<string>>;
  subscriptionsLogFileContent: Map<string, Subscription>;

  subscriptionCheckIfLogFileWasCreatedIsEmptyOrRemoved: Subscription;

  handleFileTailerEvent(receivedEvent: string) {
    // console.log(`handleFileTailerEvent data = ${receivedEvent}`);

    const message = JSON.parse(receivedEvent);
    const payload = message.filesPayload[0];

    // console.log(
    //  `handleFileTailerEvent payload = ${JSON.stringify(message.filesPayload[0])}`,
    // );

    const fileName = payload.fileName;
    if (this.logsSubjects.has(fileName)) {
      const logLine = payload.fileContent;
      this.logsSubjects.get(fileName).next(logLine);
    }

    //const message = this.getMessage(data);
    //const payload = message.message.filesPayload[0];
  }

  async startTailing(logFileName: string) {
    const repeat = interval(750);
    this.subscriptionCheckIfLogFileWasCreatedIsEmptyOrRemoved =
      repeat.subscribe((val) =>
        this.checkIfFileWasCreatedIsEmptyOrRemoved(logFileName),
      );
  }

  async tailerStart(logFileName: string) {
    if (logFileName == 'info.log')
      if (this.executionStatsService.logStats.infoTailingActive > 0) {
        this.executionStatsService.logStats.infoTailingActive = 2;
        return;
      } else this.executionStatsService.logStats.infoTailingActive++;

    if (logFileName == 'errors.log')
      if (this.executionStatsService.logStats.errorsTailingActive > 0) {
        this.executionStatsService.logStats.errorsTailingActive = 2;
        return;
      } else this.executionStatsService.logStats.errorsTailingActive++;

    if (logFileName == 'warnings.log')
      if (this.executionStatsService.logStats.warningsTailingActive > 0) {
        this.executionStatsService.logStats.warningsTailingActive = 2;
        return;
      } else this.executionStatsService.logStats.warningsTailingActive++;

    const subscriptionLogFileContent = this.getLogs$(logFileName).subscribe(
      (logLine: string) => {
        //console.log(`this.logFileName = ${logFileName}, logLine = ${logLine}`);

        if (logFileName == 'info.log') {
          if (
            !this.executionStatsService.logStats.infoLogLines.includes(logLine)
          ) {
            this.executionStatsService.logStats.infoLogLines.unshift(logLine);
          }
          this.executionStatsService.logStats.infoLogContent =
            this.executionStatsService.logStats.infoLogLines.join('\n'); // Update the content property
        }

        if (logFileName == 'errors.log') {
          if (
            !this.executionStatsService.logStats.errorsLogLines.includes(
              logLine,
            )
          ) {
            this.executionStatsService.logStats.errorsLogLines.unshift(logLine);
          }
          this.executionStatsService.logStats.errorsLogContent =
            this.executionStatsService.logStats.errorsLogLines.join('\n'); // Update the content property

          //console.log(
          //  `this.executionStatsService.logStats.errorsLogContent = ${this.executionStatsService.logStats.errorsLogContent}`,
          //);
        }

        if (logFileName == 'warnings.log') {
          if (
            !this.executionStatsService.logStats.warningsLogLines.includes(
              logLine,
            )
          ) {
            this.executionStatsService.logStats.warningsLogLines.unshift(
              logLine,
            );
          }
          this.executionStatsService.logStats.warningsLogContent =
            this.executionStatsService.logStats.warningsLogLines.join('\n'); // Update the content property
        }
      },
    );

    //console.log(`this.logFileName = ${logFileName}, start`);

    this.subscriptionsLogFileContent.set(
      logFileName,
      subscriptionLogFileContent,
    );
    await this.apiService.post('/jobs/logs/tailer', {
      fileName: logFileName,
      command: 'start',
    });
  }

  async tailerStop(logFileName: string) {
    //console.log(
    //  `tailerStop: logFileName = ${logFileName}, logStats = ${JSON.stringify(this.executionStatsService.logStats)}`,
    //);
    if (logFileName == 'info.log')
      if (this.executionStatsService.logStats.infoTailingActive == 2) {
        this.executionStatsService.logStats.infoTailingActive--;
        return;
      } else {
        this.executionStatsService.logStats.infoTailingActive = 0;

        delete this.executionStatsService.logStats.infoLogContent;
        this.executionStatsService.logStats.infoLogLines = [];
      }

    if (logFileName == 'errors.log')
      if (this.executionStatsService.logStats.errorsTailingActive == 2) {
        this.executionStatsService.logStats.errorsTailingActive--;
        return;
      } else {
        this.executionStatsService.logStats.errorsTailingActive = 0;
        delete this.executionStatsService.logStats.errorsLogContent;
        this.executionStatsService.logStats.errorsLogLines = [];
      }

    if (logFileName == 'warnings.log')
      if (this.executionStatsService.logStats.warningsTailingActive == 2) {
        this.executionStatsService.logStats.warningsTailingActive--;
        return;
      } else {
        this.executionStatsService.logStats.warningsTailingActive = 0;
        delete this.executionStatsService.logStats.warningsLogContent;
        this.executionStatsService.logStats.warningsLogLines = [];
      }

    if (this.logsSubjects.has(logFileName)) {
      this.logsSubjects.get(logFileName).complete();
      this.subscriptionsLogFileContent.get(logFileName).unsubscribe();
      this.logsSubjects.delete(logFileName);
      await this.apiService.post('/jobs/logs/tailer', {
        fileName: logFileName,
        command: 'stop',
      });
    }
  }

  getLogs$(fileName: string) {
    //console.log(`getLogs$ fileName = ${fileName}`);

    if (!this.logsSubjects.has(fileName)) {
      this.logsSubjects.set(fileName, new Subject<string>());
    }
    return this.logsSubjects.get(fileName).asObservable();
  }

  async clearLogs(logFileName?: string) {
    if (logFileName) {
      await this.apiService.delete(`/jobs/logs/${logFileName}`);
    } else {
      const logsFiles = ['errors.log', 'warnings.log', 'info.log'];

      for (const logFile of logsFiles) {
        await this.apiService.delete(`/jobs/logs/${logFile}`);
      }
      await this.checkLogsFolder();
    }

    // Clear frontend log buffers so stale content doesn't remain on screen
    const stats = this.executionStatsService.logStats;
    stats.infoLogLines = [];
    stats.infoLogContent = '';
    stats.errorsLogLines = [];
    stats.errorsLogContent = '';
    stats.warningsLogLines = [];
    stats.warningsLogContent = '';
  }

  async checkIfFileWasCreatedIsEmptyOrRemoved(logFileName: string) {
    let logFileExists = false;
    let logFileSize = -1;

    switch (logFileName) {
      case 'info.log': {
        logFileExists =
          this.executionStatsService.logStats.infoLogFileSize >= 0;
        logFileSize = this.executionStatsService.logStats.infoLogFileSize;
        break;
      }
      case 'errors.log': {
        logFileExists =
          this.executionStatsService.logStats.errorsLogFileSize >= 0;
        logFileSize = this.executionStatsService.logStats.errorsLogFileSize;

        break;
      }
      case 'warnings.log': {
        logFileExists =
          this.executionStatsService.logStats.warningsLogFileSize >= 0;
        logFileSize = this.executionStatsService.logStats.warningsLogFileSize;

        break;
      }
      case 'bash.service.log': {
        logFileExists =
          this.executionStatsService.logStats.bashServiceLogFileSize >= 0;
        logFileSize =
          this.executionStatsService.logStats.bashServiceLogFileSize;
        break;
      }
      default: {
        logFileExists = false;
        logFileSize = -1;

        break;
      }
    }

    //console.log(
    //  `checkIfFileWasCreatedIsEmptyOrRemoved this.logFileName = ${logFileName}, logFileExists = ${logFileExists}, logFileSize = ${logFileSize}`,
    //);

    if (logFileExists) {
      if (logFileSize <= 0) {
        this.tailerStop(logFileName);
      } else if (logFileSize > 0) {
        this.tailerStart(logFileName);
      }
    } else {
      this.tailerStop(logFileName);
    }
  }

  async checkLogsFolder() {}

  //logs tailing - END

  //execution stats - START

  callBacksProcessing = {
    onProcessingComplete: null,
    onProcessingFailed: null,
  };

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
    //console.log(`jobsEventDetails = ${JSON.stringify(jobsEventDetails)}`);

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
    //console.log(`allJobFiles = ${JSON.stringify(allJobFiles)}`);

    const processingJobs = [];
    for (const jobFile of allJobFiles) {
      //console.log(`jobFile = ${JSON.stringify(jobFile)}`);

      // jobtype === 'burst' job files
      if (jobFile.filePath.endsWith('.job')) {
        //console.log(jobFile.fileContent);
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
    //console.log(`handleExecutionStatsEvent data = ${receivedEvent}`);

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
    //console.log(`logsEventDetails 1 = ${JSON.stringify(logsEventDetails)}`);
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
    // console.log(`this.executionStatsService.logStats.infoLogFileSize = ${this.executionStatsService.logStats.infoLogFileSize}`);
  };

  getNiceListOfFileNames(fileNames: Array<string>) {
    return [fileNames.slice(0, -1).join(', '), fileNames.slice(-1)[0]].join(
      fileNames.length < 2 ? '' : ' and ',
    );
  }

  //execution stats - END
}
