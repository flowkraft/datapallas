export const tabExternalConnectionsTemplate = `<ng-template #tabExternalConnectionsTemplate>
  <div class="well">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div
        style="grid-column:span 10;cursor: pointer; height: 500px; overflow: auto"
      >
        <table id="extConnectionsTable"
          class="table"
          cellspacing="0"
        >
          <thead>
            <tr>
              <th>
                {{ 'AREAS.CONFIGURATION-CONNECTIONS.TAB-CONFIGURATION-CONNECTIONS.NAME' |
                translate }}
              </th>
              <th>
                {{ 'AREAS.CONFIGURATION-CONNECTIONS.TAB-CONFIGURATION-CONNECTIONS.TYPE'
                | translate }}
              </th>
              <th>
                {{ 'AREAS.CONFIGURATION-CONNECTIONS.TAB-CONFIGURATION-CONNECTIONS.USED-BY'
                | translate }}
              </th>
              <th>
                Code
              </th>
              <th>
                Actions&nbsp;&nbsp;
              </th>
        
              </tr>
          </thead>
          <tbody>
          @for (connectionFile of settingsService.connectionFiles; track $index) {
          <tr
          id="{{connectionFile.fileName}}"
          (click)="onItemClick(connectionFile)"
          [ngClass]="{ 'info': connectionFile.activeClicked}"
        >
          <td>
            {{connectionFile.connectionName}}
            @if (connectionFile.isSample) {
              <span class="badge badge-primary" style="margin-left: 6px;">sample</span>
            }
          </td>
          <td>
            {{connectionFile.connectionType}}
          </td>
          
        <td>
        {{connectionFile.usedBy}}
         </td>

          <td>
            @if (connectionFile.connectionCode) {
            <span style="font-family: monospace; font-size: 12px;">
              {{connectionFile.connectionCode}}
              <button type="button" class="btn btn-xs btn-ghost" style="margin-left: 4px; padding: 1px 4px;"
                title="Copy connection code to clipboard"
                (click)="$event.stopPropagation(); copyConnectionCode(connectionFile.connectionCode)">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.262c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg>
              </button>
            </span>
            }
          </td>

          <td>
 
          <div class="dropdown dropdown-top dropdown-end">

            @if (connectionFile.defaultConnection) {
              <button type="button" id="btnDefault_{{connectionFile.fileName}}" tabindex="0" role="button" class="btn btn-xs btn-primary">&nbsp;&nbsp;Default&nbsp;&nbsp;&#9650;</button>
            }
            @if (!connectionFile.defaultConnection) {
              <button type="button" id="btnActions_{{connectionFile.fileName}}" tabindex="0" role="button" class="btn btn-xs btn-ghost">&nbsp;&nbsp;Actions&nbsp;&nbsp;&#9650;</button>
            }

            <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-[1050] min-w-max p-2">
                  @if (connectionFile.connectionType === 'email-connection') {
                    <li id="btnSendTestEmail_{{connectionFile.fileName}}" (click)="doTestSMTPConnection()"><a>Send Test Email</a></li>
                  }
                  @if (connectionFile.connectionType === 'database-connection') {
                    <li id="btnTestDbConnection_{{connectionFile.fileName}}" (click)="doTestDatabaseConnection()"><a>{{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.TEST-DB-CONNECTION'
                  | translate }}</a></li>
                  }
                  @if (!connectionFile.defaultConnection) {
                    <li id="btnSeparator_{{connectionFile.fileName}}"><hr class="my-1 border-base-300"/></li>
                  }
                  @if (!connectionFile.defaultConnection) {
                    <li id="btnToggleDefault_{{connectionFile.fileName}}" (click)="toggleDefault()"><a>Make <strong>Default</strong></a></li>
                  }
                  @if (connectionFile.connectionType === 'database-connection') {
                    <li id="btnSeparator2_{{connectionFile.fileName}}"><hr class="my-1 border-base-300"/></li>
                  }
                  @if (connectionFile.connectionType === 'database-connection') {
                    <li id="btnUseForJasper_{{connectionFile.fileName}}" (click)="toggleUseForJasperReports()"><a>
                      @if (connectionFile.useForJasperReports) {
                        <span><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>&nbsp;</span>
                      }
                      Use For <strong>JasperReports</strong>
                    </a></li>
                  }
            </ul>

          </div>
              
        
        </td>

          </tr>
          }

          </tbody>
        </table>
      </div>

      <div style="grid-column:span 2">
        <div class="dropdown dropdown-top dropdown-end" style="margin-bottom: 5px; width: 100%;">
          <button id="btnNewDropdown" type="button" tabindex="0" role="button" class="btn btn-ghost w-full">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> {{ 'BUTTONS.NEW' | translate }} &#9650;
          </button>
          <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-[1050] min-w-max p-2">
            <li id="btnNewEmail" (click)="showCrudModal('create', 'email-connection')" style="cursor: pointer;"><a>{{ 'AREAS.CONFIGURATION-CONNECTIONS.TAB-CONFIGURATION-CONNECTIONS.NEW-EMAIL-CONNECTION' | translate }}</a></li>
            <li id="btnNewDatabase" (click)="showCrudModal('create', 'database-connection')" style="cursor: pointer;"><a>{{ 'AREAS.CONFIGURATION-CONNECTIONS.TAB-CONFIGURATION-CONNECTIONS.NEW-DB-CONNECTION' | translate }}</a></li>
          </ul>
        </div>
        <p></p>
        <button
          id="btnEdit"
          type="button"
          class="btn btn-ghost"
          (click)="showCrudModal('update', getSelectedConnection()?.connectionType)"
          [ngClass]="{ 'disabled': !getSelectedConnection()}"
          style="width:100%;margin-bottom: 5px"

        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"/></svg> {{ 'BUTTONS.EDIT' | translate }}
        </button>
        
        <button
          id="btnDuplicate"
          type="button"
          class="btn btn-ghost"
          (click)="showCrudModal('create', getSelectedConnection()?.connectionType, true)"
          [ngClass]="{ 'disabled': !getSelectedConnection()}"
          style="width:100%;margin-bottom: 5px"

        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> {{ 'BUTTONS.DUPLICATE' | translate }}
        </button>
        
        <button
          id="btnDelete"
          type="button"
          class="btn btn-ghost"
          (click)="onDeleteSelectedConnection()"
          [ngClass]="{ 'disabled': !getSelectedConnection() || getSelectedConnection().defaultConnection || getSelectedConnection().isSample || (getSelectedConnection().usedBy && getSelectedConnection().usedBy !== '--not used--')}"
          title="{{ getSelectedConnection()?.isSample ? 'Sample connections are read-only' : '' }}"
          style="width:100%;margin-bottom: 100px"
          >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15"/></svg> {{ 'BUTTONS.DELETE' | translate }}
        </button>

        <p>
        
        @if (goBackLocation) {
        <button
          id="btnGoBack"
          type="button"
          class="btn btn-primary"
          style="width:100%"
          (click)="goBack()"
        >
        {{ 'AREAS.CONFIGURATION-CONNECTIONS.TAB-CONFIGURATION-CONNECTIONS.GO-BACK' |
          translate }} <br> 
          {{this.configurationFileName}} <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg><br>
        {{ 'AREAS.CONFIGURATION.LEFT-MENU.EMAIL' | translate }} <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg><br>
          {{ 'AREAS.CONFIGURATION-CONNECTIONS.TAB-CONFIGURATION-CONNECTIONS.CONNECTION' |
          translate }}<br>{{ 'AREAS.CONFIGURATION-CONNECTIONS.TAB-CONFIGURATION-CONNECTIONS.SETTINGS' |
          translate }}<br>
        </button>
        }

        <p>
   
        <dburst-button-clear-logs></dburst-button-clear-logs>
        
      </div>
    </div>
  </div>
</ng-template>
`;
