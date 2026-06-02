<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="portal"/>
    <title>Pay Invoice ${invoice?.invoiceNumber} - FlowKraft</title>

    <!-- Stripe.js -->
    <script src="https://js.stripe.com/v3/"></script>

    <!-- PayPal SDK -->
    <script src="https://www.paypal.com/sdk/js?client-id=test&currency=${invoice?.currency ?: 'USD'}"></script>
</head>
<body>

    <div class="container">
        <!-- Breadcrumb -->
        <div class="breadcrumbs text-sm mb-4">
            <ul>
                <li><a href="${createLink(action: 'index')}">My Invoices</a></li>
                <li><a href="${createLink(action: 'show', id: invoice?.id)}">${invoice?.invoiceNumber}</a></li>
                <li>Pay</li>
            </ul>
        </div>

        <div class="flex justify-center">
            <div class="w-full max-w-lg">
                <div class="card bg-base-100 border border-base-300">
                    <div class="card-body">
                        <h2 class="card-title text-base justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/></svg>Pay Invoice ${invoice?.invoiceNumber}
                        </h2>

                        <!-- Invoice Summary -->
                        <div class="text-center mb-4 pb-4 border-b border-base-300">
                            <span class="text-5xl font-bold">${invoice?.formatAmount(invoice?.totalAmount)}</span>
                            <p class="text-base-content/60 mb-0">Total Amount Due</p>
                        </div>

                        <!-- Payment Method Tabs -->
                        <div class="tabs tabs-bordered mb-4">
                            <input type="radio" name="payment-tabs" role="tab" class="tab" aria-label="Card" id="stripe-tab" checked/>
                            <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="stripe-panel">
                                <div id="stripe-payment-form">
                                    <div id="card-element" class="input w-full mb-3" style="padding: 12px;"></div>
                                    <div id="card-errors" class="text-error text-sm mb-3" role="alert"></div>
                                    <button type="button" id="stripe-pay-btn" class="btn btn-primary w-full btn-lg">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg> Pay ${invoice?.formatAmount(invoice?.totalAmount)}
                                    </button>
                                </div>
                            </div>

                            <input type="radio" name="payment-tabs" role="tab" class="tab" aria-label="PayPal" id="paypal-tab"/>
                            <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="paypal-panel">
                                <div id="paypal-button-container"></div>
                            </div>
                        </div>

                        <!-- Security Note -->
                        <p class="text-base-content/60 text-sm text-center mt-4 mb-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>
                            Your payment is secured with 256-bit SSL encryption
                        </p>
                    </div>
                </div>

                <!-- Back Link -->
                <div class="text-center mt-3">
                    <a href="${createLink(action: 'show', id: invoice?.id)}" class="text-base-content/60">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg> Back to Invoice
                    </a>
                </div>
            </div>
        </div>
    </div>

    <script>
        const invoiceId = ${invoice?.id};
        const amount = ${invoice?.totalAmount};
        const currency = '${invoice?.currency ?: 'USD'}';

        // ===== STRIPE SETUP =====
        // Note: In production, use your actual Stripe publishable key
        const stripe = Stripe('pk_test_placeholder');
        const elements = stripe.elements();
        // Resolve active daisyUI theme colors so the Stripe card iframe matches the theme.
        const rootStyle = getComputedStyle(document.documentElement);
        const baseContent = rootStyle.getPropertyValue('--color-base-content').trim() || '#1e293b';
        const mutedContent = 'color-mix(in oklab, ' + baseContent + ' 60%, transparent)';
        const cardElement = elements.create('card', {
            style: {
                base: {
                    fontSize: '16px',
                    color: baseContent,
                    '::placeholder': { color: mutedContent }
                }
            }
        });
        cardElement.mount('#card-element');

        cardElement.on('change', function(event) {
            const errorDiv = document.getElementById('card-errors');
            errorDiv.textContent = event.error ? event.error.message : '';
        });

        document.getElementById('stripe-pay-btn').addEventListener('click', async function() {
            const btn = this;
            btn.disabled = true;
            btn.innerHTML = '<span class="loading loading-spinner loading-sm mr-2"></span>Processing...';

            try {
                // Create PaymentIntent
                const response = await fetch('/payment/stripe/create-intent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ invoiceId: invoiceId })
                });
                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.error || 'Failed to create payment intent');
                }

                // Confirm payment
                const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
                    payment_method: { card: cardElement }
                });

                if (error) {
                    throw new Error(error.message);
                }

                if (paymentIntent.status === 'succeeded') {
                    // Confirm with server
                    await fetch('/payment/stripe/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ paymentIntentId: paymentIntent.id })
                    });

                    window.location.href = '/portal/invoices/' + invoiceId + '?paid=true';
                }
            } catch (error) {
                document.getElementById('card-errors').textContent = error.message;
                btn.disabled = false;
                btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg> Pay $' + amount.toFixed(2);
            }
        });

        // ===== PAYPAL SETUP =====
        paypal.Buttons({
            createOrder: async function() {
                const response = await fetch('/payment/paypal/create-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ invoiceId: invoiceId })
                });
                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.error || 'Failed to create PayPal order');
                }

                return data.orderId;
            },
            onApprove: async function(data) {
                const response = await fetch('/payment/paypal/capture-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: data.orderID })
                });
                const result = await response.json();

                if (result.success) {
                    window.location.href = '/portal/invoices/' + invoiceId + '?paid=true';
                } else {
                    alert('Payment failed: ' + (result.error || 'Unknown error'));
                }
            },
            onError: function(err) {
                console.error('PayPal error:', err);
                alert('PayPal payment failed. Please try again.');
            }
        }).render('#paypal-button-container');
    </script>

</body>
</html>
