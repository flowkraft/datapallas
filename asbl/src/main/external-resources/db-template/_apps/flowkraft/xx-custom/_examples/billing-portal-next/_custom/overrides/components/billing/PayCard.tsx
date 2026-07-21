import Link from "next/link";
import { money, fmtDate } from "@/lib/format";
import { stripeEnabled, stripePublishableKey, payPalEnabled, payPalClientId } from "@/lib/payment";
import { InvoiceDoc } from "./InvoiceDoc";
import { StripeCard } from "./StripeCard";
import { PayPalButton } from "./PayPalButton";

// Derived from InvoiceDoc instead of redeclared, so the card can never drift from the document it
// renders above itself. Plus id, which the gateways need and the document has no use for.
type DocProps = React.ComponentProps<typeof InvoiceDoc>;

// Gateway-aware pay card — the 1:1 mirror of the Grails pay.gsp. Real Stripe.js card form when
// STRIPE keys are set (+ a PayPal button when configured); otherwise a zero-config demo checkout
// that posts to /api/pay (simulated settle). The E2E + video use the demo path.
export function PayCard({
  invoice, customer, lines, action, hidden, done, backHref,
}: {
  invoice: DocProps["invoice"] & { id: number };
  customer: DocProps["customer"];
  lines: DocProps["lines"];
  action: string;
  hidden: { name: string; value: string };
  done: boolean;
  backHref?: string;
}) {
  const back = backHref || (hidden.name === "token"
    ? `/portal/pay?token=${encodeURIComponent(hidden.value)}&paid=1`
    : `/portal/invoices/${invoice.id}`);
  const useStripe = stripeEnabled() && !!stripePublishableKey();
  const usePayPal = payPalEnabled();

  return (
    <>
      {/* The invoice being paid, from the SAME template the portal and admin detail pages render, so
          the customer sees the real document — line items, totals, status badge, Print — and not
          just an amount to hand money over for.
          Above the card and OUTSIDE the done/pending branch below: inside it, the document would
          vanish at the exact moment the customer wants it most, as a receipt.
          No width wrapper — .bp-invoice is already max-width:820px; margin:0 auto. */}
      <div className="pt-6">
        <InvoiceDoc invoice={invoice} customer={customer} lines={lines} />
      </div>

    <div className="max-w-md mx-auto pt-6">
      <div className="card bg-base-100 border border-base-300 shadow-lg">
        <div className="card-body text-center">
          {done ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-14 h-14 mx-auto text-success"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
              <h2 id="pay-success" className="card-title justify-center mt-2">Payment complete</h2>
              <p className="text-base-content/60">Invoice {invoice.invoiceNumber} has been paid. Thank you!</p>
              {backHref ? <Link href={backHref} className="btn btn-outline btn-sm mt-2">View invoice</Link> : null}
            </>
          ) : (
            <>
              <h2 className="card-title justify-center">Pay invoice</h2>
              <p className="text-base-content/60">{invoice.invoiceNumber}</p>
              <div id="pay-amount" className="text-4xl font-bold my-4">{money(invoice.total)}</div>
              <div className="text-xs text-base-content/50 mb-4">Due {fmtDate(invoice.dueDate)}</div>

              {useStripe ? (
                <StripeCard publishableKey={stripePublishableKey()} invoiceId={invoice.id} backHref={back} />
              ) : (
                <form action={action} method="post">
                  <input type="hidden" name={hidden.name} value={hidden.value} />
                  <button id="btn-pay" type="submit" className="btn btn-primary btn-block">Pay {money(invoice.total)}</button>
                </form>
              )}

              {usePayPal ? (
                <div className="mt-3"><PayPalButton clientId={payPalClientId()} invoiceId={invoice.id} backHref={back} /></div>
              ) : null}

              {!useStripe ? (
                <p className="text-xs text-base-content/40 mt-2">Demo checkout — no real payment is taken. Set <code>STRIPE_SECRET_KEY</code> + <code>STRIPE_PUBLISHABLE_KEY</code> to enable live card payments.</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
