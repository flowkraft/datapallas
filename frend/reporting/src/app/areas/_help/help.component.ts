import {
  Component,
  OnInit,
  ChangeDetectorRef,
  ViewChild,
  TemplateRef,
  AfterViewChecked,
  AfterViewInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

//import RSS from 'vanilla-rss';

import { leftMenuTemplate } from './templates/_left-menu';
import { tabsTemplate } from './templates/_tabs';

import { tabSupportTemplate } from './templates/tab-support';
import { tabDocumentationTemplate } from './templates/tab-documentation';
import { tabServicesTemplate } from './templates/tab-services';
import { tabExamplesTemplate } from './templates/tab-examples';
import { tabReviewsTemplate } from './templates/tab-reviews';
import { tabBlogTemplate } from './templates/tab-blog';
import { tabAboutTemplate } from './templates/tab-about';
import { tabJavaTemplate } from './templates/tab-java';
import { tabTerminalTemplate } from './templates/tab-terminal';
import { tabAppsTemplate } from './templates/tab-apps';
import { tabStarterPacksTemplate } from './templates/tab-starter-packs';
import { tabExtraPackagesTemplate } from './templates/tab-extra-packages';
import { tabSystemDiagnosticsTemplate } from './templates/tab-system-diagnostics';
import { tabUpdateTemplate } from './templates/tab-update';
import { tabComparisonTemplate } from './templates/tab-comparison';
import { tabLogsTemplate } from './templates/tab-logs';
import { tabLicenseTemplate } from './templates/tab-license';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import Utilities from '../../helpers/utilities';
import { StateStoreService } from '../../providers/state-store.service';
//import { ElectronService } from '../../core/services/electron/electron.service';

@Component({
  selector: 'dburst-help',
  template: `
    <aside class="app-sidebar fixed overflow-y-auto z-[810]"
           style="top:calc(50px + var(--cet-offset)); left:0; bottom:30px; width:230px; background-color:var(--app-sidebar-bg); border-right:1px solid var(--app-sidebar-border);">
      ${leftMenuTemplate}
    </aside>
    <div class="relative" style="margin-left:230px; padding-top:calc(50px + var(--cet-offset)); min-height:calc(100vh - 80px - var(--cet-offset));">
      <section class="content"><div>${tabsTemplate}</div></section>
    </div>
    ${tabSupportTemplate} ${tabDocumentationTemplate} ${tabServicesTemplate}
    ${tabExamplesTemplate} ${tabReviewsTemplate} ${tabBlogTemplate}
    ${tabJavaTemplate} ${tabTerminalTemplate} ${tabAppsTemplate} ${tabStarterPacksTemplate}
    ${tabExtraPackagesTemplate} ${tabSystemDiagnosticsTemplate}
    ${tabUpdateTemplate} ${tabAboutTemplate} ${tabComparisonTemplate}
    ${tabLogsTemplate} ${tabLicenseTemplate}
  `,
})
export class HelpComponent implements OnInit, AfterViewChecked, AfterViewInit {
  @ViewChild('tabSupportTemplate', { static: true })
  tabSupportTemplate: TemplateRef<any>;
  @ViewChild('tabDocumentationTemplate', { static: true })
  tabDocumentationTemplate: TemplateRef<any>;
  @ViewChild('tabServicesTemplate', { static: true })
  tabServicesTemplate: TemplateRef<any>;

  @ViewChild('tabExamplesTemplate', { static: true })
  tabExamplesTemplate: TemplateRef<any>;
  @ViewChild('tabFreeTemplate', { static: true })
  tabFreeTemplate: TemplateRef<any>;
  @ViewChild('tabReviewsTemplate', { static: true })
  tabReviewsTemplate: TemplateRef<any>;

  @ViewChild('tabBlogTemplate', { static: true })
  tabBlogTemplate: TemplateRef<any>;

  @ViewChild('tabJavaTemplate', { static: true })
  tabJavaTemplate: TemplateRef<any>;

  @ViewChild('tabTerminalTemplate', { static: true })
  tabTerminalTemplate: TemplateRef<any>;

  @ViewChild('tabAppsTemplate', { static: true })
  tabAppsTemplate: TemplateRef<any>;

  @ViewChild('tabStarterPacksTemplate', { static: true })
  tabStarterPacksTemplate: TemplateRef<any>;

  @ViewChild('tabExtraPackagesTemplate', { static: true })
  tabExtraPackagesTemplate: TemplateRef<any>;

  @ViewChild('tabSystemDiagnosticsTemplate', { static: true })
  tabSystemDiagnosticsTemplate: TemplateRef<any>;

  @ViewChild('tabUpdateTemplate', { static: true })
  tabUpdateTemplate: TemplateRef<any>;

  @ViewChild('tabAboutTemplate', { static: true })
  tabAboutTemplate: TemplateRef<any>;
  @ViewChild('tabComparisonTemplate', { static: true })
  tabComparisonTemplate: TemplateRef<any>;

  @ViewChild('tabLogsTemplate', { static: true })
  tabLogsTemplate: TemplateRef<any>;
  @ViewChild('tabLicenseTemplate', { static: true })
  tabLicenseTemplate: TemplateRef<any>;

  protected visibleTabs: {
    id: string;
    heading: string;
    ngTemplateOutlet: string;
  }[];

  ALL_TABS = [
    {
      id: 'supportTab',
      heading: 'AREAS.HELP.TABS.SUPPORT',
      ngTemplateOutlet: 'tabSupportTemplate',
    },
    {
      id: 'docsTab',
      heading: 'AREAS.HELP.TABS.DOCUMENTATION',
      ngTemplateOutlet: 'tabDocumentationTemplate',
    },
    {
      id: 'servicesTab',
      heading: 'AREAS.HELP.TABS.SERVICES',
      ngTemplateOutlet: 'tabServicesTemplate',
    },
    {
      id: 'useCasesTab',
      heading: 'AREAS.HELP.TABS.EXAMPLES',
      ngTemplateOutlet: 'tabExamplesTemplate',
    },
    {
      id: 'freeForSchoolsTab',
      heading: 'AREAS.HELP.TABS.FREE',
      ngTemplateOutlet: 'tabFreeTemplate',
    },
    {
      id: 'reviewsTab',
      heading: 'AREAS.HELP.TABS.REVIEWS',
      ngTemplateOutlet: 'tabReviewsTemplate',
    },
    {
      id: 'blogTab',
      heading: 'AREAS.HELP.TABS.BLOG',
      ngTemplateOutlet: 'tabBlogTemplate',
    },
    {
      id: 'javaTab',
      heading: 'AREAS.HELP.TABS.JAVA',
      ngTemplateOutlet: 'tabJavaTemplate',
    },
    {
      id: 'systemDiagnosticsTab',
      heading: 'AREAS.HELP.TABS.SYSTEM-DIAGNOSTICS',
      ngTemplateOutlet: 'tabSystemDiagnosticsTemplate',
    },
    {
      id: 'terminalTab',
      heading: 'AREAS.HELP.TABS.TERMINAL',
      ngTemplateOutlet: 'tabTerminalTemplate',
    },
    {
      id: 'updateTab',
      heading: 'AREAS.HELP.TABS.UPDATE',
      ngTemplateOutlet: 'tabUpdateTemplate',
    },
    {
      id: 'appsTab',
      heading: 'AREAS.HELP.TABS.APPS',
      ngTemplateOutlet: 'tabAppsTemplate',
    },
    {
      id: 'starterPacksTab',
      heading: 'AREAS.HELP.TABS.STARTER-PACKS',
      ngTemplateOutlet: 'tabStarterPacksTemplate',
    },
    {
      id: 'extraPackagesTab',
      heading: 'AREAS.HELP.TABS.EXTRA-PACKAGES',
      ngTemplateOutlet: 'tabExtraPackagesTemplate',
    },
    {
      id: 'aboutTab',
      heading: 'AREAS.HELP.TABS.ABOUT',
      ngTemplateOutlet: 'tabAboutTemplate',
    },
    {
      id: 'comparisonTab',
      heading: 'AREAS.HELP.TABS.COMPARISON',
      ngTemplateOutlet: 'tabComparisonTemplate',
    },
    {
      id: 'licenseTab',
      heading: 'SHARED-TABS.LICENSE',
      ngTemplateOutlet: 'tabLicenseTemplate',
    },
    {
      id: 'logsTab',
      heading: 'SHARED-TABS.LOGGING-TRACING',
      ngTemplateOutlet: 'tabLogsTemplate',
    },
  ];

  MENU_SELECTED_X_VISIBLE_TABS = [
    {
      selectedMenu: 'supportMenuSelected',
      visibleTabs: ['supportTab', 'licenseTab', 'logsTab'],
    },
    {
      selectedMenu: 'appsMenuSelected',
      visibleTabs: ['appsTab', 'starterPacksTab', 'extraPackagesTab', 'licenseTab'],
    },
    {
      selectedMenu: 'servicesMenuSelected',
      visibleTabs: ['servicesTab', 'licenseTab'],
    },
    {
      selectedMenu: 'docsMenuSelected',
      visibleTabs: ['docsTab', 'licenseTab'],
    },
    {
      selectedMenu: 'useCasesMenuSelected',
      visibleTabs: ['useCasesTab', 'licenseTab'],
    },
    {
      selectedMenu: 'freeForSchoolsMenuSelected',
      visibleTabs: ['freeForSchoolsTab', 'licenseTab'],
    },
    {
      selectedMenu: 'reviewsMenuSelected',
      visibleTabs: ['reviewsTab', 'licenseTab'],
    },
    {
      selectedMenu: 'blogMenuSelected',
      visibleTabs: ['blogTab', 'licenseTab'],
    },
    {
      selectedMenu: 'installSetupMenuSelected',
      visibleTabs: [
        'javaTab',
        'systemDiagnosticsTab',
        'terminalTab',
        'updateTab',
        'licenseTab',
      ],
    },
    {
      selectedMenu: 'licenseMenuSelected',
      visibleTabs: ['licenseTab', 'logsTab'],
    },
    {
      selectedMenu: 'aboutMenuSelected',
      visibleTabs: ['aboutTab', 'comparisonTab', 'licenseTab'],
    },
  ];

  //rssParser: typeof RSS;

  currentLeftMenu: string;
  activeTabId: string = '';

  get activeTabIndex(): number {
    if (!this.activeTabId) return 0;
    const idx = this.visibleTabs.findIndex(t => t.id === this.activeTabId);
    return idx >= 0 ? idx : 0;
  }

  constructor(
    protected route: ActivatedRoute,
    protected changeDetectorRef: ChangeDetectorRef,
    protected settingsService: ConfigurationRepository,
    protected storeService: StateStoreService,
    //protected electronService: ElectronService,
  ) {}

  async ngOnInit() {
    this.settingsService.currentConfigurationTemplateName = '';
    this.settingsService.currentConfigurationTemplatePath = '';

    this.route.params.subscribe(async (params) => {
      if (params.leftMenu) {
        this.currentLeftMenu = params.leftMenu;
      } else {
        this.currentLeftMenu = 'supportMenuSelected';
      }

      this.refreshTabs();
    });

    this.route.queryParams.subscribe(queryParams => {
      const activeTabParam = queryParams['activeTab'];
      if (activeTabParam && this.visibleTabs.some(tab => tab.id === activeTabParam)) {
        this.activeTabId = activeTabParam;
      } else {
        this.activeTabId = this.visibleTabs.length > 0 ? this.visibleTabs[0].id : '';
      }
    });
  }

  ngAfterViewInit() {
    // activeTabIndex getter drives dp-tabs [activeIndex] binding — no DOM click needed
  }

  ngAfterViewChecked() {
    this.refreshBlogRss();
  }

  refreshTabs() {
    this.visibleTabs = [];
    this.changeDetectorRef.detectChanges();

    const visibleTabsIds = this.MENU_SELECTED_X_VISIBLE_TABS.find((item) => {
      return item.selectedMenu === this.currentLeftMenu;
    }).visibleTabs;

    this.visibleTabs = this.ALL_TABS.filter((item) => {
      return visibleTabsIds.includes(item.id);
    });
  }

  isRunningInsideElectron(): boolean {
    return Utilities.isRunningInsideElectron();
  }

  refreshBlogRss() {
    if (this.currentLeftMenu !== 'blogMenuSelected') {
      return;
    }

    /*
    const blogEntriesFetchedCount = document.querySelectorAll(
      '#blogRss .feed-container'
    ).length;

    if (blogEntriesFetchedCount == 0 && !this.rssParser) {
      this.rssParser = new RSS(
        document.querySelector('#blogRss'),
        'https://www.pdfburst.com/blog/feed/',
        {
          limit: 100,
          ssl: true,
          layoutTemplate: '<div class="feed-container">{entries}</div>',
          entryTemplate:
            '<a href="{url}" target="_blank"><h4>{title}</h4></a><br><br>{shortBodyPlain} <a href="{url}" target="_blank"> ... Read More</a><hr>',
        }
      );
      return this.rssParser.render();
    }
    */
  }
}
