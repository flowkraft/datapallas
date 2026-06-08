//import * as jetpack from 'fs-jetpack';
//import * as path from 'path';

import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ExecutionStatsService {
  logStats = {
    infoLogFilePath: undefined,
    errorsLogFilePath: undefined,
    warningsLogFilePath: undefined,
    bashServiceLogFilePath: undefined,
    infoLogFileIsLocked: false,
    errorsLogFileIsLocked: false,
    warningsLogFileIsLocked: false,
    bashServiceLogFileIsLocked: false,
    infoLogFileSize: -1,
    errorsLogFileSize: -1,
    warningsLogFileSize: -1,
    bashServiceLogFileSize: -1,
    updateErrMessage: undefined,
    foundDirtyLogFiles: false,
    errorsLogLines: [],
    errorsLogContent: '',
    infoLogLines: [],
    infoLogContent: '',
    warningsLogLines: [],
    warningsLogContent: '',
  };

  jobStats = {
    progressValue: 0,
    numberOfActiveUpdateJobs: 0,
    numberOfActiveJobs: 0,
    progressJobFileExists: 0,
    pauseJobFileExists: 0,
    cancelJobFileExists: 0,
    workingOnJobs: [],
    workingOnFileNames: [],
    niceWorkingOnFileNames: '',
    jobsToResume: [],
    currentJobId: null as string | null,
  };

  constructor() {}
}
