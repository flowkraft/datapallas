import { Component, OnInit, input } from '@angular/core';

//import * as jetpack from 'fs-jetpack';
//import * as slash from 'slash';

//import * as path from 'path';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

//import * as semver from 'semver';

import { updateTemplate } from './update.template';

import { UpdateInfo, Updater } from '../updater';

import Utilities from '../../../helpers/utilities';
import { LicenseService } from '../../../providers/license.service';
import { ExecutionStatsService } from '../../../providers/execution-stats.service';
import { ToastrMessagesService } from '../../../providers/toastr-messages.service';
import { UsageDetailsInfo } from '../../../models/usage-details-info.model';
import { ConfirmService } from '../../../components/dialog-confirm/confirm.service';
import { ConfigurationRepository } from '../../../providers/configuration-repository.service';
import { AppPathsService } from '../../../providers/app-paths.service';
import { ReportsService } from '../../../providers/reports.service';
import { ApiService } from '../../../providers/api.service';
import { DesktopAdminService } from '../desktop-admin.service';
import { RbElectronService } from '../electron.service';
import { FsService } from '../../../providers/fs.service';
import UtilitiesNodeJs from '../utilities-nodejs';
import UtilitiesElectron from '../utilities-electron';
import { StateStoreService } from '../../../providers/state-store.service';

@Component({
  selector: 'dburst-update',
  template: ` ${updateTemplate} `,
})
export class UpdateComponent implements OnInit {
  homeDirectoryPath: string;

  letMeUpdateManually: false;
  letMeUpdateSourceDirectoryPath: string;

  updateInfo = new UpdateInfo();
  updater: Updater;

  succint = input<boolean>(false);

  constructor(
    protected settingsService: ConfigurationRepository,
    protected appPathsService: AppPathsService,
    protected reportsService: ReportsService,
    protected licenseService: LicenseService,
    protected executionStatsService: ExecutionStatsService,
    protected confirmService: ConfirmService,
    protected messagesService: ToastrMessagesService,
    protected apiService: ApiService,
    protected desktopAdminService: DesktopAdminService,
    protected electronService: RbElectronService,
    protected fsService: FsService,
    protected storeService: StateStoreService,
  ) {
    this.homeDirectoryPath = this.electronService.PORTABLE_EXECUTABLE_DIR;
    this.updater = new Updater(this.homeDirectoryPath);
  }

  async ngOnInit(): Promise<void> {
    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      return;
    }

    this.updateInfo.updateSourceDirectoryPath =
      this.electronService.PORTABLE_EXECUTABLE_DIR;

    await this.reportsService.loadDefaults();

    this.updateInfo.productInfo.product = this.reportsService.product;

    this.updateInfo.productInfo.version = this.reportsService.version;
    this.updateInfo.productInfo.isServerVersion =
      this.reportsService.isServerVersion;
    this.updateInfo.productInfo.isWindows = this.reportsService.isWindows;

    await this.licenseService.loadLicense();

    this.updateInfo.licenseInfo.latestVersion =
      this.licenseService.licenseDetails?.license.latestversion;

