import { Component } from '@angular/core';

import * as _ from 'lodash';

import dayjs from 'dayjs';

//import * as path from 'path';

import { Changelog, Release, parser } from 'keep-a-changelog';
import { LicenseService } from '../../../providers/license.service';
import Utilities from '../../../helpers/utilities';
import { ConfigurationRepository } from '../../../providers/configuration-repository.service';
import { FsService } from '../../../providers/fs.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../providers/api.service';
import { StateStoreService } from '../../../providers/state-store.service';

type BlogPost = {
  title: string;
  description: string;
  summary: string;
  link: string;
};

@Component({
    selector: 'dburst-whats-new',
    templateUrl: './whats-new.component.html',
    standalone: false
})
export class WhatsNewComponent {
  mode = 'news-releases';

  changeLogMarkdown: string;
  changeLog: Changelog;

  visibleRelease: Release;
  visibleReleaseIndex: number;
  visibleReleaseDate: string;

  visibleReleaseBlogPostAnnouncement: BlogPost[];

  blogPosts: BlogPost[];

  visibleBlogPost: BlogPost;
  visibleBlogPostIndex: number;

  constructor(
    private apiService: ApiService,
    protected settingsService: ConfigurationRepository,
    protected licenseService: LicenseService,
    protected fsService: FsService,
    protected stateStore: StateStoreService,
  ) {}

  async ngOnInit() {
    if (!this.stateStore.configSys.sysInfo.setup.java.isJavaOk) return;

    await this.licenseService.loadLicense();
    if (this.licenseService.changeLog) {
      this.changeLog = this.licenseService.changeLog;
      this.changeLogMarkdown =
        this.licenseService.licenseDetails.license.changelog;
    } else {
      // if the latest changelog cannot be retrieved from https://www.pdfburst.com/store
      // load the changelog from local CHANGELOG.MD file

      try {
        //const localKeepAChangelogContentPath = Utilities.slash(
        //  `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/CHANGELOG.md`,
        //);

        const localKeepAChangelogContentPath = Utilities.slash(`CHANGELOG.md`);

        this.changeLogMarkdown = await this.fsService.readAsync(
          localKeepAChangelogContentPath,
        );

        this.changeLog = parser(this.changeLogMarkdown);
      } catch {
        //this means that, probably, the file CHANGELOG.md was deleted by the user
      }
    }

    this.blogPosts = await this.getBlogPosts();

    this.handleVisibleAnnouncement('first');

    this.handleVisibleRelease('first');
  }

  async getBlogPosts(): Promise<BlogPost[]> {
    const data = await this.apiService.get('/system/info/news');
    //console.log(`data = ${JSON.stringify(data)}`);
    //const result = await Utilities.parseStringPromise(data);
    return data.channel.item;
  }

  handleVisibleAnnouncement(action: string) {
    if (action == 'first') this.visibleBlogPostIndex = 0;
    else if (action == 'next') this.visibleBlogPostIndex++;
    else this.visibleBlogPostIndex--;

    if (this.blogPosts) {
      this.visibleBlogPost = this.blogPosts[this.visibleBlogPostIndex];

      this.visibleBlogPost.summary = Utilities.getExcerpt(
        this.visibleBlogPost.description,
        this.visibleBlogPost.link,
      );
    }
  }

  handleVisibleRelease(action: string) {
    //if the changelog could not be retrieved from any source
    if (!this.changeLog) return;

    if (action == 'first') this.visibleReleaseIndex = 0;
    else if (action == 'next') this.visibleReleaseIndex++;
    else this.visibleReleaseIndex--;

    this.visibleRelease = this.changeLog.releases[this.visibleReleaseIndex];

    this.visibleReleaseDate = dayjs(this.visibleRelease.date).format(
      'DD MMM YYYY',
    );

    let versionNumber = this.visibleRelease.version.raw.trim();

    //console.log(`versionNumber = ${versionNumber}`);
    if (versionNumber.endsWith('.0'))
      versionNumber = versionNumber.replace(/.0/gi, '');

    this.visibleReleaseBlogPostAnnouncement = _.filter(this.blogPosts, (o) => {
      return o.title.includes(versionNumber);
    });
  }

  handleViewMode() {
    this.mode == 'news-releases'
      ? (this.mode = 'changelog')
      : (this.mode = 'news-releases');
  }
}
