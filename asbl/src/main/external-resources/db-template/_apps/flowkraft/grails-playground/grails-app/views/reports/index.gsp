<%@ page import="flowkraft.frend.RbUtils" %>
<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="main"/>
    <title>Reports - DataPallas</title>
    <style>
        .employee-cards { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .employee-card {
            padding: 1rem 1.5rem;
            border: 2px solid var(--color-base-300);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            background: var(--color-base-100);
            min-width: 180px;
        }
        .employee-card:hover { border-color: var(--color-primary); background: color-mix(in oklab, var(--color-primary) 14%, var(--color-base-100)); }
        .employee-card.active { border-color: var(--color-primary); background: color-mix(in oklab, var(--color-primary) 14%, var(--color-base-100)); box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 20%, transparent); }
        .employee-name { font-weight: 600; color: var(--color-primary); }
        .employee-id { font-size: 0.85rem; color: color-mix(in oklab, var(--color-base-content) 60%, transparent); }
        .payslip-container { min-height: 400px; }
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
    </style>
</head>
<body>
    <div class="mt-4">
        <div class="w-full">
            <h4 class="mb-3">Reports</h4>
            <p class="text-base-content/60 mb-4">
                Embed full reports using the <code>&lt;rb-report&gt;</code> component in <code>entity-code</code> mode.
                Click a person's name to view their document.
            </p>

            <!-- daisyUI Tabs -->
            <div class="tabs tabs-bordered" id="reportsTabs">
                <input type="radio" name="reports-tabs" role="tab" class="tab" aria-label="Report" id="component-tab" checked/>
                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="component-pane">
                    <!-- Employee Selection -->
                    <div class="mb-3">
                        <label class="label label-text font-semibold">Select Employee:</label>
                        <div class="employee-cards" id="employeeCards">
                            <div class="employee-card" data-code="EMP001">
                                <div class="employee-name">Alice Johnson</div>
                                <div class="employee-id">EMP001 • Engineering</div>
                            </div>
                            <div class="employee-card" data-code="EMP002">
                                <div class="employee-name">Bob Smith</div>
                                <div class="employee-id">EMP002 • Sales</div>
                            </div>
                            <div class="employee-card" data-code="EMP003">
                                <div class="employee-name">Carol Williams</div>
                                <div class="employee-id">EMP003 • Marketing</div>
                            </div>
                        </div>
                    </div>

                    <!-- Payslip Display -->
                    <div class="card bg-base-100 border border-base-300">
                        <div class="card-body">
                            <div class="flex justify-between items-center mb-2">
                                <h2 class="card-title text-base">Employee Payslip</h2>
                                <button id="refreshBtn" class="btn btn-outline btn-sm" title="Refresh">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                                </button>
                            </div>
                            <div class="payslip-container">
                                <div id="placeholder" class="text-center text-base-content/60 py-5">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:3rem;height:3rem;display:block;margin:0 auto 0.75rem;opacity:0.4;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                                    <p class="mt-3">Select an employee above to view their payslip</p>
                                </div>
                                <rb-report
                                    id="demoReport"
                                    report-id="rep-employee-payslip"
                                    api-base-url="${RbUtils.apiBaseUrl}"
                                    api-key="${RbUtils.apiKey}"
                                    style="display: none;"
                                    show-print-button
                                    print-button-label="Print / Save PDF"
                                ></rb-report>
                            </div>
                        </div>
                    </div>
                </div>

                <input type="radio" name="reports-tabs" role="tab" class="tab" aria-label="Usage" id="usage-tab"/>
                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="usage-pane">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-base-content/60 text-sm">HTML Usage with Entity Code</span>
                        <button id="copyUsageBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                        </button>
                    </div>
                    <pre id="usageCode" class="code-block"><code class="language-markup">&lt;rb-report
    report-id="rep-employee-payslip"
    entity-code="EMP001"
    api-base-url="&#36;{RbUtils.apiBaseUrl}"
    api-key="&#36;{RbUtils.apiKey}"
&gt;&lt;/rb-report&gt;

&lt;!-- The entity-code attribute specifies which
     employee's payslip to render. The component
     fetches data and renders the HTML template
     server-side for that specific entity. --&gt;</code></pre>
                </div>
            </div>
        </div>
    </div>

    <!-- Toast -->
    <div id="copyToast" class="toast toast-end toast-bottom hidden" style="position:fixed;z-index:1090;">
        <div class="alert alert-success">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg> Copied to clipboard!
        </div>
    </div>

    <content tag="scripts">
    <script>
        var SVG_CLIPBOARD = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>';
        var SVG_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>';

        document.addEventListener('DOMContentLoaded', function() {
            function showToast() {
                const el = document.getElementById('copyToast');
                el.classList.remove('hidden');
                setTimeout(() => el.classList.add('hidden'), 2000);
            }
            const report = document.getElementById('demoReport');
            const placeholder = document.getElementById('placeholder');
            const cards = document.querySelectorAll('.employee-card');
            let currentEntityCode = null;

            function selectEmployee(code) {
                console.log('[reports GSP] selectEmployee called with code:', code);

                // Update active state
                cards.forEach(c => c.classList.remove('active'));
                document.querySelector('[data-code="' + code + '"]')?.classList.add('active');

                // Show report, hide placeholder
                placeholder.style.display = 'none';
                report.style.display = 'block';

                // Set entity code - component will fetch automatically
                currentEntityCode = code;
                console.log('[reports GSP] Setting report.entity-code attribute to:', code);
                report.setAttribute('entity-code', code);

                // Log current component state
                console.log('[reports GSP] report element:', report);
                console.log('[reports GSP] report.entityCode (before toggle):', report.entityCode);
                console.log('[reports GSP] report.reportId:', report.reportId);
                console.log('[reports GSP] report.apiBaseUrl:', report.apiBaseUrl);

                // Force re-fetch by toggling entityCode
                console.log('[reports GSP] Toggling entityCode to trigger re-fetch...');
                report.entityCode = '';
                setTimeout(() => {
                    console.log('[reports GSP] Setting report.entityCode to:', code);
                    report.entityCode = code;
                    console.log('[reports GSP] report.entityCode (after set):', report.entityCode);
                }, 10);
            }

            // Employee card click handlers
            cards.forEach(card => {
                card.addEventListener('click', function() {
                    selectEmployee(this.dataset.code);
                });
            });

            // Refresh button
            document.getElementById('refreshBtn').addEventListener('click', () => {
                if (currentEntityCode) {
                    report.entityCode = '';
                    setTimeout(() => { report.entityCode = currentEntityCode; }, 10);
                }
            });

            // Highlight static usage code block
            var usageEl = document.querySelector('#usageCode code');
            if (usageEl && window.Prism) Prism.highlightElement(usageEl);

            // Copy usage button
            document.getElementById('copyUsageBtn').addEventListener('click', function() {
                var btn = this;
                const text = document.getElementById('usageCode').innerText;
                navigator.clipboard.writeText(text).then(function() {
                    btn.innerHTML = SVG_CHECK;
                    showToast();
                    setTimeout(function() { btn.innerHTML = SVG_CLIPBOARD; }, 2000);
                });
            });

            // Auto-select first employee on load (random for variety)
            const codes = ['EMP001', 'EMP002', 'EMP003'];
            const randomCode = codes[Math.floor(Math.random() * codes.length)];
            selectEmployee(randomCode);
        });
    </script>
    </content>
</body>
</html>
