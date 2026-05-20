export const tabBurstTemplate = `<ng-template #tabBurstTemplate>
  <div class="space-y-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-bottom: 5px">
      <div style="grid-column:span 2">
        PDF / Excel {{ 'AREAS.PROCESSING.TAB-BURST.FILE' | translate }}
      </div>
      <div style="grid-column:span 7">
        <input
          id="burstFile"
          [ngModel]="processingService.procBurstInfo.isSample ? processingService.procBurstInfo.prefilledInputFilePath : processingService.procBurstInfo.inputFileName"
          (ngModelChange)="processingService.procBurstInfo.inputFileName = $event"
          class="input"
          [disabled]="!this.storeService.configSys.sysInfo.setup.java.isJavaOk"
          autofocus
          required
        />
      </div>

      <div style="grid-column:span 3">
        <label for="burstFileUploadInput" class="btn btn-outline w-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"/></svg>&nbsp;Select File</label>
        <input style="display: none;" type="file" id="burstFileUploadInput" (change)="onBurstFileSelected($event)" accept=".pdf" #burstFileUploadInput  [disabled]="!storeService.configSys.sysInfo.setup.java.isJavaOk"
        />
      <!--
      <dburst-button-native-system-dialog
          value="{{
          'COMPONENTS.BUTTON-NATIVE-SYSTEM-DIALOG.SELECT-FILE' | translate }}"
          dialogType="file"
          (pathsSelected)="onBurstFileSelected($event)"
        ></dburst-button-native-system-dialog>
        -->
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-bottom: 5px">
      <div style="grid-column:span 2"></div>

      <div style="grid-column:span 1;margin-right: 20px">
        <button
          id="btnBurst"
          type="button"
          class="btn btn-primary"
          (click)="doBurst()"
          [disabled]="(!processingService.procBurstInfo.prefilledInputFilePath && !processingService.procBurstInfo.inputFileName) || executionStatsService.jobStats.numberOfActiveJobs > 0"  >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg>&nbsp;Burst
        </button>
      </div>

      <div style="grid-column:span 3">
        <dburst-button-clear-logs btnId="btnClearLogsBurstReportsTab"></dburst-button-clear-logs>
      </div>

      <div style="grid-column:span 3;padding-left: 1rem">
        <a id="seeHowToBurst" href="https://datapallas.com/docs/report-bursting" target="_blank">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>&nbsp;<span>see how</span>
        </a>
        <!--
        <dburst-button-native-system-dialog style="display: none;"
          value="{{
          'AREAS.PROCESSING.TAB-BURST.VIEW-REPORTS' | translate }}"
          dialogType="file"
        >
        </dburst-button-native-system-dialog>
          -->
      </div>
    </div>

    @if (!storeService.configSys.sysInfo.setup.java.isJavaOk && !storeService.configSys.sysInfo.setup.java.version) {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <br /><br />
      <span class="badge badge-warning"
        ><strong
          ><em>Java</em>
          {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.NOT-FOUND' | translate
          }}
        </strong></span
      >
      <br /><br />

      <span
        id="checkPointJavaPreRequisite"
        [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.REQUIRED-SHORT' | translate"
      ></span>
      <span
        [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.REQUIRED-LONG' | translate"
      ></span>

      <br /><br /><span
        [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.EXTRA' | translate"
      ></span>

      <br /><br />

      <a href="#" [routerLink]="['/help', 'installSetupMenuSelected']"
      skipLocationChange="true"><button id="btnInstallJavaTabBurst" type="button" class="btn btn-primary">
          {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INSTALL' | translate }}
          <em>Java</em>
        </button></a
      >
    </div>
    }

    @if (!storeService.configSys.sysInfo.setup.java.isJavaOk && storeService.configSys.sysInfo.setup.java.version) {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <br /><br />
      <span id="javaInstallationOld" class="badge badge-warning"
        ><strong
          ><em>Java</em>
          {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.TOO-OLD' | translate
          }}
        </strong></span
      >

      <br /><br />

      <span
        id="checkPointJavaPreRequisite"
        [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.REQUIRED-SHORT' | translate"
      ></span>

      <br /><br />

      <span
        [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.TOO-OLD' | translate"
      ></span>

    </div>
    }

    @if (!executionStatsService.logStats.foundDirtyLogFiles && executionStatsService.jobStats.numberOfActiveJobs === 0 && executionStatsService.jobStats.jobsToResume.length === 0 && (processingService.procBurstInfo.prefilledInputFilePath || processingService.procBurstInfo.inputFile)) {
    <div
      style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem"
    >
      <div style="grid-column:span 1">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/></svg>
      </div>

      <div style="grid-column:span 11">
        <details>
        <summary id="qaReminderLink" style="cursor:pointer;list-style:none"
          >{{ 'AREAS.PROCESSING.TAB-BURST.DID-YOU-RUN-QA' | translate }}
          <em>{{processingService.procBurstInfo.isSample ? processingService.procBurstInfo.prefilledInputFilePath : processingService.procBurstInfo.inputFileName}}</em>?</summary
        >
        <div id="qaReminder">
          {{ 'AREAS.PROCESSING.TAB-BURST.BEFORE-EMAILING' | translate }}
          <a
            href="#"
            [routerLink]="['/processingQa','qualityMenuSelected', processingService.procBurstInfo.prefilledInputFilePath, processingService.procBurstInfo.prefilledConfigurationFilePath]"
            skipLocationChange="true">Quality Assurance</a
          >
          {{ 'AREAS.PROCESSING.TAB-BURST.FOR-THE-FILE' | translate }}
          <em>{{processingService.procBurstInfo.isSample ? processingService.procBurstInfo.prefilledInputFilePath : processingService.procBurstInfo.inputFileName}}</em>&nbsp;&nbsp;
          <button
            id="goToQa"
            type="button"
            class="btn btn-primary btn-sm"
            [routerLink]="['/processingQa','qualityMenuSelected', processingService.procBurstInfo.prefilledInputFilePath, processingService.procBurstInfo.prefilledConfigurationFilePath]"
            skipLocationChange="true">
            {{ 'AREAS.PROCESSING.TAB-BURST.RUN-QA' | translate }}
          </button>
        </div>
        </details>
      </div>
    </div>
    }

    @if (executionStatsService.jobStats.numberOfActiveJobs === 0 && executionStatsService.jobStats.jobsToResume.length > 0) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12" id="resumeJobsBurstReportsTab">
          <ng-container [ngTemplateOutlet]="resumeJobs"> </ng-container>
        </div>
      </div>
    }

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <dburst-log-files-viewer-separate-tabs viewerId="logsViewerBurstReportsTab"></dburst-log-files-viewer-separate-tabs>
    </div>
  </div>
</ng-template>
`;
