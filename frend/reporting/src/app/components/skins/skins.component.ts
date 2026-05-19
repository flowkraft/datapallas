import { OnInit, Component } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { StateStoreService } from '../../providers/state-store.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';

const DP_THEME_KEY = 'dp-theme';
const DEFAULT_THEME = 'light';

@Component({
  selector: 'dburst-skins',
  templateUrl: './skins.template.html',
})
export class SkinsComponent implements OnInit {
  ALL_THEMES = [
    'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate',
    'synthwave', 'retro', 'cyberpunk', 'valentine', 'halloween', 'garden',
    'forest', 'aqua', 'lofi', 'pastel', 'fantasy', 'wireframe', 'black',
    'luxury', 'dracula', 'cmyk', 'autumn', 'business', 'acid', 'lemonade',
    'night', 'coffee', 'winter', 'dim', 'nord', 'sunset', 'caramellatte',
    'abyss', 'silk',
  ];

  activeTheme = DEFAULT_THEME;

  private internalSettingsChangedSub?: Subscription;
  protected onInternalSettingsChanged = new Subject<string>();

  constructor(
    protected settingsService: ConfigurationRepository,
    protected storeService: StateStoreService,
    protected messagesService: ToastrMessagesService,
    protected router: Router,
  ) {}

  async ngOnInit() {
    // Debounced save for Copilot URL
    this.internalSettingsChangedSub = this.onInternalSettingsChanged.pipe(debounceTime(400)).subscribe(async (newUrl) => {
      this.settingsService.xmlInternalSettings.documentburster.settings.copiloturl = newUrl;
      await this.settingsService.savePreferences(
        this.settingsService.xmlInternalSettings,
      );
      this.messagesService.showInfo('Copilot/LLM URL saved');
    });

    // Restore theme from localStorage (set at bootstrap by main.ts; repeated
    // here so that the active-button highlight tracks the current selection).
    const saved = localStorage.getItem(DP_THEME_KEY) || DEFAULT_THEME;
    this.activeTheme = saved;
    this.applyTheme(saved);
  }

  ngOnDestroy() {
    this.internalSettingsChangedSub?.unsubscribe();
  }

  setTheme(name: string) {
    this.activeTheme = name;
    this.applyTheme(name);
    localStorage.setItem(DP_THEME_KEY, name);
  }

  private applyTheme(name: string) {
    document.documentElement.setAttribute('data-theme', name);
  }

  async onShowSamplesChanged(checked: boolean) {
    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      alert(
        'To use DataPallas, Java 17 (or newer) must be installed on your computer.',
      );
      return;
    }

    // Reload then mutate then save to avoid clobbering any other in-flight
    // preference changes.
    this.settingsService.xmlInternalSettings.documentburster =
      await this.settingsService.loadPreferences();

    this.settingsService.xmlInternalSettings.documentburster.settings.showsamples =
      checked;

    await this.settingsService.savePreferences(
      this.settingsService.xmlInternalSettings,
    );

    this.messagesService.showInfo(
      checked ? 'Sample connections, reports & cubes are now visible' : 'Samples are now hidden',
    );
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    this.messagesService.showInfo('URL copied to clipboard!');
  }
}
