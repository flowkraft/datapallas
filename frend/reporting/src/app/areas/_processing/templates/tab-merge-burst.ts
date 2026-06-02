export const tabMergeBurstTemplate = `<ng-template #tabMergeBurstTemplate>
  <div class="space-y-4">
    <div class="card card-border">
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div
            class="border border-base-300 rounded-md"
            style="grid-column:span 10;cursor: pointer; height: 200px; overflow: auto"
          >
            <table
              id="filesTable"
              class="table"
              cellspacing="0"
            >
              <thead>
                <tr>
                  <th style="grid-column:span 3">
                    {{ 'AREAS.PROCESSING.TAB-MERGE-BURST.NAME' | translate }}
                  </th>
                  <!--
                  <th style="grid-column:span 9">
                    {{ 'AREAS.PROCESSING.TAB-MERGE-BURST.PATH' | translate }}
                  </th>
                  -->
                </tr>
              </thead>
              <tbody>
                @for (file of processingService.procMergeBurstInfo.inputFiles; track $index) {
                <tr
                  [ngClass]="{'bg-primary/10': file.selected}"
                  (click)="onFileSelected(file)"
                >
                  <td>{{file.name}}</td>
                  <!--<td>{{file.path}}</td>-->
                </tr>
                }
              </tbody>
            </table>
          </div>

          <div style="grid-column:span 2">
          <label for="mergeFilesUploadInput" class="btn btn-outline w-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"/></svg>&nbsp;Add</label>
          <input id="mergeFilesUploadInput" type="file" multiple (change)="onFilesAdded($event)" #mergeFilesUploadInput style="display: none;" />
          <!--
          <dburst-button-native-system-dialog
              btnId="mergeFilesUploadInput"
              value="&nbsp;&nbsp;&nbsp;&nbsp;{{
              'AREAS.PROCESSING.TAB-MERGE-BURST.ADD' | translate }}"
              dialogType="files"
              (pathsSelected)="onFilesAdded($event)"
            ></dburst-button-native-system-dialog>
            -->

            <div class="mt-2 space-y-1">
            <button
              id="btnDeletePdfFile"
              type="button"
              class="btn btn-outline w-full"
              (click)="onSelectedFileDelete()"
              [disabled]="!processingService.procMergeBurstInfo.selectedFile"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14"/></svg>&nbsp;{{
              'AREAS.PROCESSING.TAB-MERGE-BURST.DELETE' | translate }}
            </button>

            <button
              id="btnUpPdfFile"
              type="button"
              class="btn btn-outline w-full"
              (click)="onSelectedFileUp()"
              [disabled]="!processingService.procMergeBurstInfo.selectedFile"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75"/></svg>&nbsp;{{
              'AREAS.PROCESSING.TAB-MERGE-BURST.UP' | translate }}
            </button>

            <button
              id="btnDownPdfFile"
              type="button"
              class="btn btn-outline w-full"
              (click)="onSelectedFileDown()"
              [disabled]="!processingService.procMergeBurstInfo.selectedFile"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75"/></svg>&nbsp;{{
              'AREAS.PROCESSING.TAB-MERGE-BURST.DOWN' | translate }}
            </button>

            <button
              id="btnClearPdfFiles"
              type="button"
              class="btn btn-outline w-full"
              (click)="onClearFiles()"
              [disabled]="processingService.procMergeBurstInfo.inputFiles.length === 0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.374-6.375a1.125 1.125 0 010-1.59L9.54 4.72a1.125 1.125 0 011.59 0l7.124 7.126a1.125 1.125 0 010 1.59l-3.873 3.873a1.125 1.125 0 01-1.59 0z"/></svg>&nbsp;&nbsp;{{
              'AREAS.PROCESSING.TAB-MERGE-BURST.CLEAR' | translate }}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card card-border">
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2">
            {{ 'AREAS.PROCESSING.TAB-MERGE-BURST.MERGED-FILE-NAME' | translate
            }}
          </div>
          <div style="grid-column:span 9">
            <input
              id="mergedFileName"
              [(ngModel)]="processingService.procMergeBurstInfo.mergedFileName"
              (change)="saveMergedFileSetting();"
              class="input"
            />
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2"></div>
          <div style="grid-column:span 9">
            @if (!processingService.procMergeBurstInfo.mergedFileName) {
              <span
                id="mergedFileNameRequired"
                class="badge badge-ghost"
                >{{ 'AREAS.PROCESSING.TAB-MERGE-BURST.MERGED-FILE-NAME-REQUIRED' |
                translate }}</span
              >
            }
            @if (processingService.procMergeBurstInfo.mergedFileName && !processingService.procMergeBurstInfo.mergedFileName.endsWith('.pdf')) {
              <span
                id="mergedFileNamePdfExtensionRequired"
                class="badge badge-ghost"
                >{{
                'AREAS.PROCESSING.TAB-MERGE-BURST.MERGED-FILE-NAME-PDF-EXTENSION'
                | translate }}</span
              >
            }
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2"></div>
          <div style="grid-column:span 3">
            <label id="btnBurstMergedFile" class="label">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                [(ngModel)]="processingService.procMergeBurstInfo.shouldBurstResultedMergedFile"
              />
              <span>{{ 'AREAS.PROCESSING.TAB-MERGE-BURST.BURST-MERGED-FILE' | translate }}</span>
            </label>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2"></div>
          <div style="grid-column:span 1;margin-right: 20px">
            <button
              id="btnRun"
              type="button"
              class="btn btn-outline btn-primary"
              (click)="doMergeBurst()"
              [disabled]="!processingService.procMergeBurstInfo.mergedFileName || !processingService.procMergeBurstInfo.mergedFileName.endsWith('.pdf') || processingService.procMergeBurstInfo.inputFiles.length<=1 || executionStatsService.jobStats.numberOfActiveJobs > 0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg>&nbsp;{{
              'AREAS.PROCESSING.TAB-MERGE-BURST.RUN' | translate }}
            </button>
          </div>

          <div style="grid-column:span 3">
            <dburst-button-clear-logs></dburst-button-clear-logs>
          </div>

          <div style="grid-column:span 3;margin-left: -20px">
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

        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2"></div>
          <div style="grid-column:span 9">
            @if (processingService.procMergeBurstInfo.inputFiles.length<=1) {
              <span
                id="twoOrMoreRequired"
                class="badge badge-ghost"
                >{{ 'AREAS.PROCESSING.TAB-MERGE-BURST.SELECT-2-OR-MORE' |
                translate }}</span
              >
            }
          </div>
        </div>
      </div>
    </div>
  </div>
</ng-template>
`;
