export const tabQualityAssuranceTemplate = `<ng-template #tabQualityAssuranceTemplate>
  <div class="space-y-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        PDF / Excel
        {{ 'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.FILE' | translate }}
      </div>
      <div style="grid-column:span 8">
        <input id="qaBurstFile" [ngModel]="processingService.procBurstInfo.isSample ? processingService.procQualityAssuranceInfo.prefilledInputFilePath : processingService.procQualityAssuranceInfo.inputFileName" (ngModelChange)="processingService.procQualityAssuranceInfo.inputFileName = $event" class="input" required />
      </div>

      <div style="grid-column:span 2">
      <label for="qaFileUploadInput" class="btn btn-outline w-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"/></svg>&nbsp;Select</label>
      <input type="file" id="qaFileUploadInput" (change)="onQAFileSelected($event)" accept=".pdf" #qaFileUploadInput style="display: none;"/>

      <!--
      <dburst-button-native-system-dialog value="{{
            'COMPONENTS.BUTTON-NATIVE-SYSTEM-DIALOG.SELECT' | translate
          }}" dialogType="file" (pathsSelected)="onQAFileSelected($event)"></dburst-button-native-system-dialog>-->

      </div>
    </div>


    <label class="label">
      <input id="testTokensAll" type="radio" name="optradio" class="radio radio-sm" checked="checked" [(ngModel)]="processingService.procQualityAssuranceInfo.mode" value="ta" />
      <span>{{ 'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST-ALL-TOKENS' | translate }}</span>
    </label>

    <div>
      <label class="label">
        <input id="testTokensRandom" type="radio" name="optradio" class="radio radio-sm"
          [(ngModel)]="processingService.procQualityAssuranceInfo.mode" value="tr"
          (focus)="selectQualityAssuranceMode('tr')" />
        <span>{{ 'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST' | translate }}
          {{ processingService.procQualityAssuranceInfo.numberOfRandomTokens }}
          {{ 'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.RANDOM-BURST-TOKENS' | translate }}</span>
      </label>
      <input id="numberOfRandomTokens" class="input mt-1" placeholder="2"
        [(ngModel)]="processingService.procQualityAssuranceInfo.numberOfRandomTokens"
        (focus)="selectQualityAssuranceMode('numberOfRandomTokens')" />
    </div>

    <div>
      <label class="label">
        <input id="testTokensList" type="radio" name="optradio" class="radio radio-sm"
          [(ngModel)]="processingService.procQualityAssuranceInfo.mode" value="tl"
          (focus)="selectQualityAssuranceMode('tl')" />
        <span>{{ 'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST-FOLLOWING' | translate }}</span>
      </label>
      <input id="listOfTokens" class="input mt-1 w-full"
        placeholder="clyde.grew@northridgehealth.org,alfreda.waldback@northridgehealth.org"
        [(ngModel)]="processingService.procQualityAssuranceInfo.listOfTokens"
        (focus)="selectQualityAssuranceMode('listOfTokens')" />
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 1;margin-right: 40px">
        <button id="btnRunTest" type="button" class="btn btn-primary" (click)="doRunTest()" [disabled]="
            runTestShouldBeDisabled() ||
            executionStatsService.jobStats.numberOfActiveJobs > 0
          ">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z"/></svg>&nbsp;{{
            'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.RUN-TEST' | translate
          }}
        </button>
      </div>

      <div style="grid-column:span 3">
        <dburst-button-clear-logs></dburst-button-clear-logs>
      </div>

      <div style="grid-column:span 3">
<!--
      <dburst-button-native-system-dialog style="display: none;" value="{{ 'AREAS.PROCESSING.TAB-BURST.VIEW-REPORTS' | translate }}"
          dialogType="file">
        </dburst-button-native-system-dialog>-->
            </div>
    </div>

    <hr />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      @if (processingService.procQualityAssuranceInfo.testEmailServerStatus === 'started') {
        <div style="grid-column:span 6;margin-right: 40px">
          @if (!xmlSettings.documentburster.settings.qualityassurance.emailserver.weburl.includes('mailhog')) {
            <a href="{{ xmlSettings.documentburster.settings.qualityassurance.emailserver.weburl }}" target="_blank">
              <button class="btn btn-ghost" type="button">
                <span style="color:dodgerblue">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg></span>&nbsp;&nbsp;&nbsp;<span [innerHTML]="
                  'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.VIEW-TESTED-EMAILS'
                    | translate
                "></span>
              </button>
            </a>
          }
          @if (xmlSettings.documentburster.settings.qualityassurance.emailserver.weburl.includes('mailhog')) {
            <span style="color:dodgerblue">
              {{'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.VIEW-TESTED-EMAILS' | translate }} at http://your_datapallas_server_address:8025
            </span>
          }
        </div>
      }

      @if (processingService.procQualityAssuranceInfo.testEmailServerStatus !== 'started') {
        <div style="grid-column:span 6;margin-right: 40px">
          <button class="btn btn-ghost" type="button" [disabled]="true">
            <span style="color:gray"> <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg></span>&nbsp;&nbsp;&nbsp;<span [innerHTML]="
                'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.INNER-HTML.VIEW-EMAILS'
                  | translate
              "></span>
          </button>
        </div>
      }

      @if (
          processingService.procQualityAssuranceInfo.testEmailServerStatus === 'starting' ||
          processingService.procQualityAssuranceInfo.testEmailServerStatus === 'stopping'
        ) {
        <div style="grid-column:span 5">
          <button type="button" class="btn btn-outline w-full" [disabled]="true">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 animate-spin"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>&nbsp;&nbsp;&nbsp;
            @if (processingService.procQualityAssuranceInfo.testEmailServerStatus === 'starting') {
              <strong [innerHTML]="
                  'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.STARTING' | translate
                "></strong>
            }
            @if (processingService.procQualityAssuranceInfo.testEmailServerStatus === 'stopping') {
              <strong [innerHTML]="
                  'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.STOPPING' | translate
                "></strong>
            }
          </button>
        </div>
      }

      @if (processingService.procQualityAssuranceInfo.testEmailServerStatus === 'stopped') {
        <div style="grid-column:span 5">
          <button id="startTestEmailServer" type="button" class="btn btn-outline w-full"
            (click)="doStartStopTestEmailServer('start')" [disabled]="processingService.procQualityAssuranceInfo.mode === 'ta'">
            <span style="color:gray"> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="inline-block w-4 h-4"><circle cx="12" cy="12" r="9"/></svg> </span>&nbsp;&nbsp;&nbsp;
            <strong>Start
              <em>{{
                'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST-EMAIL-SERVER'
                  | translate
              }}</em>
            </strong>
          </button>
        </div>
      }

      @if (processingService.procQualityAssuranceInfo.testEmailServerStatus === 'started') {
        <div style="grid-column:span 5">
          <button id="stopTestEmailServer" type="button" class="btn btn-outline w-full"
            (click)="doStartStopTestEmailServer('shut')">
            <span style="color:dodgerblue"> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="inline-block w-4 h-4"><circle cx="12" cy="12" r="9"/></svg> </span>&nbsp;&nbsp;&nbsp;
            <strong>Stop
              <em>{{
                'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST-EMAIL-SERVER'
                  | translate
              }}</em>
            </strong>
          </button>
        </div>
      }
    </div>

    <hr />

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 12" [innerHTML]="
          'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.INNER-HTML.TEST-SERVER-CATCH'
            | translate
        "></div>
    </div>
  </div>
</ng-template>
`;
