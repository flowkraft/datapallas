<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Invoice ${invoice?.invoiceNumber} - Admin</title>
    <content tag="title">Invoice Details</content>
</head>
<body>

    <!-- Breadcrumb -->
    <div class="breadcrumbs text-sm mb-4">
        <ul>
            <li><a href="${createLink(action: 'index')}">Invoices</a></li>
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
            <!-- Invoice Details Card -->
            <div class="card bg-base-100 border border-base-300 mb-4">
                <div class="card-body">
                    <div class="flex justify-between items-center mb-2">
                        <h2 class="card-title text-base">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>${invoice?.invoiceNumber}
                        </h2>
                        <span class="badge ${invoice?.statusBadgeClass} fs-6">${invoice?.status?.capitalize()}</span>
                    </div>

                    <!-- Customer Info -->
                    <h6 class="text-base-content/60 mb-3">Customer Information</h6>
                    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem" class="mb-4">
                        <div style="grid-column:span 6">
                            <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                <dt class="text-base-content/60">Name</dt>
                                <dd>${invoice?.customerName}</dd>
                                <dt class="text-base-content/60">Email</dt>
                                <dd>${invoice?.customerEmail}</dd>
                            </dl>
                        </div>
                        <div style="grid-column:span 6">
                            <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                <dt class="text-base-content/60">ID</dt>
                                <dd>${invoice?.customerId}</dd>
                                <dt class="text-base-content/60">Address</dt>
                                <dd>${invoice?.customerAddress ?: '-'}</dd>
                            </dl>
                        </div>
                    </div>

                    <hr/>

                    <!-- Dates -->
                    <h6 class="text-base-content/60 mb-3">Invoice Dates</h6>
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
                                    <td class="font-bold">Total Amount</td>
                                    <td class="text-right font-bold text-success">${invoice?.formatAmount(invoice?.totalAmount)}</td>
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
                        <h6 class="text-base-content/60 mb-3">Payment Information</h6>
                        <div class="alert alert-success mb-0">
                            <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
                                <div style="grid-column:span 6">
                                    <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                        <dt>Method</dt>
                                        <dd>
                                            <g:if test="${invoice?.paymentMethod == 'stripe'}">
                                                <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-4 h-4 mr-1" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg>
                                            </g:if>
                                            <g:elseif test="${invoice?.paymentMethod == 'paypal'}">
                                                <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-4 h-4 mr-1" fill="currentColor"><path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/></svg>
                                            </g:elseif>
                                            <g:else>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/></svg>
                                            </g:else>
                                            ${invoice?.paymentMethodDisplay}
                                        </dd>
                                    </dl>
                                </div>
                                <div style="grid-column:span 6">
                                    <dl style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.25rem;" class="mb-0">
                                        <dt>Paid At</dt>
                                        <dd><g:formatDate date="${invoice?.paidAt}" format="MMM dd, yyyy HH:mm"/></dd>
                                    </dl>
                                </div>
                            </div>
                            <g:if test="${invoice?.paymentReference}">
                                <hr class="my-2"/>
                                <small class="text-base-content/60">Reference: ${invoice?.paymentReference}</small>
                            </g:if>
                        </div>
                    </g:if>
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
                        <g:if test="${invoice?.status == 'draft'}">
                            <a href="${createLink(action: 'send', id: invoice?.id)}" class="btn btn-secondary">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"/></svg>Send to Customer
                            </a>
                        </g:if>
                        <g:if test="${invoice?.isPayable()}">
                            <button type="button" class="btn btn-success" onclick="document.getElementById('markPaidModal').showModal()">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>Mark as Paid
                            </button>
                        </g:if>
                        <a href="${createLink(action: 'edit', id: invoice?.id)}" class="btn btn-outline">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>Edit Invoice
                        </a>
                        <a href="${createLink(action: 'download', id: invoice?.id)}" class="btn btn-outline">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>Download PDF
                        </a>
                        <g:if test="${invoice?.status != 'cancelled' && invoice?.status != 'paid'}">
                            <a href="${createLink(action: 'cancel', id: invoice?.id)}" class="btn btn-outline btn-warning"
                               onclick="return confirm('Are you sure you want to cancel this invoice?')">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>Cancel Invoice
                            </a>
                        </g:if>
                        <hr/>
                        <button type="button" class="btn btn-outline btn-error" onclick="document.getElementById('deleteModal').showModal()">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>Delete Invoice
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
                        <dd><g:formatDate date="${invoice?.dateCreated}" format="MMM dd, yyyy HH:mm"/></dd>
                        <dt class="text-base-content/60">Updated</dt>
                        <dd><g:formatDate date="${invoice?.lastUpdated}" format="MMM dd, yyyy HH:mm"/></dd>
                        <dt class="text-base-content/60">Currency</dt>
                        <dd>${invoice?.currency}</dd>
                    </dl>
                </div>
            </div>
        </div>
    </div>

    <!-- Mark as Paid Modal -->
    <dialog id="markPaidModal" class="modal">
        <div class="modal-box">
            <g:form action="markPaid" id="${invoice?.id}" method="POST">
                <h3 class="font-bold text-base mb-4">Mark Invoice as Paid</h3>
                <div class="mb-3">
                    <label class="label label-text">Payment Method</label>
                    <select class="select w-full" name="paymentMethod" required>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cash">Cash</option>
                        <option value="stripe">Stripe</option>
                        <option value="paypal">PayPal</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="label label-text">Payment Reference (Optional)</label>
                    <input type="text" class="input w-full" name="paymentReference" placeholder="e.g., Bank transfer reference"/>
                </div>
                <div class="modal-action">
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('markPaidModal').close()">Cancel</button>
                    <button type="submit" class="btn btn-success">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> Mark as Paid
                    </button>
                </div>
            </g:form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>

    <!-- Delete Confirmation Modal -->
    <dialog id="deleteModal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-base">Delete Invoice</h3>
            <p class="py-2">Are you sure you want to delete invoice <strong>${invoice?.invoiceNumber}</strong>?</p>
            <p class="text-base-content/60 mb-0">This action cannot be undone.</p>
            <div class="modal-action">
                <button type="button" class="btn btn-ghost" onclick="document.getElementById('deleteModal').close()">Cancel</button>
                <g:form action="delete" id="${invoice?.id}" method="DELETE" style="display: inline;">
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
