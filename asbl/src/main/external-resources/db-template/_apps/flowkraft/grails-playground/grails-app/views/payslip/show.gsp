<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Payslip ${payslip?.payslipNumber} - Admin</title>
    <content tag="title">Payslip Details</content>
</head>
<body>

    <!-- Breadcrumb -->
    <div class="breadcrumbs text-sm mb-4">
        <ul>
            <li><a href="${createLink(action: 'index')}">Payslips</a></li>
            <li>${payslip?.payslipNumber}</li>
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
            <!-- Payslip Details Card -->
            <div class="card bg-base-100 border border-base-300 mb-4">
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
                    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem" class="mb-4">
                        <div style="grid-column:span 6">
                            <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                <dt class="text-base-content/60">Start</dt>
                                <dd><g:formatDate date="${payslip?.payPeriodStart}" format="MMMM dd, yyyy"/></dd>
                            </dl>
                        </div>
                        <div style="grid-column:span 6">
                            <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                <dt class="text-base-content/60">End</dt>
                                <dd><g:formatDate date="${payslip?.payPeriodEnd}" format="MMMM dd, yyyy"/></dd>
                            </dl>
                        </div>
                    </div>

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
                                    <td class="font-bold">Net Amount</td>
                                    <td class="text-right font-bold text-success">${payslip?.formatAmount(payslip?.netAmount)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <div style="grid-column:span 4">
            <!-- Actions Card -->
            <div class="card bg-base-100 border border-base-300 mb-4">
                <div class="card-body">
                    <h2 class="card-title text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"/></svg>Actions
                    </h2>
                    <div class="grid gap-2">
                        <g:if test="${payslip?.status == 'draft'}">
                            <a href="${createLink(action: 'send', id: payslip?.id)}" class="btn btn-primary">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"/></svg>Send to Employee
                            </a>
                        </g:if>
                        <a href="${createLink(action: 'edit', id: payslip?.id)}" class="btn btn-outline">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>Edit Payslip
                        </a>
                        <a href="${createLink(action: 'download', id: payslip?.id)}" class="btn btn-outline">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>Download PDF
                        </a>
                        <hr/>
                        <button type="button" class="btn btn-outline btn-error" onclick="document.getElementById('deleteModal').showModal()">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>Delete Payslip
                        </button>
                    </div>
                </div>
            </div>

            <!-- Metadata Card -->
            <div class="card bg-base-100 border border-base-300">
                <div class="card-body">
                    <h2 class="card-title text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>Details
                    </h2>
                    <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                        <dt class="text-base-content/60">Created</dt>
                        <dd><g:formatDate date="${payslip?.dateCreated}" format="MMM dd, yyyy HH:mm"/></dd>
                        <dt class="text-base-content/60">Updated</dt>
                        <dd><g:formatDate date="${payslip?.lastUpdated}" format="MMM dd, yyyy HH:mm"/></dd>
                        <dt class="text-base-content/60">Currency</dt>
                        <dd>${payslip?.currency}</dd>
                    </dl>
                </div>
            </div>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <dialog id="deleteModal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-base">Delete Payslip</h3>
            <p class="py-2">Are you sure you want to delete payslip <strong>${payslip?.payslipNumber}</strong>?</p>
            <p class="text-base-content/60 mb-0">This action cannot be undone.</p>
            <div class="modal-action">
                <button type="button" class="btn btn-ghost" onclick="document.getElementById('deleteModal').close()">Cancel</button>
                <g:form action="delete" id="${payslip?.id}" method="DELETE" style="display: inline;">
                    <button type="submit" class="btn btn-error">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg> Delete
                    </button>
                </g:form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>

</body>
</html>
