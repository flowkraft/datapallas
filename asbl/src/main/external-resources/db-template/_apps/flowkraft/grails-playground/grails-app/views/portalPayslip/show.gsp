<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="portal"/>
    <title>Payslip ${payslip?.payslipNumber} - FlowKraft</title>
</head>
<body>

    <div class="container">
        <!-- Breadcrumb -->
        <div class="breadcrumbs text-sm mb-4">
            <ul>
                <li><a href="${createLink(action: 'index')}">My Payslips</a></li>
                <li>${payslip?.payslipNumber}</li>
            </ul>
        </div>

        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
            <div style="grid-column:span 8">
                <div class="card bg-base-100 border border-base-300">
                    <div class="card-body">
                        <div class="flex justify-between items-center mb-2">
                            <h2 class="card-title text-base">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6 6m0 0l6-6m-6 6V3.75m-6 6l-6-6m6 6V3.75"/></svg>${payslip?.payslipNumber}
                            </h2>
                            <span class="badge ${payslip?.statusBadgeClass} fs-6">${payslip?.status?.capitalize()}</span>
                        </div>

                        <!-- Employee Info -->
                        <h6 class="text-base-content/60 mb-3">Employee Information</h6>
                        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem" class="mb-4">
                            <div style="grid-column:span 6">
                                <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                    <dt class="text-base-content/60">Name</dt>
                                    <dd>${payslip?.employeeName}</dd>
                                    <dt class="text-base-content/60">Email</dt>
                                    <dd>${payslip?.employeeEmail}</dd>
                                </dl>
                            </div>
                            <div style="grid-column:span 6">
                                <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                    <dt class="text-base-content/60">ID</dt>
                                    <dd>${payslip?.employeeId}</dd>
                                    <dt class="text-base-content/60">Department</dt>
                                    <dd>${payslip?.department ?: '-'}</dd>
                                </dl>
                            </div>
                        </div>

                        <hr/>

                        <!-- Pay Period -->
                        <h6 class="text-base-content/60 mb-3">Pay Period</h6>
                        <p class="mb-4">
                            <g:formatDate date="${payslip?.payPeriodStart}" format="MMMM dd, yyyy"/>
                            <span class="mx-2">—</span>
                            <g:formatDate date="${payslip?.payPeriodEnd}" format="MMMM dd, yyyy"/>
                        </p>

                        <hr/>

                        <!-- Payment Details -->
                        <h6 class="text-base-content/60 mb-3">Payment Details</h6>
                        <div class="overflow-x-auto">
                            <table class="table">
                                <tbody>
                                    <tr>
                                        <td class="text-base-content/60">Gross Amount</td>
                                        <td class="text-right">${payslip?.formatAmount(payslip?.grossAmount)}</td>
                                    </tr>
                                    <tr>
                                        <td class="text-base-content/60">Deductions</td>
                                        <td class="text-right text-error">- ${payslip?.formatAmount(payslip?.deductions ?: 0)}</td>
                                    </tr>
                                    <tr class="border-t">
                                        <td class="font-bold text-lg">Net Amount</td>
                                        <td class="text-right font-bold text-2xl text-success">${payslip?.formatAmount(payslip?.netAmount)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div style="grid-column:span 4">
                <div class="card bg-base-100 border border-base-300">
                    <div class="card-body">
                        <h2 class="card-title text-base">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>Download
                        </h2>
                        <p class="text-base-content/60 mb-3">Download your payslip as a PDF document for your records.</p>
                        <a href="${createLink(action: 'download', id: payslip?.id)}" class="btn btn-primary w-full">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg> Download PDF
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>

</body>
</html>
