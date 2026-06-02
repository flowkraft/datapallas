export const tabReportingUsageTemplate = `<ng-template #tabReportingUsageTemplate>
  <div class="space-y-4">
    <div class="card card-border">
      <div class="card-title">
        <h4>Embed Reports in External Web Applications</h4>
        <p>Copy and paste the following HTML snippets to embed your report components in external web applications.</p>
       </div>
      <div class="card-body">

        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- DASHBOARD MODE: Show only rb-dashboard snippet              -->
        <!-- ═══════════════════════════════════════════════════════════ -->

        @if (isDashboardOutputType()) {
          <h5><strong>1. Dashboard Component</strong></h5>
          <p class="text-base-content/60" style="font-size: 12px;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>
            Dashboards render the full HTML template with all embedded <code>&lt;rb-*&gt;</code> components.
          </p>
          <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;rb-dashboard
  report-id="{{ getCurrentReportCode() }}"
  api-base-url="{{ getApiBaseUrl() }}"
  api-key="{{ getApiKeyForUsage() }}"&gt;
&lt;/rb-dashboard&gt;
          </div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 15px;" (click)="copyUsageRbDashboard()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy rb-dashboard
          </button>

          <h5><strong>2. Shareable Dashboard URL</strong></h5>
          <p class="text-base-content/60" style="font-size: 12px;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>
            Open this URL in a browser to view the live dashboard. Share it with others or use it in emails.
          </p>
          <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">{{ getDashboardUrl() }}</div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="copyToClipboard(getDashboardUrl())">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy URL
          </button>
          <p class="text-base-content/60" style="font-size: 12px; margin-top: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
            Available in email templates as: <code>{{ '$' }}{{ '{' }}dashboard_url{{ '}' }}</code>
          </p>
          <hr/>
        }

        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- NON-DASHBOARD MODE: Individual component snippets           -->
        <!-- ═══════════════════════════════════════════════════════════ -->

        @if (!isDashboardOutputType()) {

        <!-- DATA TABLE COMPONENT(S) -->

        <!-- Named tabulators (multi-component / aggregator report) -->
        @if (getNamedTabulatorIds().length > 0) {
          @for (cid of getNamedTabulatorIds(); track $index) {
          <div style="margin-bottom: 10px;">
            <h5><strong>1{{ getLetterSuffix($index) }}. Data Table — {{ cid }}</strong></h5>
            <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;rb-tabulator
  report-id="{{ getCurrentReportCode() }}"
  component-id="{{ cid }}"
  api-base-url="{{ getApiBaseUrl() }}"
  api-key="{{ getApiKeyForUsage() }}"&gt;
&lt;/rb-tabulator&gt;
            </div>
            <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 10px;" (click)="copyUsageRbTabulatorNamed(cid)">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy rb-tabulator ({{ cid }})
            </button>
          </div>
          }
          <hr/>
        }

        <!-- Single unnamed tabulator (standard report) -->
        @if (getNamedTabulatorIds().length === 0) {
          <h5><strong>1. Data Table Component</strong></h5>
          <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;rb-tabulator
  report-id="{{ getCurrentReportCode() }}"
  api-base-url="{{ getApiBaseUrl() }}"
  api-key="{{ getApiKeyForUsage() }}"&gt;
&lt;/rb-tabulator&gt;
          </div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 15px;" (click)="copyUsageRbTabulator()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy rb-tabulator
          </button>
          <hr/>
        }

        <!-- PARAMETERS COMPONENT -->

        <!-- Parameters component - show only if parameters are configured -->
        @if (activeParamsSpecScriptGroovy?.trim()) {
        <div>
          <h5><strong>{{ getUsageParamsNumber() }}. Parameters Component</strong></h5>
          <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;rb-parameters
  report-id="{{ getCurrentReportCode() }}"
  api-base-url="{{ getApiBaseUrl() }}"
  api-key="{{ getApiKeyForUsage() }}"&gt;
&lt;/rb-parameters&gt;
          </div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 15px;" (click)="copyUsageRbParameters()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy rb-parameters
          </button>
          <hr/>
        </div>
        }

        <!-- CHART COMPONENT(S) -->

        <!-- Named charts (multi-component / aggregator report) -->
        @if (getNamedChartIds().length > 0) {
          @for (cid of getNamedChartIds(); track $index) {
          <div style="margin-bottom: 10px;">
            <h5><strong>{{ getUsageChartNumber() }}{{ getLetterSuffix($index) }}. Chart — {{ cid }}</strong></h5>
            <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;rb-chart
  report-id="{{ getCurrentReportCode() }}"
  component-id="{{ cid }}"
  api-base-url="{{ getApiBaseUrl() }}"
  api-key="{{ getApiKeyForUsage() }}"&gt;
&lt;/rb-chart&gt;
            </div>
            <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 10px;" (click)="copyUsageRbChartNamed(cid)">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy rb-chart ({{ cid }})
            </button>
          </div>
          }
          <hr/>
        }

        <!-- Single unnamed chart (standard report) -->
        @if (getNamedChartIds().length === 0 && activeChartConfigScriptGroovy?.trim()) {
        <div>
          <h5><strong>{{ getUsageChartNumber() }}. Chart Component (optional - for data visualization)</strong></h5>
          <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;rb-chart
  report-id="{{ getCurrentReportCode() }}"
  api-base-url="{{ getApiBaseUrl() }}"
  api-key="{{ getApiKeyForUsage() }}"&gt;
&lt;/rb-chart&gt;
          </div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 15px;" (click)="copyUsageRbChart()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy rb-chart
          </button>
          <hr/>
        </div>
        }

        <!-- PIVOT TABLE COMPONENT(S) -->

        <!-- Named pivot tables (multi-component / aggregator report) -->
        @if (getNamedPivotIds().length > 0) {
          @for (cid of getNamedPivotIds(); track $index) {
          <div style="margin-bottom: 10px;">
            <h5><strong>{{ getUsagePivotTableNumber() }}{{ getLetterSuffix($index) }}. Pivot Table — {{ cid }}</strong></h5>
            <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;rb-pivottable
  report-id="{{ getCurrentReportCode() }}"
  component-id="{{ cid }}"
  api-base-url="{{ getApiBaseUrl() }}"
  api-key="{{ getApiKeyForUsage() }}"&gt;
&lt;/rb-pivottable&gt;
            </div>
            <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 10px;" (click)="copyUsageRbPivotTableNamed(cid)">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy rb-pivottable ({{ cid }})
            </button>
          </div>
          }
          <hr/>
        }

        <!-- Single unnamed pivot table (standard report) -->
        @if (getNamedPivotIds().length === 0 && activePivotTableConfigScriptGroovy?.trim()) {
        <div>
          <h5><strong>{{ getUsagePivotTableNumber() }}. Pivot Table Component (for data analysis)</strong></h5>
          <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;rb-pivottable
  report-id="{{ getCurrentReportCode() }}"
  api-base-url="{{ getApiBaseUrl() }}"
  api-key="{{ getApiKeyForUsage() }}"&gt;
&lt;/rb-pivottable&gt;
          </div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 15px;" (click)="copyUsageRbPivotTable()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy rb-pivottable
          </button>
          <hr/>
        </div>
        }

        <!-- REPORT COMPONENT (always shown, no component-id needed) -->

        <h5><strong>{{ getUsageRbReportNumber() }}. Report Component</strong></h5>
        @if (hasEntityCodeParameter()) {
        <div class="alert alert-info" style="font-size: 12px; padding: 8px 12px; margin-bottom: 10px;">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>
          This report uses <code>entityCode</code> parameter. Replace <code>YOUR_ENTITY_CODE</code> with the actual entity identifier.
        </div>
        }
        <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;rb-report
  report-id="{{ getCurrentReportCode() }}"{{ getEntityCodeAttribute() }}
  api-base-url="{{ getApiBaseUrl() }}"
  api-key="{{ getApiKeyForUsage() }}"&gt;
&lt;/rb-report&gt;
        </div>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 15px;" (click)="copyUsageRbReport()">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy rb-report
        </button>

        <hr/>

        }

        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- SCRIPT TAG                                                 -->
        <!-- ═══════════════════════════════════════════════════════════ -->

        <h5><strong>{{ getUsageScriptNumber() }}. Include the Web Components Script</strong></h5>
        <p class="text-base-content/60" style="font-size: 12px;">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>
          All FlowKraft apps (<code>_apps/flowkraft/*</code>) and <code>_apps/cms-webportal-playground</code> have this pre-configured.
          Only add this script tag for fully custom applications not pre-configured by DataPallas.
        </p>
        <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
&lt;script src="{{ getWebComponentsBaseUrl() }}/rb-webcomponents.umd.js"&gt;&lt;/script&gt;
        </div>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom: 15px;" (click)="copyUsageScriptTag()">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy Script Tag
        </button>

        <hr/>

        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- COMPLETE EXAMPLE                                           -->
        <!-- ═══════════════════════════════════════════════════════════ -->

        <h5><strong>Complete Example</strong></h5>
        <div class="well well-sm" style="background-color: #f5f5f5; font-family: monospace; white-space: pre-wrap; word-break: break-all;">{{ getCompleteUsageExample() }}</div>
        <button type="button" class="btn btn-outline btn-primary btn-sm" (click)="copyUsageCompleteExample()">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> Copy Complete Example
        </button>
      </div>
    </div>
  </div>
</ng-template>`;
