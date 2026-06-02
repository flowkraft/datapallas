<%@ page import="flowkraft.frend.RbUtils" %>
<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="main"/>
    <title>Data Warehouse - DataPallas</title>
    <style>
        rb-pivot-table { display: block; width: 100%; margin-bottom: 2rem; }
        rb-tabulator { display: block; width: 100%; min-height: 300px; }
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
            max-height: 400px;
        }
        .engine-section {
            border: 1px solid var(--color-base-300);
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1.5rem;
            background: var(--color-base-100);
        }
        .engine-section h6 {
            color: var(--color-primary);
            margin-bottom: 0.75rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .engine-section .engine-desc {
            font-size: 0.9rem;
            color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
            margin-bottom: 1rem;
        }
        .howto-section {
            background: var(--color-base-200);
            border-radius: 8px;
            padding: 1.5rem;
            margin-top: 2rem;
        }
        .howto-section h5 {
            color: var(--color-primary);
            margin-bottom: 1rem;
        }
        .howto-section h6 {
            color: var(--color-primary);
            margin-top: 1.25rem;
            margin-bottom: 0.5rem;
        }
        .howto-section .step {
            background: var(--color-base-100);
            border: 1px solid var(--color-base-300);
            border-radius: 6px;
            padding: 1rem;
            margin-bottom: 0.75rem;
        }
        .howto-section .step-title {
            font-weight: 600;
            color: var(--color-base-content);
            margin-bottom: 0.5rem;
        }
        .howto-section .step-action {
            font-family: monospace;
            background: color-mix(in oklab, var(--color-primary) 14%, var(--color-base-100));
            padding: 2px 6px;
            border-radius: 4px;
            color: var(--color-primary);
        }
        .howto-section .insight {
            color: var(--color-success);
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
            background: color-mix(in oklab, var(--color-success) 14%, var(--color-base-100));
            border: 1px solid color-mix(in oklab, var(--color-success) 40%, var(--color-base-100));
            padding: 0.75rem;
            border-radius: 6px;
            margin: 0.5rem 0;
        }
        .engine-section[id] {
            scroll-margin-top: 80px;
        }
        .tier-card {
            border: 1px solid var(--color-base-300);
            border-radius: 8px;
            padding: 1rem;
            height: 100%;
            transition: border-color 0.2s;
        }
        .tier-card:hover {
            border-color: var(--color-primary);
        }
        .tier-card .volume-badge {
            display: inline-block;
            font-size: 0.75rem;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 12px;
            margin-bottom: 0.5rem;
        }
        .tier-card.tier-browser .volume-badge { background: #dbeafe; color: #1e40af; }
        .tier-card.tier-duckdb .volume-badge { background: #fef3c7; color: #92400e; }
        .tier-card.tier-clickhouse .volume-badge { background: #fce7f3; color: #9d174d; }
    </style>
</head>
<body>
    <div class="flex flex-wrap gap-4 mt-4">
        <div class="w-full">
            <h4 class="mb-3"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg>Northwind Data Warehouse (Sample Data)</h4>
            <p class="text-base-content/60 mb-3">OLAP analysis on ~8,000 sample sales transactions with Browser, DuckDB, and ClickHouse engines.
                All three engines share the same data and the same pivot configuration &mdash; so you can compare them side by side and switch engines without changing anything else.</p>

            <!-- Data Warehouse Facts -->
            <div class="mb-4">
                <p class="mb-2">
                    Data warehouses store large volumes of business data for historical analysis and reporting.
                    Processing these volumes requires specialized techniques &mdash; but more tools mean more infrastructure, more complexity, and higher costs.
                </p>
                <p class="mb-3">
                    <strong>DataPallas's approach:</strong> start with the simplest option. Only move to the next tier when your data volume actually demands it.
                </p>

                <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:0.75rem" class="mb-3">
                    <div style="grid-column:span 4">
                        <div class="tier-card tier-browser">
                            <h6 class="mb-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg> Browser Pivot</h6>
                            <span class="volume-badge">Up to ~100K rows</span>
                            <p class="text-sm text-base-content/60 mb-2">
                                The default. Zero setup, zero overhead. All processing happens in your browser.
                                Most reports never need anything else &mdash; just build your reports normally.
                            </p>
                            <a href="#engine-browser" class="btn btn-outline btn-primary btn-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/></svg> Jump to Browser
                            </a>
                        </div>
                    </div>
                    <div style="grid-column:span 4">
                        <div class="tier-card tier-duckdb">
                            <h6 class="mb-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg> DuckDB</h6>
                            <span class="volume-badge">~100K &ndash; 100M rows</span>
                            <p class="text-sm text-base-content/60 mb-2">
                                Almost no overhead &mdash; a single file on disk. Server-side aggregation handles
                                medium to large volumes. You just need to be aware it exists and use / enable it.
                            </p>
                            <a href="#engine-duckdb" class="btn btn-outline btn-primary btn-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/></svg> Jump to DuckDB
                            </a>
                        </div>
                    </div>
                    <div style="grid-column:span 4">
                        <div class="tier-card tier-clickhouse">
                            <h6 class="mb-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z"/></svg> ClickHouse</h6>
                            <span class="volume-badge">100M &ndash; 10B+ rows</span>
                            <p class="text-sm text-base-content/60 mb-2">
                                For truly massive volumes. A dedicated OLAP server with sub-second queries on billions of rows.
                                Additional infrastructure and maintenance cost, but unmatched performance at scale.
                            </p>
                            <a href="#engine-clickhouse" class="btn btn-outline btn-primary btn-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/></svg> Jump to ClickHouse
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <!-- daisyUI Tabs -->
            <div class="tabs tabs-bordered" role="tablist">
                <input type="radio" name="warehouse-tabs" role="tab" class="tab" aria-label="Data Warehouse" id="warehouse-tab" checked />
                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="warehouse-pane">

                    <div class="alert alert-info mb-3">
                        <strong>~8,000 sales transactions</strong> across 10 Countries × 8 Product Categories × 8 Quarters (2023–2024),
                        built on a star schema (<code>vw_sales_detail</code>) with realistic regional preferences, seasonal patterns,
                        and market-size variation. Same data served from 3 engines below — all produce identical results.
                    </div>

                    <!-- Browser Engine -->
                    <div class="engine-section" id="engine-browser">
                        <h6><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg> Browser Engine</h6>
                        <p class="engine-desc">
                            All ~8,000 rows loaded to your browser, aggregated client-side in JavaScript.
                            Drag-and-drop rearrangement is instant. Ideal for up to <strong>50K–100K rows</strong> (snappy).
                            Works acceptably up to <strong>~500K rows</strong>. Beyond that, switch to DuckDB or ClickHouse.
                        </p>
                        <rb-pivot-table
                            id="warehousePivotBrowser"
                            report-id="piv-northwind-warehouse-browser"
                            api-base-url="${RbUtils.apiBaseUrl}"
                            api-key="${RbUtils.apiKey}"
                        ></rb-pivot-table>
                    </div>

                    <!-- DuckDB Engine -->
                    <div class="engine-section" id="engine-duckdb">
                        <h6><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg> DuckDB Engine</h6>
                        <p class="engine-desc">
                            Server-side embedded OLAP database (single file, zero setup).
                            Aggregation runs on the server, only results sent to browser.
                            Sweet spot: up to <strong>1–10 million rows</strong>. Handles <strong>10–100M rows</strong> with tuning.
                            Perfect for analyst workloads without infrastructure.
                        </p>
                        <rb-pivot-table
                            id="warehousePivotDuckdb"
                            report-id="piv-northwind-warehouse-duckdb"
                            api-base-url="${RbUtils.apiBaseUrl}"
                            api-key="${RbUtils.apiKey}"
                        ></rb-pivot-table>
                    </div>

                    <!-- ClickHouse Engine -->
                    <div class="engine-section" id="engine-clickhouse">
                        <h6><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z"/></svg> ClickHouse Engine</h6>
                        <p class="engine-desc">
                            Server-side columnar OLAP database (requires ClickHouse starter pack).
                            Built for scale: handles <strong>millions to billions of rows</strong> with sub-second queries.
                            The go-to for production analytics — <strong>100M–10B+ rows</strong> is everyday territory.
                        </p>
                        <div id="clickhouseWarning" class="alert alert-warning mb-3 text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
                            Start the ClickHouse starter pack from the Connections page to see warehouse data.
                        </div>
                        <rb-pivot-table
                            id="warehousePivotClickhouse"
                            report-id="piv-northwind-warehouse-clickhouse"
                            api-base-url="${RbUtils.apiBaseUrl}"
                            api-key="${RbUtils.apiKey}"
                        ></rb-pivot-table>
                    </div>

                    <!-- How to Use Guide -->
                    <div class="howto-section">
                        <h5><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg> How to Use This Warehouse Pivot</h5>

                        <p><strong>What you're looking at right now:</strong></p>
                        <p>
                            The default view shows <strong>Country → Category</strong> as rows, <strong>Year-Quarter</strong> as columns,
                            and <strong>Sum of net_revenue</strong> in each cell. This is a real data warehouse layout — the same kind of
                            analysis people build in Excel every Monday morning, except here it's instant and interactive.
                        </p>
                        <p>~8,000 transactions. 10 countries. 8 product categories. 8 quarters. 30 customers. 16 products. 3 sales reps. Try everything below — every step works on the live data in front of you.</p>

                        <h6>Step-by-Step: Do These Now</h6>

                        <div class="step">
                            <div class="step-title">1. Find the Biggest Market</div>
                            <p class="mb-1">Look at the <strong>row totals</strong> (rightmost column). Which country drives the most revenue?</p>
                            <p class="mb-1"><strong>Try:</strong> Scan the <span class="step-action">Totals</span> column. USA and Germany should be at the top — they're the largest markets.</p>
                            <p class="mb-0 insight">→ You just answered "Where should we focus sales effort?" without writing a single query.</p>
                        </div>

                        <div class="step">
                            <div class="step-title">2. Drill Into a Country</div>
                            <p class="mb-1">Each country row has category sub-rows (Country → Category hierarchy).</p>
                            <p class="mb-1"><strong>Try:</strong> Find <span class="step-action">Germany</span> and look at its category breakdown. <strong>Dairy Products</strong> and <strong>Confections</strong> should be notably higher than Meat — Europeans buy more dairy.</p>
                            <p class="mb-1">Now find <span class="step-action">USA</span>. <strong>Meat/Poultry</strong> and <strong>Condiments</strong> should be stronger — different regional preferences.</p>
                            <p class="mb-0 insight">→ Same product catalog, completely different buying patterns by geography. This is exactly what OLAP reveals.</p>
                        </div>

                        <div class="step">
                            <div class="step-title">3. Compare Continents Instead of Countries</div>
                            <p class="mb-1"><strong>Try:</strong> Drag <span class="step-action">continent</span> from the unused fields area → Drop it into the <strong>rows area</strong>, above <code>customer_country</code>. Then drag <code>customer_country</code> out (back to unused).</p>
                            <p class="mb-1">Now you see: <strong>Europe vs North America vs South America</strong> — clean continent-level totals per quarter.</p>
                            <p class="mb-0 insight">→ "Is Europe or the Americas our bigger market?" — answered. One drag, zero SQL.</p>
                        </div>

                        <div class="step">
                            <div class="step-title">4. Spot the Seasonal Pattern</div>
                            <p class="mb-1">Look across the quarter columns (2023-Q1 through 2024-Q4).</p>
                            <p class="mb-1"><strong>Try:</strong> Compare any country's <span class="step-action">Q4</span> vs <span class="step-action">Q1</span> values. Q4 (holiday season) should be noticeably higher than Q1 (post-holiday slowdown).</p>
                            <p class="mb-0 insight">→ "Is our business seasonal?" — the pattern is right there: Q1 &lt; Q2 &lt; Q3 &lt; Q4, every year. Plan inventory accordingly.</p>
                        </div>

                        <div class="step">
                            <div class="step-title">5. Check Year-over-Year Growth</div>
                            <p class="mb-1"><strong>Try:</strong> Compare <span class="step-action">2023-Q1</span> column totals vs <span class="step-action">2024-Q1</span>. The 2024 numbers should be ~5% higher across the board.</p>
                            <p class="mb-0 insight">→ "Are we growing?" — yes, consistently. This is how CFOs track performance without a BI team.</p>
                        </div>

                        <div class="step">
                            <div class="step-title">6. Gross vs Net — What Are Discounts Costing Us?</div>
                            <p class="mb-1"><strong>Try:</strong> Click the <span class="step-action">net_revenue ▼</span> dropdown in the values area → Select <strong>gross_revenue</strong> instead.</p>
                            <p class="mb-1">The numbers go up. The difference = discount impact. Switch back to <code>net_revenue</code>.</p>
                            <p class="mb-1">Now try: Select <strong>both</strong> <code>net_revenue</code> and <code>gross_revenue</code> at the same time (if supported) or toggle between them.</p>
                            <p class="mb-0 insight">→ "How much margin are we giving away in discounts?" — the gap between gross and net tells you instantly.</p>
                        </div>

                        <div class="step">
                            <div class="step-title">7. Who's Selling What? (Sales Rep Analysis)</div>
                            <p class="mb-1"><strong>Try:</strong> Drag <span class="step-action">employee_name</span> into rows. You'll see Nancy Davolio, Andrew Fuller, and Janet Leverling.</p>
                            <p class="mb-1">Now drag <span class="step-action">category_name</span> below <code>employee_name</code> in rows.</p>
                            <p class="mb-0 insight">→ "Which rep sells the most Seafood?" "Who's our Dairy specialist?" — it's a performance review in one glance.</p>
                        </div>

                        <div class="step">
                            <div class="step-title">8. Average Transaction Value (Not Just Totals)</div>
                            <p class="mb-1"><strong>Try:</strong> Click the <span class="step-action">Sum ▼</span> dropdown (top-left) → Select <strong>Average</strong>.</p>
                            <p class="mb-1">Now cells show average revenue per transaction, not totals. High-volume countries might have <em>lower</em> averages.</p>
                            <p class="mb-0 insight">→ "Are we making money through volume or premium pricing?" — Average separates the two.</p>
                        </div>

                        <div class="step">
                            <div class="step-title">9. Filter to Focus</div>
                            <p class="mb-1"><strong>Try:</strong> Click the <span class="step-action">▼</span> triangle next to <code>customer_country</code> → Uncheck everything except <strong>USA</strong>, <strong>Germany</strong>, and <strong>France</strong>.</p>
                            <p class="mb-0 insight">→ Noise gone. Three key markets compared side by side. This is how you prepare a board presentation in 10 seconds.</p>
                        </div>

                        <div class="step">
                            <div class="step-title">10. Visualize It</div>
                            <p class="mb-1"><strong>Try:</strong> Click the <span class="step-action">Table ▼</span> renderer dropdown → Select <strong>Grouped Column Chart</strong>.</p>
                            <p class="mb-1">Countries become colored bars, quarters become groups. Trends jump out visually.</p>
                            <p class="mb-1">Try <strong>Stacked Bar Chart</strong> (see category proportions) or <strong>Line Chart</strong> (see trends over time).</p>
                            <p class="mb-0 insight">→ Same data, different presentation. Charts make the pattern obvious for non-technical stakeholders.</p>
                        </div>

                        <h6>Real Questions This Data Answers</h6>
                        <ul>
                            <li><strong>"Which country-category combo is our gold mine?"</strong> — Default view. Scan for the biggest cells. Germany × Dairy? USA × Meat?</li>
                            <li><strong>"Should we invest more in Europe or the Americas?"</strong> — Drag <code>continent</code> to rows. Compare totals. Decision made.</li>
                            <li><strong>"Are discounts eating our margins?"</strong> — Toggle between <code>gross_revenue</code> and <code>net_revenue</code>. The gap = discount cost.</li>
                            <li><strong>"What's our Q4 holiday uplift?"</strong> — Compare Q4 vs Q2 columns. The difference is your seasonal revenue.</li>
                            <li><strong>"Do Europeans buy different products than Americans?"</strong> — Rows: <code>continent</code> → <code>category_name</code>. Europe leans Dairy + Confections. Americas lean Meat + Condiments.</li>
                            <li><strong>"Which product should we discontinue?"</strong> — Drag <code>product_name</code> to rows, remove countries. Sort by totals. Lowest performer = candidate.</li>
                            <li><strong>"Who gets the sales bonus this quarter?"</strong> — Drag <code>employee_name</code> to rows. Highest total wins.</li>
                            <li><strong>"Is Sweden worth keeping as a market?"</strong> — Filter to just Sweden. Small revenue? Compare cost of operations vs revenue. The data tells the story.</li>
                        </ul>

                        <h6>Why This Matters — The "Excel Problem"</h6>
                        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
                            <div style="grid-column:span 6">
                                <p class="mb-1"><strong>What teams do today:</strong></p>
                                <div class="sql-compare">
<pre>
1. Export data to CSV
2. Open in Excel
3. Build pivot table manually
4. Email the spreadsheet
5. Someone asks "now show me by quarter"
6. Rebuild the pivot table
7. Repeat 47 times...
</pre>
</div>
                            </div>
                            <div style="grid-column:span 6">
                                <p class="mb-1"><strong>What this does instead:</strong></p>
                                <div class="pivot-compare">
<strong>✓</strong> Data stays in the warehouse (no CSV exports)<br>
<strong>✓</strong> Anyone opens the link, drags dimensions, gets answers<br>
<strong>✓</strong> "Show me by quarter" = one drag, 2 seconds<br>
<strong>✓</strong> Always live data, never a stale spreadsheet<br>
<strong>✓</strong> Works on 8,000 rows or 8 million (switch engines)</div>
                            </div>
                        </div>

                        <p class="mt-3 mb-0">
                            <strong>Bottom line:</strong> If your team currently exports to Excel to build pivot tables, they already know
                            how to use this — it's the same concept, except it's live, connected to the database, and sharable via URL.
                            No more "which version of the spreadsheet is correct?" conversations.
                        </p>
                    </div>

                </div>

                <!-- Raw Data Tab -->
                <input type="radio" name="warehouse-tabs" role="tab" class="tab" aria-label="Raw Data" id="rawdata-tab" />
                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="rawdata-pane">
                    <p class="text-base-content/60 text-sm mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg> Raw source data (~8,000 rows) that feeds the warehouse pivot tables.
                    </p>
                    <div class="flex justify-between items-center mb-2">
                        <div>
                            <label class="text-sm text-base-content/60 mr-2">Page size:</label>
                            <select id="rawDataPageSize" class="select select-sm inline-block" style="width: auto;">
                                <option value="10" selected>10</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                        <span id="rawDataInfo" class="text-sm text-base-content/60"></span>
                    </div>
                    <div id="rawDataLoading" class="text-center py-4 hidden">
                        <span class="loading loading-spinner loading-sm text-base-content/60"></span>
                        <span class="text-base-content/60 ml-2">Loading data...</span>
                    </div>
                    <div id="rawDataError" class="alert alert-error hidden"></div>
                    <div class="overflow-x-auto">
                        <table id="rawDataTable" class="table table-sm hidden">
                            <thead id="rawDataHead"></thead>
                            <tbody id="rawDataBody"></tbody>
                        </table>
                    </div>
                    <nav id="rawDataPagination" class="hidden mt-3" aria-label="Raw data pagination">
                        <div class="join flex justify-center" id="rawDataPaginationInner"></div>
                    </nav>
                </div>

                <!-- Configuration Tab -->
                <input type="radio" name="warehouse-tabs" role="tab" class="tab" aria-label="Configuration" id="config-tab" />
                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="config-pane">
                    <p class="text-base-content/60 text-sm mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>
                        All three reports use the same pivot table configuration &mdash; only the OLAP backend engine differs.
                        This lets you choose the engine that matches your data volume without changing your report definition.
                    </p>
                    <div class="engine-section mb-3">
                        <div class="flex justify-between items-center">
                            <h6 class="mb-0"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg> Browser Engine</h6>
                            <button class="btn btn-outline btn-sm copy-config-btn" data-target="configCodeBrowser" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="configCodeBrowser" class="code-block mt-2"><code class="language-groovy">Loading configuration...</code></pre>
                    </div>
                    <div class="engine-section mb-3">
                        <div class="flex justify-between items-center">
                            <h6 class="mb-0"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg> DuckDB Engine</h6>
                            <button class="btn btn-outline btn-sm copy-config-btn" data-target="configCodeDuckdb" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="configCodeDuckdb" class="code-block mt-2"><code class="language-groovy">Loading configuration...</code></pre>
                    </div>
                    <div class="engine-section mb-3">
                        <div class="flex justify-between items-center">
                            <h6 class="mb-0"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z"/></svg> ClickHouse Engine</h6>
                            <button class="btn btn-outline btn-sm copy-config-btn" data-target="configCodeClickhouse" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="configCodeClickhouse" class="code-block mt-2"><code class="language-groovy">Loading configuration...</code></pre>
                    </div>
                </div>

                <!-- Usage Tab -->
                <input type="radio" name="warehouse-tabs" role="tab" class="tab" aria-label="Usage" id="usage-tab" />
                <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="usage-pane">
                    <div class="engine-section mb-3">
                        <div class="flex justify-between items-center">
                            <h6 class="mb-0"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg> Browser Engine</h6>
                            <button class="btn btn-outline btn-sm copy-usage-btn" data-target="usageCodeBrowser" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="usageCodeBrowser" class="code-block mt-2"><code class="language-markup">&lt;rb-pivot-table
    report-id="piv-northwind-warehouse-browser"
    api-base-url="&#36;{RbUtils.apiBaseUrl}"
    api-key="&#36;{RbUtils.apiKey}"
&gt;&lt;/rb-pivot-table&gt;</code></pre>
                    </div>
                    <div class="engine-section mb-3">
                        <div class="flex justify-between items-center">
                            <h6 class="mb-0"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg> DuckDB Engine</h6>
                            <button class="btn btn-outline btn-sm copy-usage-btn" data-target="usageCodeDuckdb" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="usageCodeDuckdb" class="code-block mt-2"><code class="language-markup">&lt;rb-pivot-table
    report-id="piv-northwind-warehouse-duckdb"
    api-base-url="&#36;{RbUtils.apiBaseUrl}"
    api-key="&#36;{RbUtils.apiKey}"
&gt;&lt;/rb-pivot-table&gt;</code></pre>
                    </div>
                    <div class="engine-section mb-3">
                        <div class="flex justify-between items-center">
                            <h6 class="mb-0"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z"/></svg> ClickHouse Engine</h6>
                            <button class="btn btn-outline btn-sm copy-usage-btn" data-target="usageCodeClickhouse" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="usageCodeClickhouse" class="code-block mt-2"><code class="language-markup">&lt;rb-pivot-table
    report-id="piv-northwind-warehouse-clickhouse"
    api-base-url="&#36;{RbUtils.apiBaseUrl}"
    api-key="&#36;{RbUtils.apiKey}"
&gt;&lt;/rb-pivot-table&gt;</code></pre>
                    </div>
                </div>

            </div>
        </div>
    </div>

    <!-- Copy-to-clipboard toast -->
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

            // ================================================================
            // Copy to Clipboard
            // ================================================================
            var copyToastEl = document.getElementById('copyToast');
            function showToast() {
                copyToastEl.classList.remove('hidden');
                setTimeout(function() { copyToastEl.classList.add('hidden'); }, 2000);
            }

            function copyWithFeedback(btn, text) {
                navigator.clipboard.writeText(text).then(function() {
                    btn.innerHTML = SVG_CHECK;
                    showToast();
                    setTimeout(function() {
                        btn.innerHTML = SVG_CLIPBOARD;
                    }, 2000);
                });
            }

            document.querySelectorAll('.copy-config-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var preEl = document.getElementById(this.dataset.target);
                    copyWithFeedback(this, preEl ? preEl.textContent : '');
                });
            });

            document.querySelectorAll('.copy-usage-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var preEl = document.getElementById(this.dataset.target);
                    copyWithFeedback(this, preEl ? preEl.textContent : '');
                });
            });

            // ================================================================
            // ClickHouse: show/hide warning based on data fetch result
            // ================================================================
            var clickhouseComponent = document.getElementById('warehousePivotClickhouse');
            var clickhouseWarning = document.getElementById('clickhouseWarning');
            if (clickhouseComponent) {
                clickhouseComponent.addEventListener('pivotExecuted', function() {
                    if (clickhouseWarning) clickhouseWarning.classList.add('hidden');
                });
                clickhouseComponent.addEventListener('error', function(event) {
                    console.warn('[data-warehouse] ClickHouse connection failed:', event.detail);
                    if (clickhouseWarning) clickhouseWarning.classList.remove('hidden');
                    showClickHouseWarningToast();
                });
            }

            // ================================================================
            // Configuration tab: read configDsl from each pivot component
            // ================================================================
            var engines = [
                { id: 'warehousePivotBrowser', configId: 'configCodeBrowser' },
                { id: 'warehousePivotDuckdb', configId: 'configCodeDuckdb' },
                { id: 'warehousePivotClickhouse', configId: 'configCodeClickhouse' },
            ];

            engines.forEach(function(engine) {
                var comp = document.getElementById(engine.id);
                var codeEl = document.getElementById(engine.configId);
                if (!comp || !codeEl) return;

                function updateConfig() {
                    if (comp.configDsl) {
                        var escaped = comp.configDsl
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                        codeEl.innerHTML = '<code class="language-groovy">' + escaped + '</code>';
                        if (window.Prism) Prism.highlightElement(codeEl.querySelector('code'));
                    }
                }

                comp.addEventListener('configLoaded', updateConfig);
                comp.addEventListener('dataFetched', updateConfig);
                setTimeout(updateConfig, 500);
                setTimeout(updateConfig, 2000);
            });

            // Highlight static usage code blocks
            document.querySelectorAll('[id^="usageCode"] code').forEach(function(el) {
                if (window.Prism) Prism.highlightElement(el);
            });

            // ================================================================
            // Raw Data tab: server-side paginated table
            // ================================================================
            (function() {
                var apiBase = '${RbUtils.apiBaseUrl}';
                var reportId = 'piv-northwind-warehouse-browser';
                var currentPage = 0;
                var pageSize = 10;
                var totalRows = 0;
                var columns = null;
                var loaded = false;

                function fetchPage() {
                    document.getElementById('rawDataLoading').classList.remove('hidden');
                    document.getElementById('rawDataError').classList.add('hidden');

                    fetch(apiBase + '/reports/' + reportId + '/data?page=' + (currentPage + 1) + '&size=' + pageSize)
                        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                        .then(function(result) {
                            var data = result.data || [];
                            totalRows = result.totalRows || 0;

                            // Build header once
                            if (!columns) {
                                columns = result.reportColumnNames || (data.length ? Object.keys(data[0]) : []);
                                var headRow = '<tr>' + columns.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
                                document.getElementById('rawDataHead').innerHTML = headRow;
                            }

                            // Build body
                            var rows = data.map(function(row) {
                                return '<tr>' + columns.map(function(c) {
                                    return '<td>' + (row[c] != null ? row[c] : '') + '</td>';
                                }).join('') + '</tr>';
                            }).join('');
                            document.getElementById('rawDataBody').innerHTML = rows;

                            // Info text
                            var from = currentPage * pageSize + 1;
                            var to = Math.min((currentPage + 1) * pageSize, totalRows);
                            document.getElementById('rawDataInfo').textContent =
                                'Showing ' + from + '-' + to + ' of ' + totalRows + ' rows';

                            // Show table, hide loading
                            document.getElementById('rawDataLoading').classList.add('hidden');
                            document.getElementById('rawDataTable').classList.remove('hidden');
                            document.getElementById('rawDataPagination').classList.remove('hidden');

                            renderPagination();
                            loaded = true;
                        })
                        .catch(function(err) {
                            document.getElementById('rawDataLoading').classList.add('hidden');
                            document.getElementById('rawDataError').textContent = 'Failed to load data: ' + err.message;
                            document.getElementById('rawDataError').classList.remove('hidden');
                        });
                }

                function renderPagination() {
                    var totalPages = Math.ceil(totalRows / pageSize);
                    var container = document.getElementById('rawDataPaginationInner');
                    var html = '';

                    html += '<a class="join-item btn btn-sm ' + (currentPage === 0 ? 'btn-disabled' : '') + '" href="#" data-page="' + (currentPage - 1) + '">&laquo;</a>';

                    for (var i = 0; i < totalPages; i++) {
                        if (totalPages <= 7 || i === 0 || i === totalPages - 1 || Math.abs(i - currentPage) <= 2) {
                            html += '<a class="join-item btn btn-sm ' + (i === currentPage ? 'btn-active' : '') + '" href="#" data-page="' + i + '">' + (i + 1) + '</a>';
                        } else if (i === 1 || i === totalPages - 2) {
                            html += '<span class="join-item btn btn-sm btn-disabled">...</span>';
                        }
                    }

                    html += '<a class="join-item btn btn-sm ' + (currentPage >= totalPages - 1 ? 'btn-disabled' : '') + '" href="#" data-page="' + (currentPage + 1) + '">&raquo;</a>';

                    container.innerHTML = html;

                    container.querySelectorAll('a[data-page]').forEach(function(a) {
                        a.addEventListener('click', function(e) {
                            e.preventDefault();
                            var p = parseInt(this.dataset.page);
                            if (p >= 0 && p < totalPages) { currentPage = p; fetchPage(); }
                        });
                    });
                }

                // Load on tab show (input radio tab click)
                var rawTabInput = document.getElementById('rawdata-tab');
                if (rawTabInput) {
                    rawTabInput.addEventListener('change', function() {
                        if (!loaded) fetchPage();
                    });
                }

                // Page size change
                var pageSizeEl = document.getElementById('rawDataPageSize');
                if (pageSizeEl) {
                    pageSizeEl.addEventListener('change', function() {
                        pageSize = parseInt(this.value);
                        currentPage = 0;
                        fetchPage();
                    });
                }
            })();
        });

        function showClickHouseWarningToast() {
            var toastContainer = document.getElementById('toastContainer');
            if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'toastContainer';
                toastContainer.className = 'toast toast-end toast-top';
                toastContainer.style.zIndex = '9999';
                toastContainer.style.position = 'fixed';
                document.body.appendChild(toastContainer);
            }

            var alertEl = document.createElement('div');
            alertEl.className = 'alert alert-warning';
            alertEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>'
                + '<strong>ClickHouse Unavailable:</strong> Start the ClickHouse starter pack to enable the ClickHouse pivot table.';
            toastContainer.appendChild(alertEl);

            setTimeout(function() {
                alertEl.remove();
            }, 5000);
        }
    </script>
    </content>
</body>
</html>
