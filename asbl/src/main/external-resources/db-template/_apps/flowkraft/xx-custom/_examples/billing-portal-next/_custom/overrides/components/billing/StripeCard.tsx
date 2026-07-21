"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

function CardForm({ invoiceId, backHref }: { invoiceId: number; backHref: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true);
    setErr("");
    try {
      const intent = await fetch("/api/payments/stripe/create-intent", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId }),
      }).then((r) => r.json());
      if (!intent.success) throw new Error(intent.error || "Could not start payment");

      const result = await stripe.confirmCardPayment(intent.clientSecret, {
        payment_method: { card: elements.getElement(CardElement)! },
      });
      if (result.error) throw new Error(result.error.message || "Payment failed");

      await fetch("/api/payments/stripe/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId: result.paymentIntent!.id }),
      });
      window.location.href = backHref;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment failed");
      setBusy(false);
    }
  }

  return (
    <>
      {/* Same ids as the Grails twin's inline Stripe form (pay.gsp): #stripe-card is the mount
          point, #stripe-error the message slot. #stripe-error is rendered ALWAYS, empty when there
          is nothing to say, because that is what the Grails markup does — a slot that appears only
          on failure would be a different DOM. */}
      <div id="stripe-card" className="input input-bordered flex items-center px-3 py-3 mb-2">
        <div className="w-full"><CardElement options={{ style: { base: { fontSize: "16px" } } }} /></div>
      </div>
      <div id="stripe-error" className="text-error text-xs mb-2">{err}</div>
      <button id="btn-pay" type="button" onClick={pay} disabled={busy} className="btn btn-primary btn-block">
        {busy ? "Processing…" : "Pay by card"}
      </button>
    </>
  );
}

export function StripeCard({ publishableKey, invoiceId, backHref }: { publishableKey: string; invoiceId: number; backHref: string }) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements stripe={stripePromise}>
      <CardForm invoiceId={invoiceId} backHref={backHref} />
    </Elements>
  );
}
