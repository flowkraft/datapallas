import { Component, OnInit } from '@angular/core';
import { LicenseService } from '../../providers/license.service';
import { AskForFeatureService } from '../../components/ask-for-feature/ask-for-feature.service';
import { SamplesService } from '../../providers/samples.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import Utilities from '../../helpers/utilities';
import { StateStoreService } from '../../providers/state-store.service';

@Component({
  selector: 'dburst-top-menu-header',
  templateUrl: './top-menu-header.template.html',
})
export class TopMenuHeaderComponent implements OnInit {
  constructor(
    protected settingsService: ConfigurationRepository,
    protected licenseService: LicenseService,
    protected askForFeatureService: AskForFeatureService,
    protected samplesService: SamplesService,
    protected storeService: StateStoreService,
  ) {}

  async ngOnInit() {
    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      //alert(
      //  'To use DataPallas, Java 11 (or newer) must be installed on your computer.',
      //);
      return;
    }

    //console.log('TopMenuHeaderComponent');
    this.settingsService.configurationFiles =
      await this.settingsService.loadAllReports();

    await this.settingsService.loadAllConnections();

    await this.samplesService.fillSamplesNotes();
  }

  onAskForFeatureModalShow() {
    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      alert(
        'To use DataPallas, Java 17 (or newer) must be installed on your computer.',
      );
      return;
    }

    this.askForFeatureService.showAskForFeature({});
  }

  isRunningInsideElectron(): boolean {
    return Utilities.isRunningInsideElectron();
  }

  toggleControlSidebar() {
    document.body.classList.toggle('control-sidebar-open');
  }

}