export const tabConfTemplatesSamples = `<ng-template #tabConfTemplatesSamples>
  <div class="space-y-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div
        style="grid-column:span 12;cursor: pointer; height: 500px; overflow: auto"
      >
        <table id="confTemplatesSamplesTable"
          class="table"
          cellspacing="0"
        >
          <thead>
            <tr>
              <th>
                {{ 'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.NAME' |
                translate }}
              </th>
              <th>
                {{ 'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.CAPABILITIES' |
                translate }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              </th>
              <th>
                {{ 'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.HOW-TO-USE'
                | translate }}
              </th>
            </tr>
          </thead>
          <tbody>
            @for (configurationFile of settingsService.getSampleConfigurations(); track $index) {
              <tr
                id="{{configurationFile.fileName}}"
                (click)="onConfTemplateClick(configurationFile)"
                [ngClass]="{'bg-primary/10': configurationFile.activeClicked}"
              >
                <td>
                  {{configurationFile.templateName}}
                  @if (configurationFile.isFallback) {
                    <span>
                      <strong> (default)</strong>
                    </span>
                  }
                </td>
                <td>
                  @if (!configurationFile.capReportGenerationMailMerge) {
                    <span class="badge badge-ghost">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 11-5.196-3 3 3 0 015.196 3zm1.536.887a2.5 2.5 0 013.81-2.19M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 11-5.196 3 3 3 0 015.196-3zm1.536-.887a2.5 2.5 0 013.81 2.19m-1.733-2.19l2.077-1.2M21 12l-2.429-7.941A2.25 2.25 0 0016.5 2.4H7.5a2.25 2.25 0 00-2.071 1.659L3 12m18 0c0 1.415-.58 2.695-1.512 3.614M21 12H3m0 0c0 1.415.58 2.695 1.512 3.614"/></svg>&nbsp;
                      <em>Splitting</em>
                    </span>
                  }
                  @if (configurationFile.capReportGenerationMailMerge) {
                    <span class="badge badge-ghost">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>&nbsp;
                       <em>Generation / Mail Merge</em>
                    </span>
                  }&nbsp;
                  @if (configurationFile.capReportDistribution) {
                    <span class="badge badge-ghost">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>&nbsp;
                     <em>Distribution</em>
                    </span>
                  }
                </td>
                <td>
                  @if (!configurationFile.isFallback && !configurationFile.capReportGenerationMailMerge) {
                    <span
                      >&lt;config&gt;{{configurationFile.relativeFilePath}}&lt;/config&gt;</span
                    >
                  }
                  @if (configurationFile.isFallback) {
                    <span
                      [innerHTML]="'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.INNER-HTML.DEFAULT-CONFIGURATION' | translate"
                    >
                    </span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

    </div>
  </div>
</ng-template>
`;
