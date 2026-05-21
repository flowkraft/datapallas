<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Create Invoice - Admin</title>
    <content tag="title">Create Invoice</content>
</head>
<body>

    <!-- Breadcrumb -->
    <div class="breadcrumbs text-sm mb-4">
        <ul>
            <li><a href="${createLink(action: 'index')}">Invoices</a></li>
            <li>Create New</li>
        </ul>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 8">
            <div class="card bg-base-100 border border-base-300">
                <div class="card-body">
                    <h2 class="card-title text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>New Invoice
                    </h2>
                    <g:form action="save" method="POST">
                        <!-- Invoice Details -->
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem" class="mb-4">
                            <div>
                                <label class="label label-text">Invoice Number</label>
                                <input type="text" class="input w-full"
                                       id="invoiceNumber" name="invoiceNumber" value="${invoice?.invoiceNumber}"
                                       placeholder="INV-2024-001"/>
                                <small class="text-base-content/60">Leave blank to auto-generate</small>
                            </div>
                        </div>

                        <hr class="my-4"/>

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
                                       id="issueDate" name="issueDate" value="${invoice?.issueDate ? new java.text.SimpleDateFormat('yyyy-MM-dd').format(invoice.issueDate) : new java.text.SimpleDateFormat('yyyy-MM-dd').format(new Date())}"/>
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

                        <!-- Notes -->
                        <h6 class="text-base-content/60 mb-3">Additional Notes</h6>
                        <div class="mb-4">
                            <textarea class="input w-full" name="notes" rows="3" placeholder="Optional notes for the customer...">${invoice?.notes}</textarea>
                        </div>

                        <div class="flex justify-end gap-2">
                            <a href="${createLink(action: 'index')}" class="btn btn-outline">Cancel</a>
                            <button type="submit" id="btn-submit" class="btn btn-secondary">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> Create Invoice
                            </button>
                        </div>
                    </g:form>
                </div>
            </div>
        </div>

        <!-- Help Panel -->
        <div style="grid-column:span 4">
            <div class="card bg-base-100 border border-base-300 mb-4">
                <div class="card-body">
                    <h2 class="card-title text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>Help
                    </h2>
                    <p class="text-base-content/60 mb-3">
                        Create a new invoice for a customer. The invoice will be saved as a draft until you send it.
                    </p>
                    <ul class="text-base-content/60 text-sm mb-0">
                        <li class="mb-2">All required fields are marked with <span class="text-error">*</span></li>
                        <li class="mb-2">Tax and total are automatically calculated</li>
                        <li class="mb-2">After creating, you can send it to the customer</li>
                        <li>Customers can pay via Stripe or PayPal</li>
                    </ul>
                </div>
            </div>

            <!-- Quick Totals -->
            <div class="card bg-base-100 border border-base-300">
                <div class="card-body">
                    <h2 class="card-title text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z"/></svg>Totals Preview
                    </h2>
                    <table class="table table-sm">
                        <tr>
                            <td class="text-base-content/60">Subtotal</td>
                            <td class="text-right" id="previewSubtotal">$0.00</td>
                        </tr>
                        <tr>
                            <td class="text-base-content/60">Tax</td>
                            <td class="text-right" id="previewTax">$0.00</td>
                        </tr>
                        <tr>
                            <td class="text-base-content/60">Discount</td>
                            <td class="text-right text-error" id="previewDiscount">-$0.00</td>
                        </tr>
                        <tr class="border-t">
                            <td class="font-bold">Total</td>
                            <td class="text-right font-bold text-success" id="previewTotal">$0.00</td>
                        </tr>
                    </table>
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

            // Update preview
            document.getElementById('previewSubtotal').textContent = '$' + subtotal.toFixed(2);
            document.getElementById('previewTax').textContent = '$' + taxAmount.toFixed(2);
            document.getElementById('previewDiscount').textContent = '-$' + discount.toFixed(2);
            document.getElementById('previewTotal').textContent = '$' + total.toFixed(2);
        }

        // Initialize on load
        document.addEventListener('DOMContentLoaded', calculateTotal);
    </script>

</body>
</html>
