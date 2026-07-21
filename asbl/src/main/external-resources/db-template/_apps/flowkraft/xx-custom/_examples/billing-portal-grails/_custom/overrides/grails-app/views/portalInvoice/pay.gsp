<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="portal"/>
    <title>Pay ${invoice.invoiceNumber} — Billing Portal</title>
</head>
<body>

<%-- The invoice being paid, rendered from the SAME template the portal and admin detail pages use,
     so the customer sees the real document — line items, totals, status badge, Print — and not just
     an amount to hand money over for.
     It sits ABOVE the card and OUTSIDE the justPaid/payable branch below: inside the else branch it
     would vanish at the exact moment the customer wants it most, as a receipt.
     No width wrapper — .bp-invoice is already max-width:820px; margin:0 auto. --%>
<div class="pt-6">
  <g:render template="/invoiceDocument" model="[invoice: invoice]"/>
</div>

<div class="max-w-md mx-auto pt-6">
  <div class="card bg-base-100 border border-base-300 shadow-lg">
    <div class="card-body text-center">

      <g:if test="${justPaid || !invoice.payable}">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-14 h-14 mx-auto text-success"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
        <h2 id="pay-success" class="card-title justify-center mt-2">Payment complete</h2>
        <p class="text-base-content/60">Invoice ${invoice.invoiceNumber} has been paid. Thank you!</p>
        <g:if test="${!publicPay}">
          <a href="${createLink(action: 'show', id: invoice.id)}" class="btn btn-outline btn-sm mt-2">View invoice</a>
        </g:if>
      </g:if>

      <g:else>
        <h2 class="card-title justify-center">Pay invoice</h2>
        <p class="text-base-content/60">${invoice.invoiceNumber} — ${invoice.customer?.name}</p>
        <div id="pay-amount" class="text-4xl font-bold my-4"><g:formatNumber number="${invoice.total}" type="currency" currencyCode="USD"/></div>
        <div class="text-xs text-base-content/50 mb-4">Due <g:formatDate date="${invoice.dueDate}" format="MMM dd, yyyy"/></div>

        <g:if test="${stripeEnabled && stripePublishableKey}">
          <%-- Real Stripe card payment (only when STRIPE keys are configured) --%>
          <div id="stripe-card" class="input input-bordered flex items-center px-3 py-2 mb-2"></div>
          <div id="stripe-error" class="text-error text-xs mb-2"></div>
          <button id="btn-pay" type="button" class="btn btn-primary btn-block">Pay by card</button>
          <script src="https://js.stripe.com/v3/"></script>
          <script>
            (function () {
              var stripe = Stripe('${stripePublishableKey}');
              var card = stripe.elements().create('card');
              card.mount('#stripe-card');
              var btn = document.getElementById('btn-pay');
              var err = document.getElementById('stripe-error');
              btn.addEventListener('click', function () {
                btn.disabled = true; err.textContent = '';
                fetch('${createLink(controller: 'payment', action: 'createStripeIntent')}', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ invoiceId: ${invoice.id} })
                }).then(function (r) { return r.json(); }).then(function (res) {
                  if (!res.success) { throw new Error(res.error || 'Could not start payment'); }
                  return stripe.confirmCardPayment(res.clientSecret, { payment_method: { card: card } });
                }).then(function (result) {
                  if (result.error) { throw new Error(result.error.message); }
                  return fetch('${createLink(controller: 'payment', action: 'confirmStripePayment')}', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paymentIntentId: result.paymentIntent.id })
                  });
                }).then(function () { window.location = '${publicPay ? payUrl : createLink(action: 'show', id: invoice.id)}'; })
                  .catch(function (e) { err.textContent = e.message; btn.disabled = false; });
              });
            })();
          </script>
        </g:if>

        <g:else>
          <%-- Zero-config demo checkout (simulated settle) --%>
          <form action="${payUrl}" method="post">
            <button id="btn-pay" type="submit" class="btn btn-primary btn-block">
              Pay <g:formatNumber number="${invoice.total}" type="currency" currencyCode="USD"/>
            </button>
          </form>
          <p class="text-xs text-base-content/40 mt-2">Demo checkout — no real payment is taken. Set <code>STRIPE_SECRET_KEY</code> + <code>STRIPE_PUBLISHABLE_KEY</code> to enable live card payments.</p>
        </g:else>

        <g:if test="${payPalEnabled}">
          <form action="${createLink(controller: 'payment', action: 'createPayPalOrder')}" method="post" class="mt-2">
            <input type="hidden" name="invoiceId" value="${invoice.id}"/>
            <button type="submit" class="btn btn-outline btn-block">Pay with PayPal</button>
          </form>
        </g:if>
      </g:else>

    </div>
  </div>
</div>

</body>
</html>
