<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Edit Payslip - Admin</title>
    <content tag="title">Edit Payslip</content>
</head>
<body>

    <!-- Breadcrumb -->
    <div class="breadcrumbs text-sm mb-4">
        <ul>
            <li><a href="${createLink(action: 'index')}">Payslips</a></li>
            <li><a href="${createLink(action: 'show', id: payslip?.id)}">${payslip?.payslipNumber}</a></li>
            <li>Edit</li>
        </ul>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 8">
            <div class="card bg-base-100 border border-base-300">
                <div class="card-body">
                    <div class="flex justify-between items-center mb-2">
                        <h2 class="card-title text-base">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>Edit Payslip
                        </h2>
                        <span class="badge ${payslip?.statusBadgeClass}">${payslip?.status?.capitalize()}</span>
                    </div>
                    <g:form action="update" id="${payslip?.id}" method="POST">
                        <!-- Employee Information -->
                        <h6 class="text-base-content/60 mb-3">Employee Information</h6>
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem" class="mb-4">
                            <div>
                                <label class="label label-text">Employee ID <span class="text-error">*</span></label>
                                <input type="text" class="input w-full ${hasErrors(bean: payslip, field: 'employeeId', 'input-error')}"
                                       id="employeeId" name="employeeId" value="${payslip?.employeeId}"/>
                                <g:renderErrors bean="${payslip}" field="employeeId"/>
                            </div>
                            <div>
                                <label class="label label-text">Employee Name <span class="text-error">*</span></label>
                                <input type="text" class="input w-full ${hasErrors(bean: payslip, field: 'employeeName', 'input-error')}"
                                       id="employeeName" name="employeeName" value="${payslip?.employeeName}"/>
                                <g:renderErrors bean="${payslip}" field="employeeName"/>
                            </div>
                            <div>
                                <label class="label label-text">Employee Email <span class="text-error">*</span></label>
                                <input type="email" class="input w-full ${hasErrors(bean: payslip, field: 'employeeEmail', 'input-error')}"
                                       id="employeeEmail" name="employeeEmail" value="${payslip?.employeeEmail}"/>
                                <g:renderErrors bean="${payslip}" field="employeeEmail"/>
                            </div>
                            <div>
                                <label class="label label-text">Department</label>
                                <input type="text" class="input w-full" name="department" value="${payslip?.department}"/>
                            </div>
                        </div>

                        <hr class="my-4"/>

                        <!-- Pay Period -->
                        <h6 class="text-base-content/60 mb-3">Pay Period</h6>
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem" class="mb-4">
                            <div>
                                <label class="label label-text">Period Start <span class="text-error">*</span></label>
                                <input type="date" class="input w-full ${hasErrors(bean: payslip, field: 'payPeriodStart', 'input-error')}"
                                       id="payPeriodStart" name="payPeriodStart" value="${payslip?.payPeriodStart ? new java.text.SimpleDateFormat('yyyy-MM-dd').format(payslip.payPeriodStart) : ''}"/>
                                <g:renderErrors bean="${payslip}" field="payPeriodStart"/>
                            </div>
                            <div>
                                <label class="label label-text">Period End <span class="text-error">*</span></label>
                                <input type="date" class="input w-full ${hasErrors(bean: payslip, field: 'payPeriodEnd', 'input-error')}"
                                       id="payPeriodEnd" name="payPeriodEnd" value="${payslip?.payPeriodEnd ? new java.text.SimpleDateFormat('yyyy-MM-dd').format(payslip.payPeriodEnd) : ''}"/>
                                <g:renderErrors bean="${payslip}" field="payPeriodEnd"/>
                            </div>
                        </div>

                        <hr class="my-4"/>

                        <!-- Payment Details -->
                        <h6 class="text-base-content/60 mb-3">Payment Details</h6>
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem" class="mb-4">
                            <div>
                                <label class="label label-text">Gross Amount <span class="text-error">*</span></label>
                                <div class="join">
                                    <span class="join-item btn btn-ghost no-animation border border-base-300">$</span>
                                    <input type="number" step="0.01" class="input join-item w-full ${hasErrors(bean: payslip, field: 'grossAmount', 'input-error')}"
                                           id="grossAmount" name="grossAmount" value="${payslip?.grossAmount}" onchange="calculateNet()"/>
                                </div>
                                <g:renderErrors bean="${payslip}" field="grossAmount"/>
                            </div>
                            <div>
                                <label class="label label-text">Deductions</label>
                                <div class="join">
                                    <span class="join-item btn btn-ghost no-animation border border-base-300">$</span>
                                    <input type="number" step="0.01" class="input join-item w-full" id="deductions"
                                           name="deductions" value="${payslip?.deductions ?: 0}" onchange="calculateNet()"/>
                                </div>
                            </div>
                            <div>
                                <label class="label label-text">Net Amount</label>
                                <div class="join">
                                    <span class="join-item btn btn-ghost no-animation border border-base-300">$</span>
                                    <input type="number" step="0.01" class="input join-item w-full" id="netAmount"
                                           name="netAmount" value="${payslip?.netAmount}" readonly/>
                                </div>
                            </div>
                            <div>
                                <label class="label label-text">Currency</label>
                                <select class="select w-full" name="currency">
                                    <option value="USD" ${payslip?.currency == 'USD' ? 'selected' : ''}>USD</option>
                                    <option value="EUR" ${payslip?.currency == 'EUR' ? 'selected' : ''}>EUR</option>
                                    <option value="GBP" ${payslip?.currency == 'GBP' ? 'selected' : ''}>GBP</option>
                                </select>
                            </div>
                            <div>
                                <label class="label label-text">Status</label>
                                <select class="select w-full" name="status">
                                    <option value="draft" ${payslip?.status == 'draft' ? 'selected' : ''}>Draft</option>
                                    <option value="sent" ${payslip?.status == 'sent' ? 'selected' : ''}>Sent</option>
                                    <option value="viewed" ${payslip?.status == 'viewed' ? 'selected' : ''}>Viewed</option>
                                    <option value="downloaded" ${payslip?.status == 'downloaded' ? 'selected' : ''}>Downloaded</option>
                                </select>
                            </div>
                        </div>

                        <div class="flex justify-end gap-2">
                            <a href="${createLink(action: 'show', id: payslip?.id)}" class="btn btn-outline">Cancel</a>
                            <button type="submit" id="btn-submit" class="btn btn-primary">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> Save Changes
                            </button>
                        </div>
                    </g:form>
                </div>
            </div>
        </div>

        <!-- Help Panel -->
        <div style="grid-column:span 4">
            <div class="card bg-base-100 border border-base-300">
                <div class="card-body">
                    <h2 class="card-title text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>Help
                    </h2>
                    <p class="text-base-content/60 mb-3">
                        Edit the payslip details. Changes will be saved immediately.
                    </p>
                    <ul class="text-base-content/60 text-sm mb-0">
                        <li class="mb-2">All required fields are marked with <span class="text-error">*</span></li>
                        <li class="mb-2">Net amount is automatically calculated</li>
                        <li>Changing status to "Sent" will not automatically notify the employee</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>

    <script>
        function calculateNet() {
            const gross = parseFloat(document.querySelector('[name="grossAmount"]').value) || 0;
            const deductions = parseFloat(document.getElementById('deductions').value) || 0;
            document.getElementById('netAmount').value = (gross - deductions).toFixed(2);
        }
    </script>

</body>
</html>
