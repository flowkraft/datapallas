export const resumeJobsTemplate = `<ng-template #resumeJobs>
  @for (jobDetails of executionStatsService.jobStats.jobsToResume; track $index) {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12">
        <strong style="text-decoration: underline"
          >{{ 'AREAS.PROCESSING.RESUME-JOBS.RESUME' | translate }}
          @if (jobDetails.testAll === 'true' || jobDetails.numberOfRandomTestTokens > -1 || jobDetails.listOfTestTokens) {
            <span
              >{{ 'AREAS.PROCESSING.LEFT-MENU.QUALITY-ASSURANCE' | translate
              }}</span
            >
          }
          {{ 'AREAS.PROCESSING.RESUME-JOBS.JOB' | translate }}</strong
        >
        @if (jobDetails.testAll === 'true') {
          <span>
            <em> - {{ 'AREAS.PROCESSING.RESUME-JOBS.TEST-ALL' | translate }}</em>
          </span>
        }

        @if (jobDetails.numberOfRandomTestTokens > -1) {
          <span>
            <em>
              - {{ 'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST' | translate }}
              {{jobDetails.numberOfRandomTestTokens}} {{
              'AREAS.PROCESSING.RESUME-JOBS.TEST-RANDOM' | translate }}</em
            >
          </span>
        }

        @if (jobDetails.listOfTestTokens) {
          <span>
            <em>
              - {{ 'AREAS.PROCESSING.RESUME-JOBS.TEST-LIST' | translate }}
              {{jobDetails.listOfTestTokens}}
            </em>
          </span>
        }

        <br />
        <br />

        <span>{{jobDetails.filePath}}</span> ({{jobDetails.jobDate}})

        <br />
        <br />
        <span style="text-decoration: underline"
          >{{ jobDetails.numberOfRemainingTokens }} {{
          'AREAS.PROCESSING.RESUME-JOBS.DOCS-REMAINING' | translate }}</span
        >
        ({{jobDetails.tokensCount - jobDetails.numberOfRemainingTokens}} {{
        'AREAS.PROCESSING.RESUME-JOBS.OUT-OF' | translate }}
        {{jobDetails.tokensCount}} {{ 'AREAS.PROCESSING.RESUME-JOBS.DOCS-DONE' |
        translate }})
        <br />
        <br />

        <button
          id="btnResume"
          type="button"
          class="btn btn-outline btn-primary"
          (click)="doResumeJob(jobDetails.jobFilePath)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg>&nbsp;Resume
          @if (jobDetails.testAll ==='true' || jobDetails.numberOfRandomTestTokens > -1 || jobDetails.listOfTestTokens) {
            <span
              >{{ 'AREAS.PROCESSING.LEFT-MENU.QUALITY-ASSURANCE' | translate
              }}</span
            >
          }
          {{ 'AREAS.PROCESSING.RESUME-JOBS.JOB' | translate }}</button
        >&nbsp;&nbsp;
        <button
          id="btnClear"
          type="button"
          class="btn"
          (click)="clearResumeJob(jobDetails.jobFilePath)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>&nbsp;{{
          'AREAS.PROCESSING.RESUME-JOBS.CLEAR-JOB' | translate }}
        </button>
      </div>
    </div>
  }
  <br />
</ng-template>
`;
