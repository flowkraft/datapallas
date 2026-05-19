import { Component, OnInit } from '@angular/core';
import { LicenseService } from '../../providers/license.service';
import { AskForFeatureService } from '../../components/ask-for-feature/ask-for-feature.service';
import { SamplesService } from '../../providers/samples.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import Utilities from '../../helpers/utilities';
import { StateStoreService } from '../../providers/state-store.service';

const DP_THEME_KEY = 'dp-theme';
const DEFAULT_THEME = 'light';

@Component({
  selector: 'dburst-top-menu-header',
  templateUrl: './top-menu-header.template.html',
})
export class TopMenuHeaderComponent implements OnInit {
  // All 35 daisyUI v5 built-in themes (groups intentional — visual ordering only).
  ALL_THEMES = [
    'light', 'dark',
    'cupcake', 'bumblebee', 'emerald', 'corporate',
    'synthwave', 'retro', 'cyberpunk', 'valentine', 'halloween', 'garden',
    'forest', 'aqua', 'lofi', 'pastel', 'fantasy', 'wireframe', 'black',
    'luxury', 'dracula', 'cmyk', 'autumn', 'business', 'acid', 'lemonade',
    'night', 'coffee', 'winter', 'dim', 'nord', 'sunset', 'caramellatte',
    'abyss', 'silk',
  ];

  activeTheme = DEFAULT_THEME;

  constructor(
    protected settingsService: ConfigurationRepository,
    protected licenseService: LicenseService,
    protected askForFeatureService: AskForFeatureService,
    protected samplesService: SamplesService,
    protected storeService: StateStoreService,
  ) {}

  async ngOnInit() {
    // Track the active theme so the picker can highlight the current selection.
    // The attribute itself was already set by the boot script in index.html.
    this.activeTheme = localStorage.getItem(DP_THEME_KEY) || DEFAULT_THEME;

    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      return;
    }

    this.settingsService.configurationFiles =
      await this.settingsService.loadAllReports();

    await this.settingsService.loadAllConnections();

    await this.samplesService.fillSamplesNotes();
  }

  setTheme(name: string) {
    this.activeTheme = name;
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem(DP_THEME_KEY, name);
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
}
