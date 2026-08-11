import { Injectable } from '@angular/core';

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

  // Whether the release announcement has already been asked for in this
  // session. loadLicense() runs in ngOnInit of <dburst-whats-new>, which is
  // mounted on both the License tab and the Processing area, so without this
  // every re-creation of that component fired another call to datapallas.com —
  // a lookup that costs a curl process and answers the same thing all day.
  //
  // Set BEFORE the await, so two components mounting together cannot both get
  // past it. The service is providedIn:'root', so this is once per run of the
  // application, which is the right frequency for "is there a new version".
  private changeLogRequested = false;

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

    return this.apiService.put('/system/license/', this.licenseDetails.license);
  }

  async loadLicense() {
    //if (this.latestVersion) return;

    //console.log(`this.latestVersion = ${this.latestVersion}`);

    //console.log(`license.service.loadLicenseFileAsync()`);

    // Through the licence API rather than by reading config/_internal/license.xml directly.
    // The licence is shown on every screen that has a License tab, so every role needs it — and the
    // generic filesystem API is administrator-only, because anything that can read an arbitrary path
    // inside the installation can read config/_internal/api-key.txt and become an administrator.
    // The endpoint answers the same fields; wrapping them under `license` keeps the shape the
    // templates have always bound to.
    this.licenseDetails = {
      license: await this.apiService.get('/system/license/'),
    };

    // console.log(
    //   `loadLicenseFileAsync - this.licenseDetails = ${JSON.stringify(
    //     this.licenseDetails
    //   )}`
    // );

    if (this.licenseDetails.license.latestversion) {
      this.latestVersion = this.licenseDetails.license.latestversion;
      this.changeLogStr = this.licenseDetails.license.changelog;
    } // if it is a demo installation
    //
    // NOT `if (this.latestVersion) return;` at the top of this method, which is
    // what the commented-out line there would have done: loadLicense() also
    // re-reads the licence itself, and license.component calls it straight after
    // activate/deactivate precisely to refresh that. Skipping the whole method
    // would leave the License tab showing the old status. Only the announcement
    // lookup is skipped, because only that one goes to datapallas.com.
    else if (!this.changeLogRequested) {
      this.changeLogRequested = true;

      let changeLogResponseAsJson: any;

      try {
        changeLogResponseAsJson =
          await this.getChangeLogForTheDemoInstallationToo();
        //console.log(
        //  `changeLogResponseAsJson = ${JSON.stringify(changeLogResponseAsJson)}`,
        //);

        this.latestVersion = changeLogResponseAsJson.new_version;

        // Backend already decodes the licensing server's changelog to plain text.
        this.changeLogStr = changeLogResponseAsJson.changelog;
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
