<%@ page import="flowkraft.frend.RbUtils" %>
<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="main"/>
    <title>Dashboards - DataPallas</title>
    <style>
        rb-chart { display: block; width: 100%; height: 100%; }
        rb-tabulator { display: block; width: 100%; }

        /* Dashboard selector */
        .dashboard-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
        }
        .dashboard-selector {
            width: auto;
            min-width: 0;
        }

        /* KPI cards */
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1rem;
            margin-bottom: 1.5rem;
        }
        @media (max-width: 991px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 575px) { .kpi-grid { grid-template-columns: 1fr; } }

        .kpi-card {
            border-radius: 8px;
            padding: 1.25rem;
            border: 1px solid var(--color-base-300);
            border-left: 4px solid;
            background: var(--color-base-200);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .kpi-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        .kpi-card .kpi-label {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
            margin-bottom: 0.25rem;
        }

        .kpi-card .kpi-value {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }
        .kpi-card .kpi-detail {
            font-size: 0.8rem;
            color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
        }

        .kpi-up { color: var(--color-success); }
        .kpi-down { color: var(--color-error); }
        .kpi-warn { color: var(--color-warning); }

        /* Dashboard panels */
        .dash-panel {
            border: 1px solid var(--color-base-300);
            border-radius: 8px;
            padding: 1.25rem;
            margin-bottom: 1.5rem;
            background: var(--color-base-200);
        }
        .dash-panel h6 {
            font-weight: 600;
            font-size: 0.95rem;
            margin-bottom: 1rem;
        }

        .chart-container { height: 280px; position: relative; overflow: hidden; }
    </style>
</head>
<body>
    <div class="container">
        <div class="flex flex-wrap gap-4 mt-4">
            <div class="w-full">

                <!-- Toolbar: title + dashboard selector -->
                <div class="dashboard-toolbar">
                    <div>
                        <h4 class="mb-1">Dashboards</h4>
                        <p class="text-base-content/60 mb-0 text-sm">Pre-built executive dashboards powered by <code>&lt;rb-chart&gt;</code> and <code>&lt;rb-tabulator&gt;</code> components.</p>
                    </div>
                    <select class="select dashboard-selector" id="dashboard-select">
                        <option value="cfo" selected>CFO Analytics Dashboard</option>
                    </select>
                </div>

                <!-- ════════════════════════════════════════════════════════ -->
                <!-- CFO Analytics Dashboard                                -->
                <!-- ════════════════════════════════════════════════════════ -->

                <!-- KPI Row 1 -->
                <div class="kpi-grid">
                    <div class="kpi-card" id="kpi-revenue" style="border-left-color: #16a34a;">
                        <div class="kpi-label">Total Revenue</div>
                        <div class="kpi-value">$847,320</div>
                        <div class="kpi-detail"><span class="kpi-up"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18"/></svg> 12.5%</span> vs last period</div>
                    </div>
                    <div class="kpi-card" id="kpi-profit" style="border-left-color: #2563eb;">
                        <div class="kpi-label">Gross Profit</div>
                        <div class="kpi-value">$292,180</div>
                        <div class="kpi-detail"><span style="color: var(--color-primary); font-weight: 600;">34.5%</span> profit margin</div>
                    </div>
                    <div class="kpi-card" id="kpi-orders" style="border-left-color: #7c3aed;">
                        <div class="kpi-label">Total Orders</div>
                        <div class="kpi-value">1,247</div>
                        <div class="kpi-detail"><span class="kpi-up"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18"/></svg> 8.3%</span> avg. $680/order</div>
                    </div>
                    <div class="kpi-card" id="kpi-ar" style="border-left-color: #dc2626;">
                        <div class="kpi-label">Outstanding AR</div>
                        <div class="kpi-value">$128,450</div>
                        <div class="kpi-detail"><span class="kpi-warn"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg> 23 invoices</span> overdue</div>
                    </div>
                </div>

                <!-- KPI Row 2 -->
                <div class="kpi-grid">
                    <div class="kpi-card" id="kpi-top-customer" style="border-left-color: #06b6d4;">
                        <div class="kpi-label">Top Customer</div>
                        <div class="kpi-value" style="font-size: 1.15rem;">Save-a-lot Markets</div>
                        <div class="kpi-detail"><strong>$89,340</strong> YTD revenue</div>
                    </div>
                    <div class="kpi-card" id="kpi-top-product" style="border-left-color: #f97316;">
                        <div class="kpi-label">Top Product</div>
                        <div class="kpi-value" style="font-size: 1.15rem;">C&ocirc;te de Blaye</div>
                        <div class="kpi-detail"><strong>89 units</strong> this period</div>
                    </div>
                    <div class="kpi-card" id="kpi-dso" style="border-left-color: #eab308;">
                        <div class="kpi-label">Days Sales Outstanding</div>
                        <div class="kpi-value">28</div>
                        <div class="kpi-detail"><span class="kpi-up"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/></svg> 3 days</span> vs target: 30</div>
                    </div>
                    <div class="kpi-card" id="kpi-top-region" style="border-left-color: #ec4899;">
                        <div class="kpi-label">Top Region</div>
                        <div class="kpi-value" style="font-size: 1.15rem;">Germany</div>
                        <div class="kpi-detail"><strong>$198,520</strong> (23.4% of total)</div>
                    </div>
                </div>

                <!-- Charts Row: Revenue Trend + Revenue by Category -->
                <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
                    <div style="grid-column:span 6">
                        <div class="dash-panel" id="panel-revenueTrend">
                            <h6><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-primary"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"/></svg>Revenue Trend</h6>
                            <div class="chart-container">
                                <rb-chart
                                    id="rb-revenueTrend"
                                    report-id="dashboard-cfo"
                                    component-id="revenueTrend"
                                    api-base-url="${RbUtils.apiBaseUrl}"
                                    embed-token="${RbUtils.embedToken('dashboard-cfo')}"
                                ></rb-chart>
                            </div>
                        </div>
                    </div>
                    <div style="grid-column:span 6">
                        <div class="dash-panel" id="panel-revenueByCategory">
                            <h6><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2" style="color: #7c3aed;"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z"/></svg>Revenue by Category</h6>
                            <div class="chart-container">
                                <rb-chart
                                    id="rb-revenueByCategory"
                                    report-id="dashboard-cfo"
                                    component-id="revenueByCategory"
                                    api-base-url="${RbUtils.apiBaseUrl}"
                                    embed-token="${RbUtils.embedToken('dashboard-cfo')}"
                                ></rb-chart>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Bottom Row: Customers Table + AR Aging + Country -->
                <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
                    <div style="grid-column:span 4">
                        <div class="dash-panel" id="panel-topCustomers">
                            <h6><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2" style="color: #06b6d4;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>Top 5 Customers</h6>
                            <rb-tabulator
                                id="rb-topCustomers"
                                report-id="dashboard-cfo"
                                component-id="topCustomers"
                                api-base-url="${RbUtils.apiBaseUrl}"
                                embed-token="${RbUtils.embedToken('dashboard-cfo')}"
                            ></rb-tabulator>
                        </div>
                    </div>
                    <div style="grid-column:span 4">
                        <div class="dash-panel" id="panel-arAging">
                            <h6><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2" style="color: #eab308;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>Accounts Receivable Aging</h6>
                            <div class="chart-container">
                                <rb-chart
                                    id="rb-arAging"
                                    report-id="dashboard-cfo"
                                    component-id="arAging"
                                    api-base-url="${RbUtils.apiBaseUrl}"
                                    embed-token="${RbUtils.embedToken('dashboard-cfo')}"
                                ></rb-chart>
                            </div>
                        </div>
                    </div>
                    <div style="grid-column:span 4">
                        <div class="dash-panel" id="panel-revenueByCountry">
                            <h6><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2" style="color: #ec4899;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg>Revenue by Country</h6>
                            <div class="chart-container">
                                <rb-chart
                                    id="rb-revenueByCountry"
                                    report-id="dashboard-cfo"
                                    component-id="revenueByCountry"
                                    api-base-url="${RbUtils.apiBaseUrl}"
                                    embed-token="${RbUtils.embedToken('dashboard-cfo')}"
                                ></rb-chart>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>
</body>
</html>
