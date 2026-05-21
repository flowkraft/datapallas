<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="portal"/>
    <title>My Payslips - FlowKraft</title>
</head>
<body>

    <div class="container">
        <div class="flex justify-between items-center mb-4">
            <div>
                <h2 class="font-bold mb-1">My Payslips</h2>
                <p class="text-base-content/60 mb-0">View and download your salary statements</p>
            </div>
        </div>

        <!-- Payslips Grid -->
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
            <g:if test="${payslipList}">
                <g:each in="${payslipList}" var="payslip">
                    <div style="grid-column:span 6">
                        <div class="card bg-base-100 border border-base-300 h-full">
                            <div class="card-body">
                                <div class="flex justify-between items-start mb-3">
                                    <div class="document-card-icon payslip">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6 6m0 0l6-6m-6 6V3.75m-6 6l-6-6m6 6V3.75"/></svg>
                                    </div>
                                    <span class="badge ${payslip.statusBadgeClass}">${payslip.status.capitalize()}</span>
                                </div>

                                <h5 class="card-title font-bold">${payslip.payslipNumber}</h5>
                                <p class="text-base-content/60 text-sm mb-2">${payslip.payPeriodFormatted}</p>

                                <div class="flex justify-between items-center mb-3">
                                    <span class="text-base-content/60">Net Amount</span>
                                    <span class="text-2xl font-bold text-success">${payslip.formatAmount(payslip.netAmount)}</span>
                                </div>

                                <div class="grid gap-2">
                                    <a href="${createLink(action: 'show', id: payslip.id)}" class="btn btn-outline btn-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg> View Details
                                    </a>
                                    <a href="${createLink(action: 'download', id: payslip.id)}" class="btn btn-primary btn-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg> Download PDF
                                    </a>
                                </div>
                            </div>
                            <div class="card-footer bg-transparent">
                                <small class="text-base-content/60">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                                    <g:formatDate date="${payslip.dateCreated}" format="MMM dd, yyyy"/>
                                </small>
                            </div>
                        </div>
                    </div>
                </g:each>
            </g:if>
            <g:else>
                <div style="grid-column:span 12">
                    <div class="card bg-base-100 border border-base-300">
                        <div class="card-body text-center py-5">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:3rem;height:3rem;display:block;margin:0 auto 0.75rem;opacity:0.4;"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"/></svg>
                            <h5>No Payslips Yet</h5>
                            <p class="text-base-content/60 mb-0">Your payslips will appear here once they are issued.</p>
                        </div>
                    </div>
                </div>
            </g:else>
        </div>
    </div>

</body>
</html>
