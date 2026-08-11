<%@ page import="flowkraft.frend.RbUtils" %>
<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="main"/>
    <title>Parameters - DataPallas</title>
    <style>
        .code-block {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 0.85rem;
            background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
            color: #d4d4d4;
            border-radius: 8px;
            padding: 1rem;
            overflow-x: auto;
            white-space: pre;
            line-height: 1.5;
            border: 1px solid #3d3d3d;
        }
        /* Filter state styles */
        #dataTableCard.filtered .card-header {
            background: color-mix(in oklab, var(--color-warning) 14%, var(--color-base-100));
            border-bottom-color: var(--color-warning);
        }
        #dataTableCard.filtered {
            border-color: var(--color-warning);
            box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-warning) 25%, transparent);
        }
        #dataTableCard.filtered .card-footer {
            background-color: color-mix(in oklab, var(--color-warning) 14%, var(--color-base-100));
            border-top-color: var(--color-warning);
            color: var(--color-warning);
        }
        .filter-param {
            display: inline-block;
            background: var(--color-base-100);
            border: 1px solid var(--color-warning);
            border-radius: 4px;
            padding: 2px 8px;
            margin: 0 4px;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="mt-4">
        <div class="w-full">
            <h4 class="mb-3">Report Parameters</h4>
            <p class="text-base-content/60 mb-4">Define how users filter and customize reports at runtime.</p>

            <!-- daisyUI Tabs -->
            <div class="tabs tabs-bordered" id="paramsTabs">
                <input type="radio" name="params-tabs" role="tab" class="tab" aria-label="Parameters" id="component-tab" checked/>
                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="component-pane">
                    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
                        <div style="grid-column:span 6">
                            <div class="card bg-base-100 border border-base-300 mb-3" id="parameterFormCard">
                                <div class="card-body">
                                    <div class="flex justify-between items-center mb-2">
                                        <h2 class="card-title text-base">Parameter Form</h2>
                                        <button id="refreshBtn" class="btn btn-outline btn-sm" title="Refresh">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                                        </button>
                                    </div>
                                    <rb-parameters
                                        id="demoParams"
                                        report-id="par-employee-hire-dates"
                                        api-base-url="${RbUtils.apiBaseUrl}"
                                        embed-token="${RbUtils.embedToken('par-employee-hire-dates')}"
                                    ></rb-parameters>
                                    <hr>
                                    <button id="submitBtn" class="btn btn-primary">Run Report</button>
                                </div>
                            </div>
                        </div>
                        <div style="grid-column:span 6">
                            <div class="card bg-base-100 border border-base-300">
                                <div class="card-body">
                                    <h2 class="card-title text-base">Current Values</h2>
                                    <pre id="paramValues" style="background: var(--color-base-200); padding: 1rem; border-radius: 4px; margin: 0;">{ }</pre>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Data Table Section -->
                    <div class="mt-4">
                        <div class="w-full">
                            <div class="card bg-base-100 border border-base-300 mb-3" id="dataTableCard">
                                <div class="card-body">
                                    <div class="flex justify-between items-center mb-2" id="dataTableHeader">
                                        <div>
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h1.5m-1.5 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m7.5-3.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-7.5"/></svg>
                                            <span id="tableTitle">Sample Data</span>
                                            <span id="filterBadge" class="badge bg-warning text-dark ml-2" style="display: none;">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z"/></svg> Filtered
                                            </span>
                                        </div>
                                        <div>
                                            <span id="recordCount" class="text-base-content/60 mr-3">Loading...</span>
                                            <button id="clearFiltersBtn" class="btn btn-outline btn-warning btn-sm" style="display: none;" title="Clear filters and show all data">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg> Clear Filters
                                            </button>
                                        </div>
                                    </div>
                                    <div style="max-height: 450px; overflow: auto;">
                                        <rb-tabulator
                                            id="dataTable"
                                            report-id="par-employee-hire-dates"
                                            api-base-url="${RbUtils.apiBaseUrl}"
                                            embed-token="${RbUtils.embedToken('par-employee-hire-dates')}"
                                        ></rb-tabulator>
                                    </div>
                                    <div class="text-base-content/60 text-sm mt-2" id="filterStatus">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg> Showing all records. Use the parameters above and click "Run Report" to filter.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <input type="radio" name="params-tabs" role="tab" class="tab" aria-label="Configuration" id="config-tab"/>
                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="config-pane">
                    <div class="flex justify-between items-start mb-2">
                        <button id="copyConfigBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                        </button>
                    </div>
                    <pre id="configCode" class="code-block"><code class="language-groovy">Loading configuration...</code></pre>
                </div>

                <input type="radio" name="params-tabs" role="tab" class="tab" aria-label="Usage" id="usage-tab"/>
                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="usage-pane">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-base-content/60 text-sm">HTML Usage</span>
                        <button id="copyUsageBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                        </button>
                    </div>
                    <pre id="usageCode" class="code-block"><code class="language-markup">&lt;rb-parameters
    report-id="par-employee-hire-dates"
    api-base-url="&#36;{RbUtils.apiBaseUrl}"
    embed-token="&#36;{RbUtils.embedToken('par-employee-hire-dates')}"
&gt;&lt;/rb-parameters&gt;</code></pre>
                </div>
            </div>
        </div>
    </div>

    <!-- Toast -->
    <div id="copyToast" class="toast toast-end toast-bottom hidden" style="position:fixed;z-index:1090;">
        <div class="alert alert-success">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> Copied to clipboard!
        </div>
    </div>

    <content tag="scripts">
    <script>
        var SVG_CLIPBOARD = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>';
        var SVG_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>';
        var SVG_SPINNER = '<span class="loading loading-spinner loading-sm mr-1"></span>';
        var SVG_FUNNEL = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1 text-warning"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z"/></svg>';
        var SVG_X_CIRCLE = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1 text-error"><path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>';
        var SVG_INFO = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>';
        document.addEventListener('DOMContentLoaded', function() {
            function showToast() {
                const el = document.getElementById('copyToast');
                el.classList.remove('hidden');
                setTimeout(() => el.classList.add('hidden'), 2000);
            }
            const params = document.getElementById('demoParams');
            const valuesDisplay = document.getElementById('paramValues');
            const configCodeEl = document.getElementById('configCode');

            function copyWithFeedback(btn, text) {
                navigator.clipboard.writeText(text).then(() => {
                    btn.innerHTML = SVG_CHECK;
                    showToast();
                    setTimeout(() => {
                        btn.innerHTML = SVG_CLIPBOARD;
                    }, 2000);
                });
            }

            function updateConfigDisplay() {
                console.log('[reportParameters GSP] updateConfigDisplay called');
                console.log('[reportParameters GSP] params.configDsl:', params.configDsl ? params.configDsl.length + ' chars' : 'null/empty');
                console.log('[reportParameters GSP] params.parameters:', params.parameters);
                if (params.configDsl) {
                    const escaped = params.configDsl
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    configCodeEl.innerHTML = '<code class="language-groovy">' + escaped + '</code>';
                    if (window.Prism) Prism.highlightElement(configCodeEl.querySelector('code'));
                    console.log('[reportParameters GSP] Configuration tab updated with DSL');
                } else {
                    console.warn('[reportParameters GSP] No configDsl available!');
                }
            }

            // Listen for config events (both for backward compatibility)
            console.log('[reportParameters GSP] Setting up event listeners on params element');
            params.addEventListener('configLoaded', function(e) {
                console.log('[reportParameters GSP] configLoaded event received:', e.detail);
                updateConfigDisplay();
            });
            params.addEventListener('configFetched', function(e) {
                console.log('[reportParameters GSP] configFetched event received:', e.detail);
                updateConfigDisplay();
            });
            params.addEventListener('fetchError', function(e) {
                console.error('[reportParameters GSP] fetchError event received:', e.detail);
            });

            // Also check immediately in case component already loaded before listener was attached
            console.log('[reportParameters GSP] Setting up fallback timeouts');
            setTimeout(function() {
                console.log('[reportParameters GSP] 100ms timeout check');
                updateConfigDisplay();
            }, 100);
            setTimeout(function() {
                console.log('[reportParameters GSP] 500ms timeout check');
                updateConfigDisplay();
            }, 500);
            setTimeout(function() {
                console.log('[reportParameters GSP] 1000ms timeout check');
                updateConfigDisplay();
            }, 1000);

            params.addEventListener('valueChange', function(e) {
                console.log('[reportParameters GSP] valueChange event received:', e.detail);
                valuesDisplay.textContent = JSON.stringify(e.detail, null, 2);
            });

            // Refresh button
            document.getElementById('refreshBtn').addEventListener('click', () => {
                if (params.fetchConfig) {
                    params.fetchConfig();
                }
            });

            // Copy config button
            document.getElementById('copyConfigBtn').addEventListener('click', function() {
                copyWithFeedback(this, document.getElementById('configCode').innerText);
            });

            // Highlight static usage code block
            var usageEl = document.querySelector('#usageCode code');
            if (usageEl && window.Prism) Prism.highlightElement(usageEl);

            // Copy usage button
            document.getElementById('copyUsageBtn').addEventListener('click', function() {
                copyWithFeedback(this, document.getElementById('usageCode').innerText);
            });

            // Run Report button - fetches filtered data based on parameter values
            document.getElementById('submitBtn').addEventListener('click', async function() {
                const btn = this;
                const originalText = btn.innerHTML;
                btn.innerHTML = SVG_SPINNER + ' Loading...';
                btn.disabled = true;

                try {
                    // Get current parameter values from the form
                    const paramValues = params.getValues ? params.getValues() : {};
                    console.log('[reportParameters GSP] Running report with params:', paramValues);

                    // Build query string from parameters
                    const queryParams = new URLSearchParams();
                    const appliedFilters = [];
                    for (const [key, value] of Object.entries(paramValues)) {
                        if (value !== null && value !== undefined && value !== '') {
                            queryParams.append(key, value);
                            appliedFilters.push({ key, value });
                        }
                    }

                    // Fetch filtered data from backend
                    const apiBaseUrl = '${RbUtils.apiBaseUrl}';
                    const reportId = 'par-employee-hire-dates';

                    // Short-lived, minted server-side by Grails, scoped to this one report. The API
                    // key stays on the server: it authenticates as an administrator and would be
                    // readable by every visitor if it were interpolated here.
                    const embedToken = '${RbUtils.embedToken('par-employee-hire-dates')}';

                    const headers = { 'Content-Type': 'application/json' };
                    if (embedToken) headers['X-Embed-Token'] = embedToken;

                    const dataUrl = apiBaseUrl + '/reports/' + reportId + '/data?' + queryParams.toString();
                    console.log('[reportParameters GSP] Fetching filtered data from:', dataUrl);

                    const response = await fetch(dataUrl, { headers });
                    if (!response.ok) throw new Error('Data fetch failed: ' + response.status);

                    const result = await response.json();
                    const data = Array.isArray(result) ? result : (result.data || []);

                    console.log('[reportParameters GSP] Filtered data received:', data.length, 'records');

                    // Update the single tabulator with filtered data
                    const dataTable = document.getElementById('dataTable');
                    const dataTableCard = document.getElementById('dataTableCard');
                    const filterBadge = document.getElementById('filterBadge');
                    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
                    const recordCount = document.getElementById('recordCount');
                    const filterStatus = document.getElementById('filterStatus');
                    const tableTitle = document.getElementById('tableTitle');

                    // Store original count for comparison (get from tabulator if available)
                    const originalCount = window.originalDataCount || data.length;

                    // Update table data
                    if (dataTable) {
                        dataTable.data = data;
                    }

                    // Update UI to show filtered state
                    if (appliedFilters.length > 0) {
                        dataTableCard.classList.add('filtered');
                        filterBadge.style.display = 'inline-block';
                        clearFiltersBtn.style.display = 'inline-block';
                        tableTitle.textContent = 'Filtered Results';
                        recordCount.innerHTML = '<strong>' + data.length + '</strong> of ' + originalCount + ' records';

                        // Build filter description
                        let filterDesc = SVG_FUNNEL + ' <strong>Filters applied:</strong> ';
                        filterDesc += appliedFilters.map(f => '<span class="filter-param">' + f.key + ' = ' + f.value + '</span>').join(' ');
                        filterStatus.innerHTML = filterDesc;
                    }

                } catch (error) {
                    console.error('[reportParameters GSP] Error running report:', error);
                    document.getElementById('filterStatus').innerHTML =
                        SVG_X_CIRCLE + ' <strong>Error:</strong> ' + error.message;
                } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });

            // Clear Filters button - reloads original data
            document.getElementById('clearFiltersBtn').addEventListener('click', async function() {
                const dataTable = document.getElementById('dataTable');
                const dataTableCard = document.getElementById('dataTableCard');
                const filterBadge = document.getElementById('filterBadge');
                const clearFiltersBtn = document.getElementById('clearFiltersBtn');
                const recordCount = document.getElementById('recordCount');
                const filterStatus = document.getElementById('filterStatus');
                const tableTitle = document.getElementById('tableTitle');

                // Reset UI
                dataTableCard.classList.remove('filtered');
                filterBadge.style.display = 'none';
                clearFiltersBtn.style.display = 'none';
                tableTitle.textContent = 'Sample Data';
                filterStatus.innerHTML = SVG_INFO + ' Showing all records. Use the parameters above and click "Run Report" to filter.';

                // Reload original data
                if (dataTable && dataTable.fetchData) {
                    dataTable.fetchData({});
                } else {
                    // Fallback: reload the page section
                    location.reload();
                }
            });

            // Track original data count when tabulator loads
            const dataTable = document.getElementById('dataTable');
            if (dataTable) {
                dataTable.addEventListener('dataLoaded', function(e) {
                    const data = e.detail && e.detail.data ? e.detail.data : [];
                    window.originalDataCount = Array.isArray(data) ? data.length : 0;
                    document.getElementById('recordCount').textContent = window.originalDataCount + ' records';
                    console.log('[reportParameters GSP] Original data loaded:', window.originalDataCount, 'records');
                });
                // Also try ready event
                dataTable.addEventListener('ready', function(e) {
                    setTimeout(() => {
                        if (dataTable.data && Array.isArray(dataTable.data)) {
                            window.originalDataCount = dataTable.data.length;
                            document.getElementById('recordCount').textContent = window.originalDataCount + ' records';
                        }
                    }, 200);
                });
            }
        });
    </script>
    </content>
</body>
</html>
