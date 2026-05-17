export const tabQualityAssuranceTemplate = `<ng-template #tabQualityAssuranceTemplate>
  <div class="well">
    <div class="row">
      <div class="col-xs-2">
        PDF / Excel
        {{ 'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.FILE' | translate }}
      </div>
      <div class="col-xs-8">
        <input id="qaBurstFile" [(ngModel)]="processingService.procBurstInfo.isSample ? processingService.procQualityAssuranceInfo.prefilledInputFilePath : processingService.procQualityAssuranceInfo.inputFileName" class="form-control" required />
      </div>

      <div class="col-xs-2">
      <label for="qaFileUploadInput" class="btn btn-default btn-block"><i class="fa fa-folder-open-o' }}"></i>&nbsp;Select</label>
      <input type="file" id="qaFileUploadInput" (change)="onQAFileSelected($event)" accept=".pdf" #qaFileUploadInput style="display: none;"/>
      
      <!--  
      <dburst-button-native-system-dialog value="{{
            'COMPONENTS.BUTTON-NATIVE-SYSTEM-DIALOG.SELECT' | translate
          }}" dialogType="file" (pathsSelected)="onQAFileSelected($event)"></dburst-button-native-system-dialog>-->
      
      </div>
    </div>

    <p></p>

    <div class="radio">
      <label>
        <input id="testTokensAll" type="radio" name="optradio" checked="checked" [(ngModel)]="processingService.procQualityAssuranceInfo.mode" value="ta" />{{
          'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST-ALL-TOKENS' | translate
        }}</label>
    </div>

    <p></p>

    <div class="radio">
      <label>
        <input id="testTokensRandom" type="radio" name="optradio" [(ngModel)]="processingService.procQualityAssuranceInfo.mode" value="tr"
          (focus)="selectQualityAssuranceMode('tr')" />{{ 'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST' | translate }}
        {{ processingService.procQualityAssuranceInfo.numberOfRandomTokens }}
        {{
          'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.RANDOM-BURST-TOKENS'
            | translate
        }}</label>
      <input id="numberOfRandomTokens" class="form-control" placeholder="2"
        [(ngModel)]="processingService.procQualityAssuranceInfo.numberOfRandomTokens"
        (focus)="selectQualityAssuranceMode('numberOfRandomTokens')" />
    </div>

    <p></p>

    <div class="radio">
      <label>
        <input id="testTokensList" type="radio" name="optradio" [(ngModel)]="processingService.procQualityAssuranceInfo.mode" value="tl"
          (focus)="selectQualityAssuranceMode('tl')" />{{
          'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST-FOLLOWING' | translate
        }}</label>
      <input id="listOfTokens" class="form-control"
        placeholder="clyde.grew@northridgehealth.org,alfreda.waldback@northridgehealth.org"
        [(ngModel)]="processingService.procQualityAssuranceInfo.listOfTokens"
        (focus)="selectQualityAssuranceMode('listOfTokens')" />
    </div>

    <p></p>

    <div class="row">
      <div class="col-xs-1" style="margin-right: 40px">
        <button id="btnRunTest" type="button" class="btn btn-primary" (click)="doRunTest()" [disabled]="
            runTestShouldBeDisabled() ||
            executionStatsService.jobStats.numberOfActiveJobs > 0
          ">
          <i class="fa fa-thumbs-o-up"></i>&nbsp;{{
            'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.RUN-TEST' | translate
          }}
        </button>
      </div>

      <div class="col-xs-3">
        <dburst-button-clear-logs></dburst-button-clear-logs>
      </div>

      <div class="col-xs-3">
<!--  
      <dburst-button-native-system-dialog style="display: none;" value="{{ 'AREAS.PROCESSING.TAB-BURST.VIEW-REPORTS' | translate }}"
          dialogType="file">
        </dburst-button-native-system-dialog>-->
            </div>
    </div>

    <hr />

    <div class="row">
      <div class="col-xs-6" *ngIf="processingService.procQualityAssuranceInfo.testEmailServerStatus === 'started'"
        style="margin-right: 40px">
        <a *ngIf="!xmlSettings.documentburster.settings.qualityassurance.emailserver.weburl.includes('mailhog')" href="{{ xmlSettings.documentburster.settings.qualityassurance.emailserver.weburl }}" target="_blank">
  <button class="btn" type="button">
    <span style="color:dodgerblue">
      <i class="fa fa-paper-plane"></i> </span>&nbsp;&nbsp;&nbsp;<span [innerHTML]="
        'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.VIEW-TESTED-EMAILS'
          | translate
      "></span>
  </button>
</a>
<span *ngIf="xmlSettings.documentburster.settings.qualityassurance.emailserver.weburl.includes('mailhog')" style="color:dodgerblue">
  {{'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.VIEW-TESTED-EMAILS' | translate }} at http://your_datapallas_server_address:8025
</span>
      </div>

      <div class=" col-xs-6" *ngIf="processingService.procQualityAssuranceInfo.testEmailServerStatus !== 'started'"
        style="margin-right: 40px">
        <button class="btn" type="button" [disabled]="true">
          <span style="color:gray"> <i class="fa fa-paper-plane"></i> </span>&nbsp;&nbsp;&nbsp;<span [innerHTML]="
              'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.INNER-HTML.VIEW-EMAILS'
                | translate
            "></span>
        </button>
      </div>

      <div class="col-xs-5" *ngIf="
          processingService.procQualityAssuranceInfo.testEmailServerStatus === 'starting' ||
          processingService.procQualityAssuranceInfo.testEmailServerStatus === 'stopping'
        ">
        <button type="button" class="btn btn-block" [disabled]="true">
          <i class="fa fa-spinner fa-pulse"></i>&nbsp;&nbsp;&nbsp;
          <strong *ngIf="
              processingService.procQualityAssuranceInfo.testEmailServerStatus === 'starting'
            " [innerHTML]="
              'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.STARTING' | translate
            "></strong>
          <strong *ngIf="
              processingService.procQualityAssuranceInfo.testEmailServerStatus === 'stopping'
            " [innerHTML]="
              'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.STOPPING' | translate
            "></strong>
        </button>
      </div>

      <div class=" col-xs-5" *ngIf="processingService.procQualityAssuranceInfo.testEmailServerStatus === 'stopped'">
        <button id="startTestEmailServer" type="button" class="btn btn-block"
          (click)="doStartStopTestEmailServer('start')" [disabled]="processingService.procQualityAssuranceInfo.mode === 'ta'">
          <span style="color:gray"> <i class="fa fa-circle"></i> </span>&nbsp;&nbsp;&nbsp;
          <strong>Start
            <em>{{
              'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST-EMAIL-SERVER'
                | translate
            }}</em>
          </strong>
        </button>
      </div>

      <div class="col-xs-5" *ngIf="processingService.procQualityAssuranceInfo.testEmailServerStatus === 'started'">
        <button id="stopTestEmailServer" type="button" class="btn btn-block"
          (click)="doStartStopTestEmailServer('shut')">
          <span style="color:dodgerblue"> <i class="fa fa-circle"></i> </span>&nbsp;&nbsp;&nbsp;
          <strong>Stop
            <em>{{
              'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.TEST-EMAIL-SERVER'
                | translate
            }}</em>
          </strong>
        </button>
      </div>
    </div>

    <hr />

    <div class="row">
      <div class="col-xs-12" [innerHTML]="
          'AREAS.PROCESSING.TAB-QUALITY-ASSURANCE.INNER-HTML.TEST-SERVER-CATCH'
            | translate
        "></div>
    </div>
  </div>
</ng-template>
`;
