import { Injectable } from '@angular/core';

import { unserialize } from 'php-serialize';

import * as xml2js from 'xml2js';

import { Changelog, parser } from 'keep-a-changelog';

import * as semver from 'semver';

import Utilities from '../helpers/utilities';
import { ConfigurationRepository } from './configuration-repository.service';
import { AppPathsService } from './app-paths.service';
import { FsService } from './fs.service';
import { ApiService } from './api.service';
import { ReportsService } from './reports.service';

@Injectable({
  providedIn: 'root',
})
export class LicenseService {
  protected licenseFilePath: string;

  licenseDetails: any;

  changeLogStr: string;
  changeLog: Changelog;

  latestVersion: semver.SemVer;
  isNewerVersionAvailable: boolean = false;

  constructor(
    protected settingsService: ConfigurationRepository,
    protected appPathsService: AppPathsService,
    protected reportsService: ReportsService,
    protected fsService: FsService,
    protected apiService: ApiService,
  ) {
    this.licenseFilePath = Utilities.slash(
      `${this.appPathsService.CONFIGURATION_FOLDER_PATH}/_internal/license.xml`,
    );
  }

  async saveLicense() {
    //console.log(
    //  `saveLicenseFileAsync - this.licenseDetails = ${JSON.stringify(
    //    this.licenseDetails,
    //  )}`,
    //);

    const builder = new xml2js.Builder();

    const licenseDetailsAsString = builder.buildObject(this.licenseDetails);

    //console.log(
    //  `saveLicenseFileAsync - licenseDetailsAsString = ${licenseDetailsAsString}`
    //);

    return this.fsService.writeAsync(
      this.licenseFilePath,
      licenseDetailsAsString,
    );
  }

  async loadLicense() {
    //if (this.latestVersion) return;

    //console.log(`this.latestVersion = ${this.latestVersion}`);

    //console.log(`license.service.loadLicenseFileAsync()`);

    const content = await this.fsService.readAsync(this.licenseFilePath);

    //console.log(`license.service.content = ${JSON.stringify(content)}`);

    this.licenseDetails = await Utilities.parseStringPromise(content, {
      trim: true,
      explicitArray: false,
    });

    // console.log(
    //   `loadLicenseFileAsync - this.licenseDetails = ${JSON.stringify(
    //     this.licenseDetails
    //   )}`
    // );

    if (this.licenseDetails.license.latestversion) {
      this.latestVersion = this.licenseDetails.license.latestversion;
      this.changeLogStr = this.licenseDetails.license.changelog;
    } // if it is a demo installation
    else {
      let changeLogResponseAsJson: any;

      try {
        changeLogResponseAsJson =
          await this.getChangeLogForTheDemoInstallationToo();
        //console.log(
        //  `changeLogResponseAsJson = ${JSON.stringify(changeLogResponseAsJson)}`,
        //);

        this.latestVersion = changeLogResponseAsJson.new_version;

        const { changelog } = unserialize(changeLogResponseAsJson.sections, {
          description: String,
          changelog: String,
        });
        this.changeLogStr = changelog;
      } catch {
        // Silently ignore changelog fetch failures (expected for demo/offline installations)
      }
    }

    this.isNewerVersionAvailable = false;

    if (!this.reportsService.version)
      await this.reportsService.loadDefaults();

    if (this.latestVersion && this.reportsService.version) {
      this.latestVersion = semver.coerce(this.latestVersion);
      this.reportsService.version = semver.coerce(
        this.reportsService.version,
      );

      //console.log(
      //  `this.latestVersion = ${this.latestVersion}, this.settingsService.version = ${this.settingsService.version}`
      //);

      if (semver.gt(this.latestVersion, this.reportsService.version)) {
        this.isNewerVersionAvailable = true;
      }
    }
    try {
      //the "Improved software changelog" keepachangelog format was implemented in
      //DocumentBurster v8.8.0
      this.changeLog = parser(this.changeLogStr);
    } catch {}
  }

  getChangeLogForTheDemoInstallationToo(): Promise<any> {
    return this.apiService.get(
      `/system/info/changelog?itemName=${encodeURIComponent(this.settingsService.product)}`,
    );
  }

  verifyLicense(action, exitCallback?): Promise<void> {
    const call =
      action === 'check'
        ? this.apiService.get('/system/license/status')
        : this.apiService.post(`/system/license/${action}`, {});
    return call.then(() => {
      if (exitCallback) exitCallback();
    });
  }

  deActivateLicense(exitCallback?) {
    return this.apiService.post('/system/license/deactivate', {}).then(() => {
      if (exitCallback) exitCallback();
    });
  }
}
