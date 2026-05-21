<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Invoices - Admin</title>
    <content tag="title">Invoices</content>
</head>
<body>

    <div class="space-y-4">
        <!-- Header - matches Next.js -->
        <div class="flex justify-between items-center mb-3" id="invoices-header">
            <h1 class="h5 font-semibold text-base-content mb-0" id="invoices-page-title">Invoices</h1>
            <a href="${createLink(action: 'create')}" class="btn btn-sm btn-neutral" id="btn-new-invoice">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> New
            </a>
        </div>

        <!-- Search - matches Next.js -->
        <div class="mb-3" id="invoices-search">
            <g:form action="index" method="GET" class="inline-block">
                <input type="text" class="input input-sm w-full" name="search" id="invoices-search-input"
                       value="${params.search}" placeholder="Search..." style="max-width: 200px;"/>
            </g:form>
        </div>

        <!-- Table - matches Next.js structure -->
        <div class="card bg-base-100 border border-base-300" id="invoices-table-card">
            <div class="overflow-x-auto">
                <table class="table" id="invoices-table">
                    <thead>
                        <tr>
                            <th class="text-sm text-base-content/60 uppercase">Invoice</th>
                            <th class="text-sm text-base-content/60 uppercase">Customer</th>
                            <th class="text-sm text-base-content/60 uppercase">Due</th>
                            <th class="text-sm text-base-content/60 uppercase text-right">Amount</th>
                            <th class="text-sm text-base-content/60 uppercase">Status</th>
                            <th style="width: 200px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <g:if test="${invoiceList}">
                            <g:each in="${invoiceList}" var="invoice" status="i">
                                <tr class="invoice-row" id="invoice-row-${invoice.id}">
                                    <td class="text-sm font-medium">${invoice.invoiceNumber}</td>
                                    <td>
                                        <div class="text-sm">${invoice.customerName}</div>
                                        <div class="text-sm text-base-content/60">${invoice.customerEmail}</div>
                                    </td>
                                    <td class="text-sm text-base-content/60">
                                        <g:formatDate date="${invoice.dueDate}" format="MMM d, yyyy"/>
                                    </td>
                                    <td class="text-sm font-medium text-right">${invoice.formatAmount(invoice.totalAmount)}</td>
                                    <td>
                                        <span class="badge ${invoice.status == 'paid' ? 'badge-success' : invoice.status == 'overdue' ? 'badge-error' : 'badge'} text-sm">
                                            ${invoice.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="flex justify-end gap-1">
                                            <a href="${createLink(action: 'show', id: invoice.id)}"
                                               class="btn btn-ghost btn-sm p-1 text-base-content/60" title="View">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg> View
                                            </a>
                                            <a href="${createLink(action: 'edit', id: invoice.id)}"
                                               class="btn btn-ghost btn-sm p-1 text-base-content/60 btn-edit" title="Edit">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg> Edit
                                            </a>
                                            <button type="button" class="btn btn-ghost btn-sm p-1 text-base-content/60 btn-delete"
                                                    title="Delete" onclick="confirmDelete(${invoice.id})">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            </g:each>
                        </g:if>
                        <g:else>
                            <tr>
                                <td colspan="6" class="text-center py-4 text-base-content/60 text-sm">
                                    No invoices found.
                                </td>
                            </tr>
                        </g:else>
                    </tbody>
                </table>
            </div>
        </div>
        <!-- Pagination -->
        <g:if test="${invoiceCount > 0}">
            <div class="flex justify-between items-center mt-3 px-1" id="pagination-controls">
                <span class="text-sm text-base-content/60" id="pagination-info">
                    Showing ${Math.min((currentPage - 1) * pageSize + 1, invoiceCount)}-${Math.min(currentPage * pageSize, invoiceCount)} of ${invoiceCount}
                </span>
                <div class="join">
                    <a class="join-item btn btn-sm ${currentPage <= 1 ? 'btn-disabled' : ''}" id="btn-prev-page"
                       href="${createLink(action: 'index', params: [page: currentPage - 1, max: pageSize, search: params.search, status: params.status])}">Previous</a>
                    <a class="join-item btn btn-sm ${currentPage >= totalPages ? 'btn-disabled' : ''}" id="btn-next-page"
                       href="${createLink(action: 'index', params: [page: currentPage + 1, max: pageSize, search: params.search, status: params.status])}">Next</a>
                </div>
            </div>
        </g:if>
    </div>

    <!-- Delete Confirmation Modal -->
    <dialog id="deleteModal" class="modal modal-sm">
        <div class="modal-box">
            <h3 class="font-bold text-base">Delete Invoice</h3>
            <p class="py-2 text-base-content/60 text-sm">This cannot be undone.</p>
            <div class="modal-action">
                <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('deleteModal').close()">Cancel</button>
                <g:form action="delete" method="POST" class="inline">
                    <input type="hidden" name="id" id="deleteInvoiceId"/>
                    <button type="submit" id="btn-confirm-delete" class="btn btn-sm btn-error">Delete</button>
                </g:form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>

    <content tag="scripts">
        <script>
            function confirmDelete(id) {
                document.getElementById('deleteInvoiceId').value = id;
                document.getElementById('deleteModal').showModal();
            }
        </script>
    </content>

</body>
</html>
