<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Edit Invoice - Admin</title>
    <content tag="title">Edit Invoice</content>
</head>
<body>

    <!-- Breadcrumb -->
    <div class="breadcrumbs text-sm mb-4">
        <ul>
            <li><a href="${createLink(action: 'index')}">Invoices</a></li>
            <li><a href="${createLink(action: 'show', id: invoice?.id)}">${invoice?.invoiceNumber}</a></li>
            <li>Edit</li>
        </ul>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 8">
            <div class="card bg-base-100 border border-base-300">
                <div class="card-body">
                    <div class="flex justify-between items-center mb-2">
                        <h2 class="card-title text-base">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>Edit Invoice
                        </h2>
                        <span class="badge ${invoice?.statusBadgeClass}">${invoice?.status?.capitalize()}</span>
                    </div>
                    <g:form action="update" id="${invoice?.id}" method="POST">
                        <!-- Customer Information -->
                        <h6 class="text-base-content/60 mb-3">Customer Information</h6>
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem" class="mb-4">
                            <div>
                                <label class="label label-text">Customer ID <span class="text-error">*</span></label>
                                <input type="text" class="input w-full ${hasErrors(bean: invoice, field: 'customerId', 'input-error')}"
                                       id="customerId" name="customerId" value="${invoice?.customerId}"/>
                                <g:renderErrors bean="${invoice}" field="customerId"/>
                            </div>
                            <div>
                                <label class="label label-text">Customer Name <span class="text-error">*</span></label>
                                <input type="text" class="input w-full ${hasErrors(bean: invoice, field: 'customerName', 'input-error')}"
                                       id="customerName" name="customerName" value="${invoice?.customerName}"/>
                                <g:renderErrors bean="${invoice}" field="customerName"/>
                            </div>
                            <div>
                                <label class="label label-text">Customer Email <span class="text-error">*</span></label>
                                <input type="email" class="input w-full ${hasErrors(bean: invoice, field: 'customerEmail', 'input-error')}"
                                       id="customerEmail" name="customerEmail" value="${invoice?.customerEmail}"/>
                                <g:renderErrors bean="${invoice}" field="customerEmail"/>
                            </div>
                            <div>
                                <label class="label label-text">Customer Address</label>
                                <input type="text" class="input w-full" name="customerAddress" value="${invoice?.customerAddress}"/>
                            </div>
                        </div>

                        <hr class="my-4"/>

                        <!-- Invoice Dates -->
                        <h6 class="text-base-content/60 mb-3">Invoice Dates</h6>
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem" class="mb-4">
                            <div>
                                <label class="label label-text">Issue Date <span class="text-error">*</span></label>
                                <input type="date" class="input w-full ${hasErrors(bean: invoice, field: 'issueDate', 'input-error')}"
                                       id="issueDate" name="issueDate" value="${invoice?.issueDate ? new java.text.SimpleDateFormat('yyyy-MM-dd').format(invoice.issueDate) : ''}"/>
                                <g:renderErrors bean="${invoice}" field="issueDate"/>
                            </div>
                            <div>
                                <label class="label label-text">Due Date <span class="text-error">*</span></label>
                                <input type="date" class="input w-full ${hasErrors(bean: invoice, field: 'dueDate', 'input-error')}"
                                       id="dueDate" name="dueDate" value="${invoice?.dueDate ? new java.text.SimpleDateFormat('yyyy-MM-dd').format(invoice.dueDate) : ''}"/>
                                <g:renderErrors bean="${invoice}" field="dueDate"/>
                            </div>
                        </div>

                        <hr class="my-4"/>

                        <!-- Amount Details -->
                        <h6 class="text-base-content/60 mb-3">Amount Details</h6>
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem" class="mb-4">
                            <div>
                                <label class="label label-text">Subtotal <span class="text-error">*</span></label>
                                <div class="join">
                                    <span class="join-item btn btn-ghost no-animation border border-base-300">$</span>
                                    <input type="number" step="0.01" class="input join-item w-full ${hasErrors(bean: invoice, field: 'subtotal', 'input-error')}"
                                           name="subtotal" id="subtotal" value="${invoice?.subtotal}" onchange="calculateTotal()"/>
                                </div>
                                <g:renderErrors bean="${invoice}" field="subtotal"/>
                            </div>
                            <div>
                                <label class="label label-text">Tax Rate (%)</label>
                                <div class="join">
                                    <input type="number" step="0.01" class="input join-item w-full" id="taxRate"
                                           name="taxRate" value="${invoice?.taxRate ?: 20}" onchange="calculateTotal()"/>
                                    <span class="join-item btn btn-ghost no-animation border border-base-300">%</span>
                                </div>
                            </div>
                            <div>
                                <label class="label label-text">Tax Amount</label>
                                <div class="join">
                                    <span class="join-item btn btn-ghost no-animation border border-base-300">$</span>
                                    <input type="number" step="0.01" class="input join-item w-full" id="taxAmount"
                                           name="taxAmount" value="${invoice?.taxAmount ?: 0}" readonly/>
                                </div>
                            </div>
                            <div>
                                <label class="label label-text">Discount</label>
                                <div class="join">
                                    <span class="join-item btn btn-ghost no-animation border border-base-300">$</span>
                                    <input type="number" step="0.01" class="input join-item w-full" id="discount"
                                           name="discount" value="${invoice?.discount ?: 0}" onchange="calculateTotal()"/>
                                </div>
                            </div>
                            <div>
                                <label class="label label-text">Total Amount</label>
                                <div class="join">
                                    <span class="join-item btn btn-ghost no-animation border border-base-300">$</span>
                                    <input type="number" step="0.01" class="input join-item w-full font-bold" id="totalAmount"
                                           name="totalAmount" value="${invoice?.totalAmount}" readonly/>
                                </div>
                            </div>
                            <div>
                                <label class="label label-text">Currency</label>
                                <select class="select w-full" name="currency">
                                    <option value="USD" ${invoice?.currency == 'USD' ? 'selected' : ''}>USD</option>
                                    <option value="EUR" ${invoice?.currency == 'EUR' ? 'selected' : ''}>EUR</option>
                                    <option value="GBP" ${invoice?.currency == 'GBP' ? 'selected' : ''}>GBP</option>
                                </select>
                            </div>
                        </div>

                        <hr class="my-4"/>

                        <!-- Status and Notes -->
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem" class="mb-4">
                            <div>
                                <label class="label label-text">Status</label>
                                <select class="select w-full" name="status">
                                    <option value="draft" ${invoice?.status == 'draft' ? 'selected' : ''}>Draft</option>
                                    <option value="sent" ${invoice?.status == 'sent' ? 'selected' : ''}>Sent</option>
                                    <option value="paid" ${invoice?.status == 'paid' ? 'selected' : ''}>Paid</option>
                                    <option value="overdue" ${invoice?.status == 'overdue' ? 'selected' : ''}>Overdue</option>
                                    <option value="cancelled" ${invoice?.status == 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                </select>
                            </div>
                            <div>
                                <label class="label label-text">Notes</label>
                                <textarea class="input w-full" name="notes" rows="1">${invoice?.notes}</textarea>
                            </div>
                        </div>

                        <div class="flex justify-end gap-2">
                            <a href="${createLink(action: 'show', id: invoice?.id)}" class="btn btn-outline">Cancel</a>
                            <button type="submit" id="btn-submit" class="btn btn-secondary">
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
                        Edit the invoice details. Changes will be saved immediately.
                    </p>
                    <ul class="text-base-content/60 text-sm mb-0">
                        <li class="mb-2">All required fields are marked with <span class="text-error">*</span></li>
                        <li class="mb-2">Tax and total are automatically calculated</li>
                        <li>Changing status won't automatically notify the customer</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>

    <script>
        function calculateTotal() {
            const subtotal = parseFloat(document.getElementById('subtotal').value) || 0;
            const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
            const discount = parseFloat(document.getElementById('discount').value) || 0;

            const taxAmount = subtotal * (taxRate / 100);
            const total = subtotal + taxAmount - discount;

            document.getElementById('taxAmount').value = taxAmount.toFixed(2);
            document.getElementById('totalAmount').value = total.toFixed(2);
        }
    </script>

</body>
</html>
