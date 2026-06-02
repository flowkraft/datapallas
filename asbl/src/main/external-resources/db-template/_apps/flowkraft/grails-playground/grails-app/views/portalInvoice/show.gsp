<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="portal"/>
    <title>Invoice ${invoice?.invoiceNumber} - FlowKraft</title>
</head>
<body>

    <div class="container">
        <!-- Breadcrumb -->
        <div class="breadcrumbs text-sm mb-4">
            <ul>
                <li><a href="${createLink(action: 'index')}">My Invoices</a></li>
                <li>${invoice?.invoiceNumber}</li>
            </ul>
        </div>

        <!-- Flash Messages -->
        <g:if test="${flash.message}">
            <div class="alert alert-success mb-4" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>${flash.message}
            </div>
        </g:if>
        <g:if test="${flash.error}">
            <div class="alert alert-error mb-4" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>${flash.error}
            </div>
        </g:if>

        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
            <div style="grid-column:span 8">
                <div class="card bg-base-100 border border-base-300">
                    <div class="card-body">
                        <div class="flex justify-between items-center mb-2">
                            <h2 class="card-title text-base">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>${invoice?.invoiceNumber}
                            </h2>
                            <span class="badge ${invoice?.statusBadgeClass} fs-6">${invoice?.status?.capitalize()}</span>
                        </div>

                        <!-- Dates -->
                        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem" class="mb-4">
                            <div style="grid-column:span 6">
                                <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                    <dt class="text-base-content/60">Issue Date</dt>
                                    <dd><g:formatDate date="${invoice?.issueDate}" format="MMMM dd, yyyy"/></dd>
                                </dl>
                            </div>
                            <div style="grid-column:span 6">
                                <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                    <dt class="text-base-content/60">Due Date</dt>
                                    <dd class="${invoice?.isOverdue() ? 'text-error font-bold' : ''}">
                                        <g:formatDate date="${invoice?.dueDate}" format="MMMM dd, yyyy"/>
                                        <g:if test="${invoice?.isOverdue()}">
                                            <span class="badge badge-error ml-2">Overdue</span>
                                        </g:if>
                                    </dd>
                                </dl>
                            </div>
                        </div>

                        <hr/>

                        <!-- Amount Details -->
                        <h6 class="text-base-content/60 mb-3">Amount Details</h6>
                        <div class="overflow-x-auto">
                            <table class="table">
                                <tbody>
                                    <tr>
                                        <td class="text-base-content/60">Subtotal</td>
                                        <td class="text-right">${invoice?.formatAmount(invoice?.subtotal)}</td>
                                    </tr>
                                    <tr>
                                        <td class="text-base-content/60">Tax (${invoice?.taxRate ?: 0}%)</td>
                                        <td class="text-right">${invoice?.formatAmount(invoice?.taxAmount ?: 0)}</td>
                                    </tr>
                                    <g:if test="${invoice?.discount > 0}">
                                        <tr>
                                            <td class="text-base-content/60">Discount</td>
                                            <td class="text-right text-error">- ${invoice?.formatAmount(invoice?.discount)}</td>
                                        </tr>
                                    </g:if>
                                    <tr class="border-t">
                                        <td class="font-bold text-lg">Total Amount</td>
                                        <td class="text-right font-bold text-2xl">${invoice?.formatAmount(invoice?.totalAmount)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- Notes -->
                        <g:if test="${invoice?.notes}">
                            <hr/>
                            <h6 class="text-base-content/60 mb-3">Notes</h6>
                            <p class="text-base-content/60">${invoice?.notes}</p>
                        </g:if>

                        <!-- Payment Info (if paid) -->
                        <g:if test="${invoice?.status == 'paid'}">
                            <hr/>
                            <div class="alert alert-success mb-0">
                                <h6 class="font-bold">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>Payment Received
                                </h6>
                                <p class="mb-1">
                                    <strong>Method:</strong> ${invoice?.paymentMethodDisplay}
                                </p>
                                <p class="mb-0">
                                    <strong>Date:</strong> <g:formatDate date="${invoice?.paidAt}" format="MMMM dd, yyyy 'at' HH:mm"/>
                                </p>
                            </div>
                        </g:if>
                    </div>
                </div>
            </div>

            <div style="grid-column:span 4">
                <!-- Payment Card -->
                <g:if test="${invoice?.isPayable()}">
                    <div class="card bg-success text-success-content mb-4">
                        <div class="card-body">
                            <h2 class="card-title text-base">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/></svg>Pay Invoice
                            </h2>
                            <div class="text-center mb-3">
                                <span class="text-3xl font-bold">${invoice?.formatAmount(invoice?.totalAmount)}</span>
                                <p class="mb-0">Amount Due</p>
                            </div>
                            <a href="${createLink(action: 'pay', id: invoice?.id)}" class="btn btn-success w-full btn-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg> Pay Now
                            </a>
                            <p class="text-sm text-center mt-3 mb-0" style="opacity:0.8;">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>
                                Secure payment via Stripe or PayPal
                            </p>
                        </div>
                    </div>
                </g:if>

                <!-- Download Card -->
                <div class="card bg-base-100 border border-base-300">
                    <div class="card-body">
                        <h2 class="card-title text-base">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>Download
                        </h2>
                        <p class="text-base-content/60 mb-3">Download your invoice as a PDF document.</p>
                        <a href="${createLink(action: 'download', id: invoice?.id)}" class="btn btn-outline w-full">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg> Download PDF
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>

</body>
</html>
