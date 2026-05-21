<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Settings - Admin</title>
    <content tag="title">Settings</content>
</head>
<body>

    <div class="mb-4">
        <h1 id="settings-page-title" class="h5 font-semibold text-base-content">Settings</h1>
        <p class="text-base-content/60 text-sm mb-0">Configure your application preferences</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem" id="settings-cards-grid">
        <!-- Company Settings - matches Next.js -->
        <div style="grid-column:span 4">
            <div class="card bg-base-100 border border-base-300 h-full" id="settings-card-company">
                <div class="card-body p-3">
                    <div class="flex items-center gap-2 mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
                        <h6 class="font-medium mb-0">Company</h6>
                    </div>
                    <g:form action="saveSettings" method="POST">
                        <input type="hidden" name="category" value="company"/>
                        <div class="mb-2">
                            <label class="label label-text text-sm text-base-content/60" for="companyName">Name</label>
                            <input type="text" class="input input-sm w-full" id="companyName"
                                   name="setting.company.name"
                                   value="${companySettings?.find { it.key == 'company.name' }?.value ?: ''}"
                                   placeholder="FlowKraft Inc."/>
                        </div>
                        <div class="mb-3">
                            <label class="label label-text text-sm text-base-content/60" for="companyEmail">Email</label>
                            <input type="email" class="input input-sm w-full" id="companyEmail"
                                   name="setting.company.email"
                                   value="${companySettings?.find { it.key == 'company.email' }?.value ?: ''}"
                                   placeholder="admin@company.com"/>
                        </div>
                        <button type="submit" class="btn btn-sm btn-neutral w-full" id="btn-save-company">Save</button>
                    </g:form>
                </div>
            </div>
        </div>

        <!-- Preferences Settings - matches Next.js -->
        <div style="grid-column:span 4">
            <div class="card bg-base-100 border border-base-300 h-full" id="settings-card-preferences">
                <div class="card-body p-3">
                    <div class="flex items-center gap-2 mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
                        <h6 class="font-medium mb-0">Preferences</h6>
                    </div>
                    <g:form action="saveSettings" method="POST">
                        <input type="hidden" name="category" value="preferences"/>
                        <div class="mb-2">
                            <label class="label label-text text-sm text-base-content/60" for="defaultCurrency">Currency</label>
                            <g:set var="currentCurrency" value="${preferenceSettings?.find { it.key == 'preferences.currency' }?.value ?: 'USD'}"/>
                            <select class="select select-sm w-full" id="defaultCurrency" name="setting.preferences.currency">
                                <option value="USD" ${currentCurrency == 'USD' ? 'selected' : ''}>USD</option>
                                <option value="EUR" ${currentCurrency == 'EUR' ? 'selected' : ''}>EUR</option>
                                <option value="GBP" ${currentCurrency == 'GBP' ? 'selected' : ''}>GBP</option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="label label-text text-sm text-base-content/60" for="dateFormat">Date Format</label>
                            <g:set var="currentDateFormat" value="${preferenceSettings?.find { it.key == 'preferences.dateFormat' }?.value ?: 'MM/dd/yyyy'}"/>
                            <select class="select select-sm w-full" id="dateFormat" name="setting.preferences.dateFormat">
                                <option value="MM/DD/YYYY" ${currentDateFormat == 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY</option>
                                <option value="DD/MM/YYYY" ${currentDateFormat == 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY</option>
                                <option value="YYYY-MM-DD" ${currentDateFormat == 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-sm btn-neutral w-full" id="btn-save-preferences">Save</button>
                    </g:form>
                </div>
            </div>
        </div>

        <!-- Payment Settings - matches Next.js -->
        <div style="grid-column:span 4">
            <div class="card bg-base-100 border border-base-300 h-full" id="settings-card-payment">
                <div class="card-body p-3">
                    <div class="flex items-center gap-2 mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 text-base-content/60"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/></svg>
                        <h6 class="font-medium mb-0">Payment</h6>
                    </div>
                    <g:form action="saveSettings" method="POST">
                        <input type="hidden" name="category" value="payment"/>
                        <div class="mb-3">
                            <label class="label label-text text-sm text-base-content/60" for="paymentProcessor">Default Processor</label>
                            <g:set var="currentProcessor" value="${paymentSettings?.find { it.key == 'payment.processor' }?.value ?: 'stripe'}"/>
                            <select class="select select-sm w-full" id="paymentProcessor" name="setting.payment.processor">
                                <option value="stripe" ${currentProcessor == 'stripe' ? 'selected' : ''}>Stripe</option>
                                <option value="paypal" ${currentProcessor == 'paypal' ? 'selected' : ''}>PayPal</option>
                                <option value="bank" ${currentProcessor == 'bank' ? 'selected' : ''}>Bank Transfer</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-sm btn-neutral w-full" id="btn-save-payment">Save</button>
                    </g:form>
                </div>
            </div>
        </div>
    </div>

</body>
</html>
