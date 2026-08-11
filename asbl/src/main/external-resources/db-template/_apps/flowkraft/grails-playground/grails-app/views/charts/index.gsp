<%@ page import="flowkraft.frend.RbUtils" %>
<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="main"/>
    <title>Charts - DataPallas</title>
    <style>
        rb-chart { display: block; width: 100%; height: 400px; }
        .example-card {
            border: 1px solid var(--color-base-300);
            border-radius: 8px;
            margin-bottom: 1.5rem;
            overflow: hidden;
            padding: 1rem;
        }
        .example-title { margin: 0 0 0.25rem 0; font-weight: 600; font-size: 0.95rem; }
        .example-desc { color: color-mix(in oklab, var(--color-base-content) 60%, transparent); font-size: 0.85rem; margin: 0 0 1rem 0; }
        .category-header {
            font-size: 1.1rem;
            font-weight: 700;
            margin: 2rem 0 1rem 0;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--color-primary);
        }
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
            max-height: 600px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="flex flex-wrap gap-4 mt-4">
            <div class="w-full">
                <h4 class="mb-2">Charts</h4>
                <p class="text-base-content/60 mb-4">Data visualization powered by <code>&lt;rb-chart&gt;</code>.</p>

                <!-- Page-level tabs -->
                <div class="tabs tabs-bordered" role="tablist">
                    <input type="radio" name="page-tabs" role="tab" class="tab" aria-label="Examples" id="examples-tab" checked />
                    <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="examples-pane">

                        <h5 class="category-header">Live Examples</h5>

                        <g:render template="example" model="[id: 'monthlySalesTrend', title: 'Line Chart', desc: 'If a dashboard has one chart, it is a line showing a metric over time — revenue, pipeline, MRR, stock price, traffic. This dataset includes a seasonal dip in summer and a strong Q4 holiday spike to demonstrate trend visualization.']" />
                        <g:render template="example" model="[id: 'salesByRegion', title: 'Bar Chart', desc: 'A single metric compared across categories — the simplest bar chart users reach for. Sales by region, output by plant, income by source. Clear differences between regions make the bar comparisons immediately meaningful.']" />
                        <g:render template="example" model="[id: 'revenueVsExpenses', title: 'Grouped Bar Chart', desc: 'P&L side-by-side in every ERP and finance dashboard. Revenue vs Cost, This Year vs Last Year, Budget vs Actual — always two bars per category so managers can compare at a glance. Revenue grows each quarter but expenses grow faster in Q3 (investment), then normalize — the visual gap tells the P&L story.']" />
                        <g:render template="example" model="[id: 'expenseBreakdown', title: 'Pie Chart', desc: 'Where does the money go? Every finance team, every budget review, every department head meeting. Pie is the go-to for showing proportions of a whole — expense categories, revenue sources, cost centers. Salaries dominate (as they do in reality), with clear visual wedge differences.']" />
                        <g:render template="example" model="[id: 'revenueAndProfitMargin', title: 'Dual Y-Axis Mixed Chart', desc: 'Executive KPI dashboard: Revenue ($, bars, left axis) + Profit Margin (%, line, right axis). CFOs and VPs of Sales always want to see the dollar amount alongside the percentage in one view. Revenue grows but margin compresses in Q3 (investment quarter), then recovers — the inverse relationship tells the story.']" />
                        <g:render template="example" model="[id: 'quarterlyRevenueByProduct', title: 'Stacked Bar Chart', desc: 'How much of Q3 revenue came from each product line? Stacked bars show composition over time — extremely common in ERP product analytics, SaaS plan-level MRR breakdowns, and regional contribution reports. Software is the largest segment and growing, Services is stable, Support grows modestly.']" />
                        <g:render template="example" model="[id: 'portfolioAllocation', title: 'Doughnut Chart', desc: 'Financial apps: investment portfolio split, fund allocation, asset class weights. Also used for market share, product revenue mix. Doughnut with cutout is the modern alternative to pie when you want to show a KPI or total in the center hole. Classic 60/40 portfolio skew — equities dominate, bonds buffer, alternatives are a small slice.']" />
                        <g:render template="example" model="[id: 'budgetVsActual', title: 'Area Chart', desc: 'Financial planning: budget as a filled baseline area, actual as a dashed line overlay. January-March: under budget (good). April-May: over budget (warning). June-August: back on track. This pattern makes the overlay meaningful. Also used for sales target tracking, project spend monitoring, and forecast vs reality comparisons.']" />
                        <g:render template="example" model="[id: 'topCustomersByRevenue', title: 'Horizontal Bar Chart', desc: 'CRM ranking reports: Top 10 Customers, Top Products by Units Sold, Sales Leaderboard by Rep. Horizontal bars are the natural choice for ranked lists where category labels (company names) are long. Sorted descending so the biggest customer is on top.']" />
                        <g:render template="example" model="[id: 'employeePerformance', title: 'Radar Chart', desc: 'HR: comparing employee scores across 6-8 skill dimensions against the team average. This employee excels at Technical Skills and Problem Solving but falls below team average on Communication and Time Management — a realistic review profile. Also used for supplier evaluation scorecards and product feature comparison matrices.']" />
                        <g:render template="example" model="[id: 'customerSatisfaction', title: 'Polar Area Chart', desc: 'Customer success / quality teams: NPS or CSAT scores broken down by support channel (phone, email, chat, in-person). Each wedge radius shows the score magnitude — useful when categories are not parts of a whole but each has an independent score. Live Chat scores highest, Social Media lowest — typical CSAT pattern where newer channels still lag traditional support.']" />

                    </div>

                    <input type="radio" name="page-tabs" role="tab" class="tab" aria-label="Configuration" id="config-tab" />
                    <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="config-pane">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-base-content/60 text-sm">Groovy DSL — shared configuration for all examples</span>
                            <button id="copyConfigBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="configCode" class="code-block"><code class="language-groovy">Loading configuration...</code></pre>
                    </div>

                    <input type="radio" name="page-tabs" role="tab" class="tab" aria-label="Usage" id="usage-tab" />
                    <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="usage-pane">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-base-content/60 text-sm">HTML Usage</span>
                            <button id="copyUsageBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="usageCode" class="code-block"><code class="language-markup">&lt;rb-chart
    report-id="your-report-id"
    component-id="yourComponentId"
    api-base-url="&#36;{RbUtils.apiBaseUrl}"
    embed-token="&#36;{RbUtils.embedToken('your-report-id')}"
