import { Injectable } from '@angular/core';
import { CfgTmplFileInfo } from './configuration-repository.service';

@Injectable({
  providedIn: 'root',
})
export class ProcessingService {
  procBurstInfo = {
    inputFile: null,
    inputFileName: '',
    prefilledInputFilePath: '',
    prefilledConfigurationFilePath: '',
    isSample: false,
  };

  procReportingMailMergeInfo = {
    inputFile: null,
    inputFileName: '',
    prefilledInputFilePath: '',
    prefilledConfigurationFilePath: '',
    isSample: false,
    selectedMailMergeClassicReport: null as CfgTmplFileInfo,
  };

  procMergeBurstInfo = {
    inputFiles: [],
    inputFilesNames: [],
    shouldBurstResultedMergedFile: false,
    mergedFileName: 'merged.pdf',
    selectedFile: null,
  };

  procQualityAssuranceInfo = {
    inputFile: null,
    inputFileName: '',
    // Set when QA is armed from a report that takes NO input file (ds.scriptfile / ds.sqlquery /
    // ds.jasper). It is then the only thing identifying what is being tested, since there is no
    // file name to show — the QA tab labels itself off this.
    reportName: '',
    prefilledInputFilePath: '',
    prefilledConfigurationFilePath: '',
    whichAction: 'burst',
    mode: 'ta',
    listOfTokens: '',
    numberOfRandomTokens: '2',
    testEmailServerStatus: 'stopped',
    testEmailServerUrl: '',
  };
}