    this.updateInfo.licenseInfo.key =
      this.licenseService.licenseDetails?.license.key;
    this.updateInfo.licenseInfo.customeremail =
      this.licenseService.licenseDetails?.license.customeremail;
    this.updateInfo.licenseInfo.status =
      this.licenseService.licenseDetails?.license.status;
  }

  async onExistingInstallationFolderSelected(
    oldInstallationFolderPath: string,
  ) {
    if (oldInstallationFolderPath) {
      this.letMeUpdateSourceDirectoryPath = oldInstallationFolderPath;

      if (oldInstallationFolderPath.includes('playwright/'))
        this.letMeUpdateSourceDirectoryPath = `${Utilities.getParentFolderPath(
          this.electronService.PORTABLE_EXECUTABLE_DIR,
        )}/upgrade/baseline/DocumentBurster`;

      this.updateInfo.errorMsg = '';
      this.updateInfo.mode = 'migrate-copy';

      //console.log(
      //  `this.letMeUpdateSourceDirectoryPath : ${this.letMeUpdateSourceDirectoryPath}`,
      //);

      this.updateInfo.updateSourceDirectoryPath =
        this.letMeUpdateSourceDirectoryPath;

      this.updateInfo = await this.updater.fillUpdateInfo(this.updateInfo);
    }
  }

  async handleUpdateNow() {
    const dialogQuestion =
      'The update will take a few minutes, grab a glass of water and wait patiently until it is done.';

    this.confirmService.askConfirmation({
      confirmLabel: "OK, I'll wait for the update to finish.",
      message: dialogQuestion,
      confirmAction: async () => {
        this.updateInfo.mode = 'update-now';
        await this.doUpdate();
      },
    });
  }

  async handleMigrateCopyAboveFiles() {
    const dialogQuestion =
      'All the existing configuration files (i.e. settings.xml) and scripts could be overridden, are you sure you want to continue? The update will take some time, please wait patiently until it is done.';

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        this.updateInfo.mode = 'migrate-copy';
        await this.doUpdate();

        await this.licenseService.loadLicense();

        if (this.licenseService.licenseDetails.license.key)
          await this.licenseService.verifyLicense('check');

        this.settingsService.configurationFiles =
          await this.settingsService.loadAllReports({
            forceReload: true,
          });

        await this.licenseService.loadLicense();

        this.letMeUpdateManually = false;
        this.letMeUpdateSourceDirectoryPath = '';

        this.updateInfo = new UpdateInfo();

        // this._changeDetectorRef.detectChanges();

        /*
          this.updateInfo.licenseInfo.key = this._licenseService.licenseDetails.license.key;
          this.updateInfo.licenseInfo.customeremail = this._licenseService.licenseDetails.license.customeremail;
          this.updateInfo.licenseInfo.status = this._licenseService.licenseDetails.license.status;

        */
      },
    });
  }

  /*
  async createJobFile(): Promise<string> {
    const filePath = `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/updating DocumentBurster, please wait`;
    const jobType = 'update';

    const jobFileName = Utilities.getRandomJobFileName();

    const jobFilePath = `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/temp/${jobFileName}`;
    const jobFileContent = Utilities.getJobFileContent(
      filePath,
      jobType,
      '14234234324324'
    );

    await this.fsService.writeAsync(jobFilePath, jobFileContent);

    return Promise.resolve(
      Utilities.slash(this.electronService.path.resolve(jobFilePath))
    );
  }

  */

  async backupExistingConfiguration() {
    const nowFormatted = dayjs().utc().format('YYYY-MM-DD HH-mm-ss');

    // Creates directory if doesn't exist
    const backupFolderPath = `${this.electronService.PORTABLE_EXECUTABLE_DIR}/backup/config-files-before-updating/${this.reportsService.version}/${nowFormatted}`;

    //console.log(`dirAsync.backupFolderPath: ${backupFolderPath}`);
    await UtilitiesNodeJs.dirAsync(backupFolderPath);

    await UtilitiesNodeJs.copyAsync(
      `${this.electronService.PORTABLE_EXECUTABLE_DIR}`,
      backupFolderPath,
      { matching: ['config/**/*'], overwrite: true },
    );
    await UtilitiesNodeJs.copyAsync(
      `${this.electronService.PORTABLE_EXECUTABLE_DIR}`,
      backupFolderPath,
      { matching: ['scripts/**/*'], overwrite: true },
    );
    await UtilitiesNodeJs.copyAsync(
      `${this.electronService.PORTABLE_EXECUTABLE_DIR}`,
      backupFolderPath,
      { matching: ['templates/**/*'], overwrite: true },
    );
  }

  async doUpdate() {
    const start = this.electronService.clock();

    let updateError: Error = null;

    this.updateInfo.jobFilePath =
      await this.desktopAdminService.createJobFile('update');

    try {
      this.executionStatsService.jobStats.numberOfActiveUpdateJobs = 1;

      if (this.updateInfo.mode == 'migrate-copy')
        await this.backupExistingConfiguration();

      this.updateInfo = await this.updater.fillUpdateInfo(this.updateInfo);

      await this.updater.doUpdate(this.updateInfo);

      if (this.updateInfo.mode == 'update-now') {
        //START - REMOVE THIS AFTER FEW RELEASES (when the jar will be there)
        let updateJarExists = await UtilitiesNodeJs.existsAsync(
          this.appPathsService.UPDATE_JAR_FILE_PATH,
        );
        if (!updateJarExists) {
          // console.log(`from: ${this._updater.upgdDbTempDirectoryPath}/from/DocumentBurster/lib/burst/${this.electronService.path.basename(this._appPathsService.UPDATE_JAR_FILE_PATH)}, to: ${this.appPathsService.UPDATE_JAR_FILE_PATH}`)
          await UtilitiesNodeJs.copyAsync(
            `${
              this.updater.upgdDbTempDirectoryPath
            }/from/DocumentBurster/lib/burst/${Utilities.basename(
              this.appPathsService.UPDATE_JAR_FILE_PATH,
            )}`,
            this.appPathsService.UPDATE_JAR_FILE_PATH,
          );
        }
        //END - REMOVE THIS AFTER FEW RELEASES (when the jar will be there)

        await this.licenseService.loadLicense();

        if (this.licenseService.licenseDetails.license.key)
          await this.licenseService.verifyLicense('check');

        await this.apiService.post('/system/update/apply', {
          jobFilePath: this.updateInfo.jobFilePath,
        });
      }

      this.messagesService.showInfo('Update Done!');
    } catch (e) {
      updateError = e;

      //console.log(`error doUpdate: ${e}`);

      await UtilitiesElectron.logAsync(updateError.stack, 'error');

      if (updateError.message.includes('zip'))
        this.messagesService.showError(
          "Ups, there was an update error. Please try to 'Update Now' again!",
        );
      else this.messagesService.showError('Update Error!');
    } finally {
      await UtilitiesElectron.logAsync(
        `Updater.updateDestinationDirectoryPath: ${this.updater.updateDestinationDirectoryPath}`,
        'info',
      );

      if (this.updateInfo.mode == 'update-now') {
        await UtilitiesElectron.logAsync(
          `Updater.upgdDbTempDirectoryPath: ${this.updater.upgdDbTempDirectoryPath}`,
          'info',
        );
        await UtilitiesElectron.logAsync(
          `Updater.backupZipFileName: ${this.updater.backupZipFileName}`,
          'info',
        );
      }

      await UtilitiesElectron.logAsync(
        `Updater.updateInfo: ${JSON.stringify(this.updateInfo)}`,
        'info',
      );

      const duration = this.electronService.clock(start)[0];

      await UtilitiesElectron.logAsync(
        `Updater.Duration: ${Math.round(duration / 1000)} seconds`,
        'info',
      );

      if (this.settingsService.SHOULD_SEND_STATS)
        this.doStats(this.updateInfo, updateError, duration);

      this.executionStatsService.jobStats.numberOfActiveUpdateJobs = 0;

      this.letMeUpdateSourceDirectoryPath = null;
      this.letMeUpdateManually = false;

      //console.log(
      //  `removeAsync this.updateInfo.jobFilePath: ${this.updateInfo.jobFilePath}`,
      //);
      return UtilitiesNodeJs.removeAsync(
        `${this.electronService.PORTABLE_EXECUTABLE_DIR}/${this.updateInfo.jobFilePath}`,
      );
    }
  }

  doStats(updateInfo: UpdateInfo, err: Error, executionTime) {
    let eventDetails = 'update';

    if (updateInfo.mode == 'update-now') eventDetails += '-now';
    else eventDetails += '-letme';

    if (this.reportsService.isServerVersion) eventDetails += '-dbs';
    else eventDetails += '-db';

    eventDetails = `${eventDetails}-${updateInfo.updateSourceVersion}-to-${this.reportsService.version}`;

    if (this.reportsService.isWindows) eventDetails += '-win';
    else eventDetails += '-linux';

    eventDetails = `${eventDetails}-${Math.round(executionTime / 1000)}sec`;
    const tt = new UsageDetailsInfo();

    tt.text1 = eventDetails;

    tt.code1 = this.licenseService.licenseDetails.key;
    tt.code2 = this.licenseService.licenseDetails.customeremail;

    tt.status1 = this.licenseService.licenseDetails.status;
    tt.status2 = 'COMPLETED';

    if (err) {
      tt.status2 = 'FAILED';

      //tt.clob1 = this.electronService.stackUtils.clean(err.stack);
    }

    tt.clob2 = JSON.stringify(updateInfo);

    Utilities.httpPost(Utilities.TT_URL, tt);
  }
}
