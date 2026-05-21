<%@ page import="flowkraft.frend.RbUtils" %>
<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="main"/>
    <title>Pivot Tables - DataPallas</title>
    <style>
        rb-pivot-table { display: block; width: 100%; }
        rb-tabulator { display: block; width: 100%; min-height: 300px; }
        .example-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            overflow: hidden;
            padding: 1rem;
        }
        [data-theme="dark"] .example-card { border-color: #334155; }
        .example-title { margin: 0 0 0.25rem 0; font-weight: 600; font-size: 0.95rem; }
        .example-desc { color: #6b7280; font-size: 0.85rem; margin: 0 0 1rem 0; }
        [data-theme="dark"] .example-desc { color: #94a3b8; }
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
        .howto-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 1.5rem;
            margin-top: 2rem;
        }
        [data-theme="dark"] .howto-section { background: #1e293b; }
        .howto-section h5 {
            color: #2563eb;
            margin-bottom: 1rem;
        }
        [data-theme="dark"] .howto-section h5 { color: #60a5fa; }
        .howto-section h6 {
            color: #1e40af;
            margin-top: 1.25rem;
            margin-bottom: 0.5rem;
        }
        [data-theme="dark"] .howto-section h6 { color: #93c5fd; }
        .howto-section .step {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 1rem;
            margin-bottom: 0.75rem;
        }
        [data-theme="dark"] .howto-section .step { background: #0f172a; border-color: #334155; }
        .howto-section .step-title {
            font-weight: 600;
            color: #334155;
            margin-bottom: 0.5rem;
        }
        [data-theme="dark"] .howto-section .step-title { color: #e2e8f0; }
        .howto-section .step-action {
            font-family: monospace;
            background: #e0e7ff;
            padding: 2px 6px;
            border-radius: 4px;
            color: #3730a3;
        }
        [data-theme="dark"] .howto-section .step-action { background: #312e81; color: #c7d2fe; }
        .howto-section .insight {
            color: #059669;
            font-style: italic;
        }
        .howto-section ul {
            margin-bottom: 0;
        }
        .howto-section .sql-compare {
            background: #1e1e1e;
            color: #9cdcfe;
            font-family: monospace;
            font-size: 0.8rem;
            padding: 0.75rem;
            border-radius: 6px;
            margin: 0.5rem 0;
        }
        .howto-section .pivot-compare {
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            padding: 0.75rem;
            border-radius: 6px;
            margin: 0.5rem 0;
        }
        [data-theme="dark"] .howto-section .pivot-compare { background: #064e3b; border-color: #065f46; }
    </style>
</head>
<body>
    <div class="container">
        <div class="flex flex-wrap gap-4 mt-4">
            <div class="w-full">
                <h4 class="mb-2">Pivot Tables</h4>
                <p class="text-base-content/60 mb-4">Drag-and-drop data analysis with aggregation and grouping, powered by <code>&lt;rb-pivot-table&gt;</code>.</p>

                <!-- Page-level tabs -->
                <div class="tabs tabs-bordered" role="tablist">
                    <input type="radio" name="page-tabs" role="tab" class="tab" aria-label="Examples" id="examples-tab" checked />
                    <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="examples-pane">

                        <h5 class="category-header">Fundamentals</h5>

                        <g:render template="example" model="[id: 'salesByRegionSum', title: 'Basic Sum Pivot Table', desc: 'One row dimension, one value field, Sum aggregation — the four properties every pivot config needs. Groups revenue by region.']" />
                        <g:render template="example" model="[id: 'orderCountByProductQuarter', title: 'Cross-Tabulation', desc: 'Adding cols turns a flat list into a matrix. Products form rows, quarters form columns, Count aggregator tallies orders per cell.']" />
                        <g:render template="example" model="[id: 'revenueMultiDimension', title: 'Multi-Dimension', desc: 'Multiple entries in rows and cols create nested hierarchies — region then country on the left, product line across the top.']" />
                        <g:render template="example" model="[id: 'avgOrderValueByChannel', title: 'Average Aggregator', desc: 'Average instead of Sum reveals that Enterprise orders are 10x the size of Marketplace orders — information hidden when you only look at totals.']" />

                        <h5 class="category-header">Filtering &amp; Sorting</h5>

                        <g:render template="example" model="[id: 'filteredByStatus', title: 'Value Filter', desc: 'valueFilter removes specific dimension values before any calculation runs. Here Inactive and Pending records are excluded — only Active revenue shown.']" />
                        <g:render template="example" model="[id: 'sortedRevenue', title: 'Sorted by Value Descending', desc: 'rowOrder value_z_to_a ranks rows by aggregated total (highest revenue first), colOrder key_a_to_z keeps years chronological. Standard executive summary layout.']" />
                        <g:render template="example" model="[id: 'customSorters', title: 'Custom Sort Order', desc: 'sorters overrides alphabetical ordering with a business-specific sequence: West → Central → East → International, matching sales org structure.']" />

                        <h5 class="category-header">Renderers</h5>

                        <g:render template="example" model="[id: 'pipelineHeatmap', title: 'Heatmap', desc: 'Table Heatmap colors every cell relative to the global maximum. Spot the single biggest number at a glance — Nora Negotiation deals stand out as the peak.']" />
                        <g:render template="example" model="[id: 'pipelineGroupedBar', title: 'Grouped Bar Chart', desc: 'One bar per column value side by side for each row. Three bars per deal stage — one per sales rep — compare individual contributions within a stage.']" />
                        <g:render template="example" model="[id: 'pipelineLineChart', title: 'Line Chart', desc: 'One line per sales rep across deal stages shows pipeline trajectory. All reps peak at Negotiation before dropping at Closed Won — the classic funnel shape.']" />

                        <h5 class="category-header">Aggregators</h5>

                        <g:render template="example" model="[id: 'revenuePerUnit', title: 'Revenue per Unit (Ratio)', desc: 'Sum over Sum divides revenue by quantity — producing price-per-unit. Widget B commands ~$800/unit (premium), Gadget X ~$155/unit (volume play).']" />
                        <g:render template="example" model="[id: 'fractionOfTotal', title: 'Percentage of Total', desc: 'Sum as Fraction of Total converts raw numbers into percentages. North America Software alone accounts for nearly a third of all revenue.']" />
                        <g:render template="example" model="[id: 'countUniqueValues', title: 'Count Distinct', desc: 'Count Unique Values counts distinct values, not row count. Answers: how many different products were ordered per region per quarter?']" />

                        <h5 class="category-header">Advanced</h5>

                        <g:render template="example" model="[id: 'derivedAttributes', title: 'Derived Attributes (Year from Date)', desc: 'derivedAttributes creates new dimensions from existing fields at render time — year and quarter extracted from raw orderDate timestamps.']" />
                        <g:render template="example" model="[id: 'fieldVisibility', title: 'Field Visibility Controls', desc: 'Three levels: hiddenAttributes removes fields entirely (IDs), hiddenFromAggregators prevents sum/avg (names), hiddenFromDragDrop locks fields in place.']" />

                        <h5 class="category-header">Putting It All Together</h5>

                        <!-- Sales Overview with inner tabs -->
                        <div class="example-card">
                            <h6 class="example-title">Sales Overview — Region × Product × Quarter</h6>
                            <p class="example-desc">64 rows of sales data (4 Regions × 4 Products × 4 Quarters). Drag, filter, aggregate, visualize — instant analysis grid.</p>

                            <div class="tabs tabs-bordered" role="tablist">
                                <input type="radio" name="sales-overview-tabs" role="tab" class="tab" aria-label="Pivot Table" id="so-pivot-tab" checked />
                                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="so-pivot-pane">
                                    <rb-pivot-table
                                        id="demoPivot"
                                        report-id="piv-examples"
                                        component-id="salesOverview"
                                        api-base-url="${RbUtils.apiBaseUrl}"
                                        api-key="${RbUtils.apiKey}"
                                    ></rb-pivot-table>

                                    <!-- How to Use narrative -->
                                    <div class="howto-section">
                                        <h5><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg> How to Use This Pivot Table</h5>

                                        <p><strong>What you're looking at:</strong> 64 rows of sales data — 4 Regions × 4 Products × 4 Quarters.
                                        The pivot table transforms this into an instant analysis grid. No SQL, no formulas.</p>

                                        <h6>Quick Actions (Try These Now)</h6>

                                        <div class="step">
                                            <div class="step-title">1. Change the Metric</div>
                                            <p class="mb-1">Current: <span class="step-action">Sum of Revenue</span></p>
                                            <p class="mb-1"><strong>Try:</strong> Click the <span class="step-action">Revenue ▼</span> dropdown (top area) → Select <strong>Profit</strong></p>
                                            <p class="mb-0 insight">→ Now see profit margins. High revenue but low profit? You'll spot it instantly.</p>
                                        </div>

                                        <div class="step">
                                            <div class="step-title">2. Rearrange Dimensions</div>
                                            <p class="mb-1"><strong>Try:</strong> Drag <span class="step-action">Quarter</span> from columns → Drop into rows below Region</p>
                                            <p class="mb-0 insight">→ Now quarters are rows. "Which quarter was strongest?" — see row totals immediately.</p>
                                        </div>

                                        <div class="step">
                                            <div class="step-title">3. Add a Dimension</div>
                                            <p class="mb-1"><strong>Try:</strong> Drag <span class="step-action">SalesRep</span> from unused area → Drop into rows after Product</p>
                                            <p class="mb-0 insight">→ See Region → Product → SalesRep hierarchy. "Who sold most Laptops in North?" — answered.</p>
                                        </div>

                                        <div class="step">
                                            <div class="step-title">4. Filter Data</div>
                                            <p class="mb-1"><strong>Try:</strong> Click the <span class="step-action">▼</span> triangle next to Region → Uncheck North and West</p>
                                            <p class="mb-0 insight">→ Table now shows ONLY South and East. Focus on what matters.</p>
                                        </div>

                                        <div class="step">
                                            <div class="step-title">5. Change Aggregation</div>
                                            <p class="mb-1"><strong>Try:</strong> Click <span class="step-action">Sum ▼</span> dropdown (top left) → Select <strong>Average</strong></p>
                                            <p class="mb-0 insight">→ See average per transaction, not totals. "Are Q4 prices higher or just more volume?"</p>
                                        </div>

                                        <div class="step">
                                            <div class="step-title">6. Visualize as Chart</div>
                                            <p class="mb-1"><strong>Try:</strong> Click <span class="step-action">Table ▼</span> dropdown → Select <strong>Grouped Column Chart</strong></p>
                                            <p class="mb-0 insight">→ Same data, visual format. Trends jump out. Try "Stacked Bar" or "Line Chart" too.</p>
                                        </div>

                                        <h6>Real Business Questions This Answers</h6>
                                        <ul>
                                            <li><strong>"Which product is our cash cow?"</strong> — Put Product in rows, look at Totals column. Laptop has the highest revenue.</li>
                                            <li><strong>"Is East region underperforming?"</strong> — Compare region totals in the current view. Spot gaps instantly.</li>
                                            <li><strong>"Who gets the sales bonus?"</strong> — Drag SalesRep to rows, sort by totals. Highest revenue wins.</li>
                                            <li><strong>"Are we profitable or just busy?"</strong> — Switch from Revenue to Profit. High revenue + low margins? Now you see it.</li>
                                        </ul>

                                        <h6>The Point: Why This Matters</h6>

                                        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
                                            <div style="grid-column:span 6">
                                                <p class="mb-1"><strong>Without pivot table:</strong></p>
                                                <div class="sql-compare">
<pre class="mb-0">-- Question 1: Revenue by region
SELECT Region, SUM(Revenue)
FROM sales GROUP BY Region;

-- Question 2: Revenue by product
SELECT Product, SUM(Revenue)
FROM sales GROUP BY Product;

-- 20 more queries for different angles...</pre>
                                                </div>
                                            </div>
                                            <div style="grid-column:span 6">
                                                <p class="mb-1"><strong>With pivot table:</strong></p>
                                                <div class="pivot-compare">
                                                    <strong>✓</strong> Drag Region to rows → Question 1 answered<br>
                                                    <strong>✓</strong> Drag Product instead → Question 2 answered<br>
                                                    <strong>✓</strong> 3 seconds total, no coding<br>
                                                    <strong>✓</strong> 1000 ways to slice the same data
                                                </div>
                                            </div>
                                        </div>

                                        <p class="mt-3 mb-0">
                                            <strong>Bottom line:</strong> Pivot tables = SQL GROUP BY + Excel formulas + visualization — combined.
                                            Drag and drop. Instant answers. Questions answered faster = better decisions.
                                        </p>
                                    </div>
                                </div>

                                <input type="radio" name="sales-overview-tabs" role="tab" class="tab" aria-label="Raw Data" id="so-rawdata-tab" />
                                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="so-rawdata-pane">
                                    <p class="text-base-content/60 text-sm mb-3">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg> This is the raw source data (64 rows) that feeds the pivot table.
                                    </p>
                                    <rb-tabulator
                                        id="rawDataTable"
                                        report-id="piv-examples"
                                        component-id="salesOverview"
                                        api-base-url="${RbUtils.apiBaseUrl}"
                                        api-key="${RbUtils.apiKey}"
                                    ></rb-tabulator>
                                </div>

                                <input type="radio" name="sales-overview-tabs" role="tab" class="tab" aria-label="Configuration" id="so-config-tab" />
                                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="so-config-pane">
                                    <div class="flex justify-between items-start mb-2">
                                        <span class="text-base-content/60 text-sm">Groovy DSL — salesOverview configuration</span>
                                        <button id="copySoConfigBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                                        </button>
                                    </div>
                                    <pre id="soConfigCode" class="code-block"><code class="language-groovy">Loading configuration...</code></pre>
                                </div>

                                <input type="radio" name="sales-overview-tabs" role="tab" class="tab" aria-label="Usage" id="so-usage-tab" />
                                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="so-usage-pane">
                                    <div class="flex justify-between items-start mb-2">
                                        <span class="text-base-content/60 text-sm">HTML Usage</span>
                                        <button id="copySoUsageBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                                        </button>
                                    </div>
                                    <pre id="soUsageCode" class="code-block"><code class="language-markup">&lt;rb-pivot-table
    report-id="piv-examples"
    component-id="salesOverview"
    api-base-url="&#36;{RbUtils.apiBaseUrl}"
    api-key="&#36;{RbUtils.apiKey}"
&gt;&lt;/rb-pivot-table&gt;</code></pre>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- Configuration Tab -->
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

                    <!-- Usage Tab -->
                    <input type="radio" name="page-tabs" role="tab" class="tab" aria-label="Usage" id="usage-tab" />
                    <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="usage-pane">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-base-content/60 text-sm">HTML Usage</span>
                            <button id="copyUsageBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="usageCode" class="code-block"><code class="language-markup">&lt;rb-pivot-table
    report-id="your-report-id"
    component-id="yourComponentId"
    api-base-url="&#36;{RbUtils.apiBaseUrl}"
    api-key="&#36;{RbUtils.apiKey}"
&gt;&lt;/rb-pivot-table&gt;</code></pre>
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

            // Listen to first rb-pivot-table for shared configDsl
            var firstComponent = document.querySelector('rb-pivot-table[report-id="piv-examples"]');
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

            // Highlight static usage code blocks
            document.querySelectorAll('#usageCode code, #soUsageCode code').forEach(function(el) {
                if (window.Prism) Prism.highlightElement(el);
            });

            // Copy buttons (page-level)
            document.getElementById('copyConfigBtn').addEventListener('click', function() {
                copyWithFeedback(this, firstComponent ? firstComponent.configDsl || '' : '');
            });
            document.getElementById('copyUsageBtn').addEventListener('click', function() {
                copyWithFeedback(this, document.getElementById('usageCode').innerText);
            });

            // Sales Overview inner tabs — config display + copy
            var demoPivot = document.getElementById('demoPivot');
            var soConfigCodeEl = document.getElementById('soConfigCode');
            function updateSoConfig() {
                if (demoPivot && demoPivot.configDsl) {
                    var escaped = demoPivot.configDsl
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    soConfigCodeEl.innerHTML = '<code class="language-groovy">' + escaped + '</code>';
                    if (window.Prism) Prism.highlightElement(soConfigCodeEl.querySelector('code'));
                }
            }
            if (demoPivot) {
                demoPivot.addEventListener('configLoaded', updateSoConfig);
                demoPivot.addEventListener('dataFetched', updateSoConfig);
                setTimeout(updateSoConfig, 500);
            }
            document.getElementById('copySoConfigBtn').addEventListener('click', function() {
                copyWithFeedback(this, demoPivot ? demoPivot.configDsl || '' : '');
            });
            document.getElementById('copySoUsageBtn').addEventListener('click', function() {
                copyWithFeedback(this, document.getElementById('soUsageCode').innerText);
            });
        });
    </script>
    </content>
</body>
</html>
