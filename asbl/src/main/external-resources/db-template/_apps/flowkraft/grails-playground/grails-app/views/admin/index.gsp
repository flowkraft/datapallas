<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Dashboard - Admin</title>
    <content tag="title">Dashboard</content>
</head>
<body>

    <div class="mb-4">
        <h1 id="admin-page-title" class="h4 font-semibold text-base-content">Dashboard</h1>
        <p class="text-base-content/60 text-sm mb-0">Manage payslips and invoices</p>
    </div>

    <!-- Stats Cards - Simplified to match Next.js -->
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:0.75rem" class="mb-4" id="admin-stats-grid">
        <!-- Payslips -->
        <div style="grid-column:span 3">
            <div class="card bg-base-100 border border-base-300 h-full" id="stat-card-payslips">
                <div class="card-body p-3">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-base-content/60 text-sm uppercase font-medium">Payslips</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6 6m0 0l6-6m-6 6V3.75m-6 6l-6-6m6 6V3.75"/></svg>
                    </div>
                    <div class="h3 font-semibold mb-0" id="stat-value-payslips">${stats?.totalPayslips ?: 0}</div>
                </div>
            </div>
        </div>

        <!-- Invoices -->
        <div style="grid-column:span 3">
            <div class="card bg-base-100 border border-base-300 h-full" id="stat-card-invoices">
                <div class="card-body p-3">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-base-content/60 text-sm uppercase font-medium">Invoices</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                    </div>
                    <div class="h3 font-semibold mb-0" id="stat-value-invoices">${stats?.totalInvoices ?: 0}</div>
                </div>
            </div>
        </div>

        <!-- Revenue -->
        <div style="grid-column:span 3">
            <div class="card bg-base-100 border border-base-300 h-full" id="stat-card-revenue">
                <div class="card-body p-3">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-base-content/60 text-sm uppercase font-medium">Revenue</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                    </div>
                    <div class="h3 font-semibold mb-0" id="stat-value-revenue">$${String.format('%,.2f', (stats?.totalRevenue ?: 0) as Double)}</div>
                </div>
            </div>
        </div>

        <!-- Pending -->
        <div style="grid-column:span 3">
            <div class="card bg-base-100 border border-base-300 h-full" id="stat-card-pending">
                <div class="card-body p-3">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-base-content/60 text-sm uppercase font-medium">Pending</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                    </div>
                    <div class="h3 font-semibold mb-0" id="stat-value-pending">${(stats?.pendingInvoices ?: 0) + (stats?.draftPayslips ?: 0)}</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Quick Actions - Simplified to match Next.js -->
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem" id="admin-quick-actions">
        <!-- Payslips Actions -->
        <div style="grid-column:span 6">
            <div class="card bg-base-100 border border-base-300" id="quick-actions-payslips">
                <div class="card-body p-3">
                    <h6 class="font-medium text-base-content mb-3">Payslips</h6>
                    <div class="flex gap-2">
                        <a href="${createLink(controller: 'payslip', action: 'index')}"
                           class="btn btn-sm btn-neutral" id="btn-view-payslips">
                            View All
                        </a>
                        <a href="${createLink(controller: 'payslip', action: 'create')}"
                           class="btn btn-sm btn-outline" id="btn-new-payslip">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> New
                        </a>
                    </div>
                </div>
            </div>
        </div>

        <!-- Invoices Actions -->
        <div style="grid-column:span 6">
            <div class="card bg-base-100 border border-base-300" id="quick-actions-invoices">
                <div class="card-body p-3">
                    <h6 class="font-medium text-base-content mb-3">Invoices</h6>
                    <div class="flex gap-2">
                        <a href="${createLink(controller: 'invoice', action: 'index')}"
                           class="btn btn-sm btn-neutral" id="btn-view-invoices">
                            View All
                        </a>
                        <a href="${createLink(controller: 'invoice', action: 'create')}"
                           class="btn btn-sm btn-outline" id="btn-new-invoice">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> New
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>

</body>
</html>
