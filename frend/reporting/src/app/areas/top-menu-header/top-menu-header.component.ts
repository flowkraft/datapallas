import { Component, DestroyRef, ViewChild, OnInit, inject } from '@angular/core';
import { SHARED_IMPORTS } from '../../shared/shared-imports';
import { BrandComponent } from '../../components/brand/brand.component';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { LicenseService } from '../../providers/license.service';
import { AskForFeatureService } from '../../components/ask-for-feature/ask-for-feature.service';
import { SamplesService } from '../../providers/samples.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { MoreSettingsComponent } from '../../components/more-settings/more-settings.component';
import Utilities from '../../helpers/utilities';
import { StateStoreService } from '../../providers/state-store.service';

const DP_THEME_KEY = 'dp-theme';
const DEFAULT_THEME = 'light';

@Component({
    selector: 'dburst-top-menu-header',
    templateUrl: './top-menu-header.template.html',
    standalone: true,
    imports: [...SHARED_IMPORTS, BrandComponent, MoreSettingsComponent],
})
export class TopMenuHeaderComponent implements OnInit {
  @ViewChild('moreSettings') moreSettings!: MoreSettingsComponent;

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

  // Tracks whether the user explicitly opened the sidebar while on the Processing screen
  // during this session. False on every app start → Processing always begins hidden.
  private processingUserChoseVisible = false;

  private destroyRef = inject(DestroyRef);

  constructor(
    protected settingsService: ConfigurationRepository,
    protected licenseService: LicenseService,
    protected askForFeatureService: AskForFeatureService,
    protected samplesService: SamplesService,
    protected storeService: StateStoreService,
    private router: Router,
  ) {}

  async ngOnInit() {
    // Prefer the backend XML value (loaded by InitService at boot) so the theme
    // survives localStorage clears; fall back to localStorage for offline mode.
    const xmlTheme =
      this.settingsService.xmlInternalSettings.documentburster?.settings?.theme;
    this.activeTheme = xmlTheme || localStorage.getItem(DP_THEME_KEY) || DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', this.activeTheme);
    localStorage.setItem(DP_THEME_KEY, this.activeTheme);

    // Sidebar: Processing = OFF by default; all other screens = always ON.
    this.applySidebarForRoute(this.router.url);
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((e: NavigationEnd) => {
      this.applySidebarForRoute(e.urlAfterRedirects);
    });

    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      return;
    }

    this.settingsService.configurationFiles =
      await this.settingsService.loadAllReports();

    await this.settingsService.loadAllConnections();

    await this.samplesService.fillSamplesNotes();
  }

  private isProcessingRoute(url: string): boolean {
    // Covers: '' → '/', '/processing/…', '/processingSampleBurst/…',
    //         '/processingSampleGenerate/…', '/processingQa/…'
    return url === '/' || url === '' || url.startsWith('/processing');
  }

  private applySidebarForRoute(url: string): void {
    if (this.isProcessingRoute(url)) {
      // Processing: hidden by default; show only if the user opened it this session.
      if (this.processingUserChoseVisible) {
        document.documentElement.classList.add('sidebar-visible');
      } else {
        document.documentElement.classList.remove('sidebar-visible');
      }
    } else {
      // Every other screen: always show sidebar.
      document.documentElement.classList.add('sidebar-visible');
    }
  }

  async setTheme(name: string) {
    this.activeTheme = name;
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem(DP_THEME_KEY, name);

    if (!this.storeService.configSys.sysInfo.setup.java.isJavaOk) {
      return;
    }

    // Reload → mutate → save: same pattern as old skins.component.ts saveSkin()
    this.settingsService.xmlInternalSettings.documentburster =
      await this.settingsService.loadPreferences();
    this.settingsService.xmlInternalSettings.documentburster.settings.theme = name;
    await this.settingsService.savePreferences(
      this.settingsService.xmlInternalSettings,
    );
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

  /**
   * Close the daisyUI focus-based dropdowns after a selection by removing focus
   * from the active element. daisyUI's `:focus-within` selector keeps the menu
   * open as long as any descendant retains focus — including just-clicked
   * routerLinks. Blurring breaks that condition and the panel collapses.
   */
  closeDropdown(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  toggleSidebar(): void {
    const visible = document.documentElement.classList.toggle('sidebar-visible');
    // Remember the user's choice only for the Processing screen (within this session).
    if (this.isProcessingRoute(this.router.url)) {
      this.processingUserChoseVisible = visible;
    }
  }

  isRunningInsideElectron(): boolean {
    return Utilities.isRunningInsideElectron();
  }
}
