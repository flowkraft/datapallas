import { Injectable } from '@angular/core';
import * as semver from 'semver';
import { APP_CONFIG } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AppPathsService {
  RUNNING_IN_E2E: boolean;
  SHOULD_SEND_STATS: boolean;
  isWindows: boolean = false;
  isServerVersion: boolean = false;
  isJServerStarted: boolean = false;
  product: string = 'DocumentBurster';

  version: semver.SemVer;

  LOGS_FOLDER_PATH: string;
  QUARANTINE_FOLDER_PATH: string;
  SAMPLES_FOLDER_PATH: string;
  JOBS_FOLDER_PATH: string;
  CONFIGURATION_FOLDER_PATH: string;
  CONFIGURATION_BURST_FOLDER_PATH: string;
  CONFIGURATION_REPORTS_FOLDER_PATH: string;
  CONFIGURATION_CONNECTIONS_FOLDER_PATH: string;
  CONFIGURATION_DEFAULTS_FOLDER_PATH: string;
  CONFIGURATION_SAMPLES_FOLDER_PATH: string;
  CONFIGURATION_TEMPLATES_FOLDER_PATH: string;
  INTERNAL_SETTINGS_FILE_PATH: string;
  UPDATE_JAR_FILE_PATH: string;

  constructor() {
    let process = undefined;
    if (typeof window.require === 'function') {
      process = window.require('process');
    }
    if (process) {
      this.RUNNING_IN_E2E = new Boolean(process.env.RUNNING_IN_E2E).valueOf();
      this.SHOULD_SEND_STATS = new Boolean(process.env.SHOULD_SEND_STATS).valueOf();
    }

    this.LOGS_FOLDER_PATH = `${APP_CONFIG.folders.logs}`;
    this.QUARANTINE_FOLDER_PATH = `${APP_CONFIG.folders.quarantine}`;
    this.SAMPLES_FOLDER_PATH = 'samples';
    this.JOBS_FOLDER_PATH = `${APP_CONFIG.folders.temp}`;
    this.CONFIGURATION_FOLDER_PATH = `${APP_CONFIG.folders.config}`;
    this.INTERNAL_SETTINGS_FILE_PATH = `${this.CONFIGURATION_FOLDER_PATH}/_internal/settings.xml`;
    this.CONFIGURATION_DEFAULTS_FOLDER_PATH = `${this.CONFIGURATION_FOLDER_PATH}/_defaults`;
    this.CONFIGURATION_BURST_FOLDER_PATH = `${APP_CONFIG.folders.config}/burst`;
    this.CONFIGURATION_REPORTS_FOLDER_PATH = `${APP_CONFIG.folders.config}/reports`;
    this.CONFIGURATION_SAMPLES_FOLDER_PATH = `${APP_CONFIG.folders.config}/samples`;
    this.CONFIGURATION_CONNECTIONS_FOLDER_PATH = `${APP_CONFIG.folders.config}/connections`;
    this.CONFIGURATION_TEMPLATES_FOLDER_PATH = `templates`;
  }

  getDefaultsConfigurationValuesFilePath(): string {
    return `${this.CONFIGURATION_DEFAULTS_FOLDER_PATH}/settings.xml`;
  }

  getMyReportsConfigurationValuesFilePath(): string {
    return `${this.CONFIGURATION_BURST_FOLDER_PATH}/settings.xml`;
  }
}
