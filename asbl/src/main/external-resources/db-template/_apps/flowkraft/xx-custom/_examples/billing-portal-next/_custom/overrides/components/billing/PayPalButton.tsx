"use client";

import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

export function PayPalButton({ clientId, invoiceId, backHref }: { clientId: string; invoiceId: number; backHref: string }) {
  return (
    <PayPalScriptProvider options={{ clientId, currency: "USD" }}>
      <PayPalButtons
        style={{ layout: "horizontal", height: 40 }}
        createOrder={async () => {
          const r = await fetch("/api/payments/paypal/create-order", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId }),
          }).then((res) => res.json());
          return r.orderId;
        }}
        onApprove={async (data) => {
          await fetch("/api/payments/paypal/capture-order", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: data.orderID, invoiceId }),
          });
          window.location.href = backHref;
        }}
      />
    </PayPalScriptProvider>
  );
}
