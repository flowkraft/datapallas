import { Component, DestroyRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { StateStoreService } from '../../providers/state-store.service';

@Component({
  selector: 'dburst-more-settings',
  templateUrl: './more-settings.template.html',
  standalone: true,
  imports: [FormsModule],
})
export class MoreSettingsComponent {
  onCopilotUrlChanged = new Subject<string>();

  private destroyRef = inject(DestroyRef);

  constructor(
    protected settingsService: ConfigurationRepository,
    protected storeService: StateStoreService,
    protected messagesService: ToastrMessagesService,
  ) {
    this.onCopilotUrlChanged.pipe(
      debounceTime(400),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(async (newUrl) => {
      this.settingsService.xmlInternalSettings.documentburster.settings.copiloturl = newUrl;
      await this.settingsService.savePreferences(this.settingsService.xmlInternalSettings);
      this.messagesService.showInfo('AI Assistant URL saved');
    });
  }

  show() {
    (document.getElementById('moreSettingsModal') as HTMLDialogElement)?.showModal();
  }

  close() {
    (document.getElementById('moreSettingsModal') as HTMLDialogElement)?.close();
  }

  onDialogClick(_event: MouseEvent) {
    this.close();
  }

  async onShowSamplesChanged(checked: boolean) {
    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      alert('To use DataPallas, Java 17 (or newer) must be installed on your computer.');
      return;
    }
    this.settingsService.xmlInternalSettings.documentburster =
      await this.settingsService.loadPreferences();
    this.settingsService.xmlInternalSettings.documentburster.settings.showsamples = checked;
    await this.settingsService.savePreferences(this.settingsService.xmlInternalSettings);
    this.messagesService.showInfo(
      checked
        ? 'Sample connections, reports & cubes are now visible'
        : 'Samples are now hidden',
    );
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    this.messagesService.showInfo('URL copied to clipboard!');
  }
}
