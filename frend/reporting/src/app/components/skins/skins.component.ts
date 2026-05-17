import { OnInit, Component } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { StateStoreService } from '../../providers/state-store.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';

@Component({
  selector: 'dburst-skins',
  templateUrl: './skins.template.html',
})
export class SkinsComponent implements OnInit {
  ALL_SKINS = [
    'skin-blue',
    'skin-blue-light',
    'skin-yellow',
    'skin-yellow-light',
    'skin-green',
    'skin-green-light',
    'skin-purple',
    'skin-purple-light',
    'skin-red',
    'skin-red-light',
    'skin-black',
    'skin-black-light',
  ];

  bodyElement = document.getElementsByTagName('body')[0];

  private internalSettingsChangedSub?: Subscription;
  protected onInternalSettingsChanged = new Subject<string>();
  
  constructor(
    protected settingsService: ConfigurationRepository,
    protected storeService: StateStoreService,
    protected messagesService: ToastrMessagesService,
    protected router: Router,
  ) {}

  async ngOnInit() {
    // Internal preferences are loaded at app bootstrap by InitService so that
    // settingsService.showSamples is correct everywhere, including when this
    // skins component is hidden (RUNNING_IN_E2E=true). The post-save reload
    // calls in saveTheme() / onShowSamplesChanged() below stay as they are —
    // they re-sync the local model after writing.

   // Debounced save for Copilot URL
    this.internalSettingsChangedSub = this.onInternalSettingsChanged.pipe(debounceTime(400)).subscribe(async (newUrl) => {
      this.settingsService.xmlInternalSettings.documentburster.settings.copiloturl = newUrl;
      await this.settingsService.savePreferences(
        this.settingsService.xmlInternalSettings,
      );
      this.messagesService.showInfo('Copilot/LLM URL saved');
    });   

    //console.log(
    //  `this.settingsService.xmlInternalSettings = ${JSON.stringify(
    //    this.settingsService.xmlInternalSettings
    //  )}`
    //);
    if (!this.settingsService.xmlInternalSettings.documentburster) return;

    let skin =
      this.settingsService.xmlInternalSettings.documentburster.settings.skin;

    if (!skin) skin = 'skin-black';

    this.applySkin(skin);
  }

  ngOnDestroy() {
    this.internalSettingsChangedSub?.unsubscribe();
  }

  async changeSkin(skin: string) {
    this.applySkin(skin);

    await this.saveSkin(skin);
  }

  applySkin(skin: string) {
    if (skin) {
      for (let eachSkin of this.ALL_SKINS) {
        setTimeout(() => {
          this.bodyElement.classList.remove(eachSkin);
        });
      }

      setTimeout(() => {
        this.bodyElement.classList.add(skin);
      });
    }
  }

  async saveSkin(newSkin: string) {
    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      alert(
        'To use DataPallas, Java 17 (or newer) must be installed on your computer.',
      );
      return;
    }

    this.settingsService.xmlInternalSettings.documentburster =
      await this.settingsService.loadPreferences();

    this.settingsService.xmlInternalSettings.documentburster.settings.skin =
      newSkin;

    await this.settingsService.savePreferences(
      this.settingsService.xmlInternalSettings,
    );
  }

  async onShowSamplesChanged(checked: boolean) {
    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      alert(
        'To use DataPallas, Java 17 (or newer) must be installed on your computer.',
      );
      return;
    }

    // Reload then mutate then save (same pattern as saveSkin) to avoid clobbering
    // any other in-flight preference changes.
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
