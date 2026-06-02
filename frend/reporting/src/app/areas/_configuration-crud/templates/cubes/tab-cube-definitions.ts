export const tabCubeDefinitionsTemplate = `
<div class="space-y-4">
  <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
    <div style="grid-column:span 10">
      <table id="cubeDefinitionsTable" class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Connection</th>
          </tr>
        </thead>
        <tbody>
          @for (cube of pagedCubes; track $index) {
            <tr
                [id]="cube.id"
                [ngClass]="{'bg-primary/10': cube.activeClicked, 'info': cube.activeClicked}"
                (click)="onCubeClick(cube)"
                style="cursor: pointer">
              <td>
                {{ cube.name }}
                @if (cube.isSample) {
                  <span class="badge badge-ghost" style="margin-left: 6px;">sample</span>
                }
              </td>
              <td>{{ cube.description }}</td>
              <td>{{ cube.connectionId }}</td>
            </tr>
          }
          @if (pagedCubes.length === 0) {
            <tr>
              <td colspan="3" style="text-align: center; color: #999; padding: 20px;">
                @if (cubeSearchTerm) {
                  <span>No cubes match '{{ cubeSearchTerm }}'</span>
                }
                @if (!cubeSearchTerm) {
                  <span>No cube definitions yet</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (filteredCubes.length > cubePageSize) {
      <nav style="margin-top: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #777; font-size: 12px;">
            Showing {{ cubePageStart + 1 }}-{{ cubePageEnd }} of {{ filteredCubes.length }}
          </span>
          <ul class="pagination" style="margin: 0;">
            <li [ngClass]="{ 'disabled': cubePageIndex === 0 }">
              <a href="#" (click)="prevCubePage(); $event.preventDefault()">&laquo;</a>
            </li>
            @for (p of cubePageNumbers; track $index) {
            <li [ngClass]="{ 'active': p === cubePageIndex }">
              <a href="#" (click)="goToCubePage(p); $event.preventDefault()">{{ p + 1 }}</a>
            </li>
            }
            <li [ngClass]="{ 'disabled': cubePageIndex >= totalCubePages - 1 }">
              <a href="#" (click)="nextCubePage(); $event.preventDefault()">&raquo;</a>
            </li>
          </ul>
        </div>
      </nav>
      }

      @if (totalCubePages >= 2 || cubeSearchTerm) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">
        <div style="grid-column:span 12">
          <div class="join">
            <span class="join-item btn btn-ghost"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg></span>
            <input type="text" id="cubesSearch" class="input join-item" placeholder="Search by name or description"
              [ngModel]="cubeSearchTerm" (ngModelChange)="onCubeSearchChange($event)" />
            @if (cubeSearchTerm) {
            <button type="button" class="join-item btn btn-ghost" (click)="onCubeSearchChange('')" title="Clear search">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            }
          </div>
        </div>
      </div>
      }
    </div>

    <div style="grid-column:span 2">
      <button
        id="btnCreateCube"
        type="button"
        class="btn btn-outline w-full"
        (click)="showCubeModal('create')"
        style="margin-bottom: 5px">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> {{ 'BUTTONS.NEW' | translate }}
      </button>

      <button
        id="btnEditCube"
        type="button"
        class="btn btn-outline w-full"
        (click)="showCubeModal('update')"
        [ngClass]="{ 'disabled': !getSelectedCube() }"
        style="margin-bottom: 5px">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"/></svg> {{ 'BUTTONS.EDIT' | translate }}
      </button>

      <button
        id="btnDuplicateCube"
        type="button"
        class="btn btn-outline w-full"
        (click)="showCubeModal('create', true)"
        [ngClass]="{ 'disabled': !getSelectedCube() }"
        style="margin-bottom: 5px">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> {{ 'BUTTONS.DUPLICATE' | translate }}
      </button>

      <button
        id="btnDeleteCube"
        type="button"
        class="btn btn-outline w-full"
        (click)="onDeleteCube()"
        [ngClass]="{ 'disabled': !getSelectedCube() || getSelectedCube()?.isSample }"
        title="{{ getSelectedCube()?.isSample ? 'Sample cubes are read-only' : '' }}"
        style="margin-bottom: 5px">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15"/></svg> {{ 'BUTTONS.DELETE' | translate }}
      </button>
    </div>
  </div>
</div>

<!-- Cube Edit Modal (daisyUI v5) -->
@if (isCubeModalVisible) {
<div class="modal modal-open" tabindex="-1">
  <div class="modal-box" style="width: 90vw; max-width: 90vw; max-height: calc(100vh - 60px);">
    <div class="flex items-center justify-between" style="margin-bottom: 12px;">
      <h3 class="font-bold text-lg" style="margin: 0;">{{ cubeModalTitle }}</h3>
      <button type="button" class="btn btn-sm btn-circle btn-ghost" (click)="closeCubeModal()" aria-label="Close">✕</button>
    </div>
    <div style="max-height: calc(100vh - 220px); overflow-y: auto;">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-bottom: 10px;">
          <div style="grid-column:span 4">
            <label>Name</label>
            <input id="cubeName" type="text" class="input" [(ngModel)]="editingCube.name"
              (ngModelChange)="onCubeNameChanged()">
            @if (cubeNameAlreadyExists) {
            <span id="cubeAlreadyExistsWarning" class="text-error">
              A cube with this name already exists
            </span>
            }
          </div>
          <div style="grid-column:span 4">
            <label>Description</label>
            <input id="cubeDescription" type="text" class="input" [(ngModel)]="editingCube.description">
          </div>
          <div style="grid-column:span 4">
            <label>Database Connection</label>
            <select id="cubeConnectionId" class="select select-bordered" [(ngModel)]="editingCube.connectionId">
              <option value="">-- None --</option>
              @for (conn of dbConnections; track $index) {
              <option [value]="conn.connectionCode">{{ conn.connectionName }} ({{ conn.connectionCode }})</option>
            }
            </select>
          </div>
        </div>

        <!-- Code editor only (when preview is hidden) -->
        @if (!cubePreviewVisible) {
        <div style="margin-top: 10px;">
          <dp-tabs>
            <dp-tab heading="Cube Options">
              <div style="margin-top: 10px;">
                <ngx-codejar
                  id="cubeDslEditor"
                  [(code)]="editingCube.dslCode"
                  (update)="onDslCodeChanged($event)"
                  [highlightMethod]="highlightGroovyCode"
                  [highlighter]="'prism'"
                  [showLineNumbers]="true"
                  style="height: 350px; border: 1px solid var(--color-base-300); border-radius: 4px 4px 0 0; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: var(--color-base-100); color: var(--color-base-content);">
                </ngx-codejar>
                <div style="display: flex;">
                  <button id="btnAiHelpCubeDslFullEditor" type="button" class="btn btn-outline" style="flex: 1; border-radius: 0 0 0 4px;" (click)="showDbConnectionModalForCubeDsl()">
                    <strong>Hey AI, Help Me ...</strong>
                  </button>
                  <button id="btnToggleCubePreviewShow" type="button" class="btn btn-outline" style="flex: 1; border-radius: 0 0 4px 0;" (click)="toggleCubePreview()">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> Show Preview
                  </button>
                </div>
              </div>
            </dp-tab>

            <dp-tab heading="Example (Cube Options)">
              <div style="margin-top: 10px;">
                <a id="btnSeeMoreCubeExamples" href="https://datapallas.com/docs/data-exploration" target="_blank" class="btn btn-outline w-full" style="text-decoration: underline; margin-bottom: 10px;">
                  See More Cube Options Examples
                </a>
                <ngx-codejar
                  id="cubeDslExampleEditor"
                  [code]="cubeExampleCode"
                  [highlightMethod]="highlightGroovyCode"
                  [highlighter]="'prism'"
                  [showLineNumbers]="true"
                  [readonly]="true"
                  style="height: 350px; border: 1px solid var(--color-base-300); border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: var(--color-base-200); color: var(--color-base-content);">
                </ngx-codejar>
                <button id="btnCopyToClipboardCubeDslExample" type="button" class="btn btn-outline w-full" style="margin-top: 10px;" (click)="copyCubeExampleToClipboard()">
                  Copy Example Cube Options To Clipboard
                </button>
              </div>
            </dp-tab>
          </dp-tabs>
        </div>
        }

        <!-- Split pane with editor and preview -->
        @if (cubePreviewVisible) {
        <as-split direction="horizontal"
                  [gutterSize]="8" [useTransition]="true"
                  style="height: 480px; margin-top: 10px;">

          <!-- Editor Pane -->
          <as-split-area [size]="50" [minSize]="20">
            <div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
              <dp-tabs>
                <dp-tab heading="Cube Options">
                  <div style="margin-top: 10px;">
                    <ngx-codejar
                      id="cubeDslEditor"
                      [(code)]="editingCube.dslCode"
                      (update)="onDslCodeChanged($event)"
                      [highlightMethod]="highlightGroovyCode"
                      [highlighter]="'prism'"
                      [showLineNumbers]="true"
                      style="height: 390px; border: 1px solid var(--color-base-300); border-radius: 4px 4px 0 0; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: var(--color-base-100); color: var(--color-base-content);">
                    </ngx-codejar>
                    <div style="display: flex;">
                      <button id="btnAiHelpCubeDsl" type="button" class="btn btn-outline" style="flex: 1; border-radius: 0 0 0 4px;" (click)="showDbConnectionModalForCubeDsl()">
                        <strong>Hey AI, Help Me ...</strong>
                      </button>
                      <button id="btnToggleCubePreviewHide" type="button" class="btn btn-outline" style="flex: 1; border-radius: 0 0 4px 0;" (click)="toggleCubePreview()">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"/></svg> Expand Code Editor
                      </button>
                    </div>
                  </div>
                </dp-tab>

                <dp-tab heading="Example (Cube Options)">
                  <div style="margin-top: 10px;">
                    <a id="btnSeeMoreCubeExamples" href="https://datapallas.com/docs/data-exploration" target="_blank" class="btn btn-outline w-full" style="text-decoration: underline; margin-bottom: 10px;">
                      See More Cube Options Examples
                    </a>
                    <ngx-codejar
                      id="cubeDslExampleEditor"
                      [code]="cubeExampleCode"
                      [highlightMethod]="highlightGroovyCode"
                      [highlighter]="'prism'"
                      [showLineNumbers]="true"
                      [readonly]="true"
                      style="height: 340px; border: 1px solid var(--color-base-300); border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: var(--color-base-200); color: var(--color-base-content);">
                    </ngx-codejar>
                    <button id="btnCopyToClipboardCubeDslExample" type="button" class="btn btn-outline w-full" (click)="copyCubeExampleToClipboard()">
                      Copy Example Cube Options To Clipboard
                    </button>
                  </div>
                </dp-tab>
              </dp-tabs>
            </div>
          </as-split-area>

          <!-- Preview Pane -->
          <as-split-area [size]="50" [minSize]="20">
            <div style="height: 100%; display: flex; flex-direction: column;">
              <div style="flex: 1; border: 1px solid var(--color-base-300); border-radius: 4px 4px 0 0; padding: 10px; overflow-y: auto; background: var(--color-base-200); color: var(--color-base-content);">
                <rb-cube-renderer
                  [cubeConfig]="parsedCube"
                  [connectionId]="editingCube.connectionId"
                  [apiBaseUrl]="apiBaseUrl"
                  (selectionChanged)="onCubeSelectionChanged($any($event))">
                </rb-cube-renderer>

                @if (parseDslError) {
                <div class="text-error" style="margin-top: 10px;">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg> {{ parseDslError }}
                </div>
                }
              </div>
              <button id="btnViewSql" type="button" class="btn btn-outline btn-primary w-full"
                style="border-radius: 0 0 4px 4px; margin: 0;"
                [disabled]="!hasFieldSelections"
                (click)="viewSql()">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z"/></svg> Show SQL
              </button>
            </div>
          </as-split-area>
        </as-split>
        }
    </div>
    <div class="modal-action items-center">
      @if (editingCube.isSample) {
      <span class="text-base-content/60 mr-auto" style="font-size: 12px;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg> Sample cubes are read-only. Use Duplicate to create an editable copy.
      </span>
      }
      <button id="btnOKConfirmationCubeModal" type="button" class="btn btn-outline btn-primary"
        (click)="saveCube()"
        [disabled]="!editingCube.name || cubeNameAlreadyExists || editingCube.isSample">
        Save
      </button>
      <button id="btnCloseCubeModal" type="button" class="btn btn-ghost" (click)="closeCubeModal()">Close</button>
    </div>
  </div>
</div>
}

<!-- SQL Preview Modal (daisyUI v5) — z-index higher than cube edit modal so it stacks on top -->
@if (showSqlModal) {
<div class="modal modal-open" style="z-index: 1000;" tabindex="-1">
  <div class="modal-box" style="width: 70vw; max-width: 900px;">
    <div class="flex items-center justify-between" style="margin-bottom: 12px;">
      <h3 class="font-bold text-lg" style="margin: 0;">Generated SQL</h3>
      <button type="button" class="btn btn-sm btn-circle btn-ghost" (click)="closeSqlModal()" aria-label="Close">✕</button>
    </div>
    <div>
      @if (sqlLoading) {
      <div style="text-align: center; padding: 30px;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-6 h-6 animate-spin"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
        <p style="margin-top: 10px;">Generating SQL...</p>
      </div>
      }
      @if (!sqlLoading) {
      <pre id="cubeSqlResult" style="background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">{{ generatedSql }}</pre>
      }
    </div>
    <div class="modal-action">
      <button id="btnCopyCubeSql" type="button" class="btn btn-outline btn-primary" (click)="copySqlToClipboard()" [disabled]="sqlLoading">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.262c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg> Copy SQL to Clipboard
      </button>
      <button id="btnCloseCubeSqlModal" type="button" class="btn btn-ghost" (click)="closeSqlModal()">Close</button>
    </div>
  </div>
</div>
}

<!-- Connection Details modal — used by the cube "Hey AI" button to let the user
     pick tables from the cube's DB connection before launching the AI prompt. -->
<dburst-connection-details
  #connectionDetailsModal
  [mode]="'viewMode'"
  [context]="'cubeDsl'">
</dburst-connection-details>
`;