&gt;&lt;/rb-chart&gt;</code></pre>
                    </div>
                </div>

            </div>
        </div>
    </div>

    <!-- Toast -->
    <div id="copyToast" class="toast toast-end toast-bottom hidden" style="position:fixed;z-index:1090;">
        <div class="alert alert-success gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> Copied to clipboard!
        </div>
    </div>

    <content tag="scripts">
    <script>
        var SVG_CLIPBOARD = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>';
        var SVG_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>';
        document.addEventListener('DOMContentLoaded', function() {
            var copyToastEl = document.getElementById('copyToast');
            function showToast() {
                copyToastEl.classList.remove('hidden');
                setTimeout(function() { copyToastEl.classList.add('hidden'); }, 2000);
            }
            var configCodeEl = document.getElementById('configCode');

            function copyWithFeedback(btn, text) {
                navigator.clipboard.writeText(text).then(function() {
                    btn.innerHTML = SVG_CHECK;
                    showToast();
                    setTimeout(function() {
                        btn.innerHTML = SVG_CLIPBOARD;
                    }, 2000);
                });
            }

            // Listen to first rb-chart for shared configDsl
            var firstComponent = document.querySelector('rb-chart[report-id="charts-examples"]');
            function updateConfigDisplay() {
                if (firstComponent && firstComponent.configDsl) {
                    var escaped = firstComponent.configDsl
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    configCodeEl.innerHTML = '<code class="language-groovy">' + escaped + '</code>';
                    if (window.Prism) Prism.highlightElement(configCodeEl.querySelector('code'));
                }
            }
            if (firstComponent) {
                firstComponent.addEventListener('configLoaded', updateConfigDisplay);
                firstComponent.addEventListener('dataFetched', updateConfigDisplay);
                setTimeout(updateConfigDisplay, 500);
            }

            // Highlight static usage code block
            var usageEl = document.querySelector('#usageCode code');
            if (usageEl && window.Prism) Prism.highlightElement(usageEl);

            // Copy buttons
            document.getElementById('copyConfigBtn').addEventListener('click', function() {
                copyWithFeedback(this, firstComponent ? firstComponent.configDsl || '' : '');
            });
            document.getElementById('copyUsageBtn').addEventListener('click', function() {
                copyWithFeedback(this, document.getElementById('usageCode').innerText);
            });
        });
    </script>
    </content>
</body>
</html>
