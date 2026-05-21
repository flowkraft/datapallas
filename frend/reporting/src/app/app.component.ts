import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { RbElectronService } from './areas/electron-nodejs/electron.service';
import { Router } from '@angular/router';
import { AreasComponent } from './areas/areas.component';
import { LiveChatComponent } from './components/live-chat/live-chat.component';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: true,
    imports: [AreasComponent, LiveChatComponent],
})
export class AppComponent implements OnInit {
  constructor(
    protected electronService: RbElectronService,
    protected translate: TranslateService,
    protected router: Router,
  ) {
    this.translate.setDefaultLang('en');

    if (this.electronService.isElectron) {
      new this.electronService.cet.Titlebar({
        backgroundColor: this.electronService.cet.Color.fromHex('#FFF'),
        menu: null,
        maximizable: true,
        shadow: true,
        icon: null,
      });
      document.documentElement.classList.add('in-electron');

      try {
        const ipcRenderer = (window as any).require?.('electron')?.ipcRenderer;

        // helper: try to find an element using multiple fallbacks
        const findEl = (candidates: string[]) => {
          for (const s of candidates) {
            const el = document.querySelector(s);
            if (el) return el as HTMLElement;
          }
          return null;
        };

        // robust attach with polling (wait for Titlebar DOM to appear)
        const attachWhenReady = (maxWaitMs = 3000, intervalMs = 100) => {
          let waited = 0;
          const tick = () => {
            // real class names from DOM: cet-window-minimize, cet-max-restore, cet-window-close
            const minBtn = findEl([
              '.custom-electron-titlebar .cet-window-minimize',
              '.cet .cet-window-minimize',
              '.cet-window-minimize',
            ]);
            const maxBtn = findEl([
              '.custom-electron-titlebar .cet-max-restore',
              '.cet .cet-max-restore',
              '.cet-max-restore',
            ]);
            const closeBtn = findEl([
              '.custom-electron-titlebar .cet-window-close',
              '.cet .cet-window-close',
              '.cet-window-close',
            ]);

            if (ipcRenderer) {
              if (minBtn) {
                minBtn.removeEventListener?.('click', () => {}); // harmless attempt
                minBtn.addEventListener('click', () => ipcRenderer.send('window-minimize'));
              }
              if (maxBtn) {
                maxBtn.removeEventListener?.('click', () => {});
                maxBtn.addEventListener('click', () => ipcRenderer.send('window-toggle-maximize'));
              }
              if (closeBtn) {
                closeBtn.removeEventListener?.('click', () => {});
                closeBtn.addEventListener('click', () => ipcRenderer.send('window-close'));
              }

              // wire native events to update UI state
              if (maxBtn) {
                const setMaxed = () => maxBtn.classList.add('is-maximized');
                const setUnmaxed = () => maxBtn.classList.remove('is-maximized');
                ipcRenderer.on('window-maximized', setMaxed);
                ipcRenderer.on('window-unmaximized', setUnmaxed);
              }
            }

            // if we attached at least one button, stop polling
            if (minBtn || maxBtn || closeBtn) return;
            waited += intervalMs;
            if (waited >= maxWaitMs) return;
            setTimeout(tick, intervalMs);
          };
          setTimeout(tick, 0);
        };

        attachWhenReady();
      } catch (err) {
        // no-op if not running in electron dev
      }
    } else {
      //console.log('Run in browser');
    }

    
  }

  ngOnInit() {
    this.router.initialNavigation(); // manually start the initial navigation
  }

}
