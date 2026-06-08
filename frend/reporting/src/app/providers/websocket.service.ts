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

  // Per-file tailing lifecycle, reference-counted by how many
  // <dburst-log-file-viewer> components are currently mounted for a file.
  // Tailing spins up on the 0->1 transition and is fully torn down on 1->0.
  // Every resource that needs cleanup is stored per-file so it can actually be
  // unsubscribed — there is no shared/global handle to leak when the three
  // viewers (info/warnings/errors) mount together.
  private tailingRefCount = new Map<string, number>();
  private sizePollers = new Map<string, Subscription>();
  private backendTailerActive = new Map<string, boolean>();

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

  // Called from dburst-log-file-viewer.ngOnInit. Reference-counted: only the
  // first viewer mounted for a file wires up the content pipeline and the size
  // poller; later viewers for the same file just bump the count.
  startTailing(logFileName: string) {
    const count = (this.tailingRefCount.get(logFileName) ?? 0) + 1;
    this.tailingRefCount.set(logFileName, count);
    if (count > 1) return;

    this.subscribeToFileContent(logFileName);

    // A dedicated poller per file keeps the backend Tailer in sync with the
    // file's size: start it when the file has content, stop it and blank the
    // viewer when the file is emptied or removed. Stored so stopTailing can
    // cancel it — the previous single shared interval handle leaked one timer
    // per viewer for the lifetime of the app.
    const poller = interval(750).subscribe(() =>
      this.syncBackendTailer(logFileName),
    );
    this.sizePollers.set(logFileName, poller);
    this.syncBackendTailer(logFileName);
  }

  // Called from dburst-log-file-viewer.ngOnDestroy. Only the last viewer for a
  // file tears tailing down; everything created in startTailing is released.
  stopTailing(logFileName: string) {
    const count = (this.tailingRefCount.get(logFileName) ?? 0) - 1;
    if (count > 0) {
      this.tailingRefCount.set(logFileName, count);
      return;
    }
    this.tailingRefCount.delete(logFileName);

    const poller = this.sizePollers.get(logFileName);
    if (poller) {
      poller.unsubscribe();
      this.sizePollers.delete(logFileName);
    }

    const contentSub = this.subscriptionsLogFileContent.get(logFileName);
    if (contentSub) {
      contentSub.unsubscribe();
      this.subscriptionsLogFileContent.delete(logFileName);
    }

    if (this.logsSubjects.has(logFileName)) {
      this.logsSubjects.get(logFileName).complete();
      this.logsSubjects.delete(logFileName);
    }

    if (this.backendTailerActive.get(logFileName)) {
      this.backendTailerActive.set(logFileName, false);
      this.apiService.post('/jobs/logs/tailer', {
        fileName: logFileName,
        command: 'stop',
      });
    }

    this.clearFileBuffer(logFileName);
  }

  // Accumulates the lines streamed over /topic/tailer into the viewer's bound
  // buffer. Lives for as long as a viewer is mounted; backend start/stop only
  // controls whether lines actually arrive, never this subscription.
  private subscribeToFileContent(logFileName: string) {
    const subscriptionLogFileContent = this.getLogs$(logFileName).subscribe(
      (logLine: string) => {
        const stats = this.executionStatsService.logStats;

        if (logFileName == 'info.log') {
          if (!stats.infoLogLines.includes(logLine)) {
            stats.infoLogLines.unshift(logLine);
          }
          stats.infoLogContent = stats.infoLogLines.join('\n');
        }

        if (logFileName == 'errors.log') {
          if (!stats.errorsLogLines.includes(logLine)) {
            stats.errorsLogLines.unshift(logLine);
          }
          stats.errorsLogContent = stats.errorsLogLines.join('\n');
        }

        if (logFileName == 'warnings.log') {
          if (!stats.warningsLogLines.includes(logLine)) {
            stats.warningsLogLines.unshift(logLine);
          }
          stats.warningsLogContent = stats.warningsLogLines.join('\n');
        }
      },
    );

    this.subscriptionsLogFileContent.set(
      logFileName,
      subscriptionLogFileContent,
    );
  }

  // Keeps the backend Tailer running exactly while the file has content. Driven
  // by the per-file poller off the live size in logStats (refreshed by the
  // execution-stats websocket). Idempotent: POSTs only on a real transition, so
  // it is safe to call every tick.
  private syncBackendTailer(logFileName: string) {
    const size = this.logFileSize(logFileName);
    const active = this.backendTailerActive.get(logFileName) === true;

    if (size > 0) {
      if (!active) {
        this.backendTailerActive.set(logFileName, true);
        this.apiService.post('/jobs/logs/tailer', {
          fileName: logFileName,
          command: 'start',
        });
      }
    } else {
      // Emptied or removed: stop the backend tailer and drop buffered lines so
      // the viewer goes blank.
      if (active) {
        this.backendTailerActive.set(logFileName, false);
        this.apiService.post('/jobs/logs/tailer', {
          fileName: logFileName,
          command: 'stop',
        });
      }
      this.clearFileBuffer(logFileName);
    }
  }

  private logFileSize(logFileName: string): number {
    const stats = this.executionStatsService.logStats;
    switch (logFileName) {
      case 'info.log':
        return stats.infoLogFileSize;
      case 'errors.log':
        return stats.errorsLogFileSize;
      case 'warnings.log':
        return stats.warningsLogFileSize;
      case 'bash.service.log':
        return stats.bashServiceLogFileSize;
      default:
        return -1;
    }
  }

  private clearFileBuffer(logFileName: string) {
    const stats = this.executionStatsService.logStats;
    if (logFileName == 'info.log') {
      stats.infoLogLines = [];
      stats.infoLogContent = '';
    } else if (logFileName == 'errors.log') {
      stats.errorsLogLines = [];
      stats.errorsLogContent = '';
    } else if (logFileName == 'warnings.log') {
      stats.warningsLogLines = [];
      stats.warningsLogContent = '';
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
            jobType: activeJob.job?.jobtype || '',
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
