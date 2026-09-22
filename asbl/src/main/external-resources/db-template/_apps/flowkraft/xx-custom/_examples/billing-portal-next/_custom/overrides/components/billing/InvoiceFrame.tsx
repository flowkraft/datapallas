"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Hosts the invoice document in an iframe, plus the Print button that drives it.
 * The 1:1 mirror of the Grails twin's _invoiceDocument.gsp.
 *
 * `html` is a COMPLETE standalone document (built by InvoiceDoc) handed to srcdoc. An iframe is a
 * hard styling boundary: the portal's Tailwind 4 + daisyUI 5 stylesheet cannot reach in, and the
 * invoice's own CSS cannot leak out — so the invoice looks identical under every daisyUI theme, and
 * restyling it means editing INVOICE_CSS and nothing else.
 *
 * srcdoc rather than a dedicated /document URL for the frame to load: the invoice then ships inside
 * the page that already authorized the viewer, so there is no second endpoint to guard. A route
 * would need its own authorization, and getting that wrong is exactly how a portal leaks other
 * people's invoices.
 *
 * Client component because it needs onLoad + onClick — InvoiceDoc, which builds the document, is a
 * server component and can attach neither.
 */
export function InvoiceFrame({ html, invoiceNumber }: { html: string; invoiceNumber: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  // The last height actually written. Kept so a re-measure that agrees with the current layout costs
  // nothing, and so `html` changing starts from a clean slate rather than trusting a stale number.
  const applied = useRef(0);

  // An iframe has no natural height — left alone it is a 150px porthole onto the invoice. Size it to
  // its content once the document is in.
  //
  // NOTHING IN HERE MAY THROW. fit() is called from useEffect below, so a throw is a throw during
  // commit; with no error boundary above this component React tears down the whole tree, and the
  // invoice page loses the Edit/Delete toolbar that lives beside the frame. Sizing the frame is
  // cosmetic, and failing to size it has to stay cosmetic — it must never be able to cost the page.
  // Every read below is therefore optional-chained and the body is wrapped, belt and braces.
  const fit = useCallback(() => {
    try {
      const f = ref.current;
      const doc = f?.contentDocument;
      // `contentDocument` becomes non-null well BEFORE the srcdoc document is usable: while it is
      // parsing, `documentElement` is still null. Reading `.scrollHeight` off that null is the whole
      // bug this guard exists to stop, and checking `contentDocument` alone never caught it — the
      // guard used to sit exactly one level too shallow. `body` arrives later again, so measure
      // whichever of the two is actually there.
      const root = doc?.documentElement;
      if (!f || !doc || !root) return;
      // Mid-parse the tree exists but is still growing, so anything measured now is short-lived.
      // The load listener and the ladder below both come back for it.
      if (doc.readyState === "loading") return;
      const h = Math.max(root.scrollHeight || 0, doc.body?.scrollHeight || 0);
      // 0 means "has parsed nothing yet", not "this invoice is empty". Writing it would collapse the
      // frame to a sliver; leaving the 150px default standing is the better of the two wrong answers,
      // and the next rung of the ladder will have a real number.
      if (!Number.isFinite(h) || h <= 0) return;
      // Only write on a real change. Setting the iframe's height changes the inner viewport, which
      // can change scrollHeight again for anything sized in viewport units — the 1px deadband is what
      // stops that from turning into a feedback loop.
      if (Math.abs(h - applied.current) <= 1) return;
      applied.current = h;
      f.style.height = `${h}px`;
    } catch {
      // A frame that stays 150px tall is a visible nuisance. A frame that throws is a blank page.
    }
  }, []);

  /**
   * Fit on mount AND on load, because either one alone loses the race.
   *
   * An `onLoad` prop is not enough: the iframe ships in the server-rendered HTML, so the browser
   * loads srcdoc immediately and React only attaches the handler later, during hydration — by then
   * the load event has been and gone, and the invoice sits clipped in a 150px window forever. (The
   * Grails twin has no such problem: its inline onload= attribute is attached as the tag is parsed.)
   *
   * Nor is mount alone enough: srcdoc may still be parsing at that point, so scrollHeight is not
   * final yet. Do both — fit now for the already-loaded case, and listen for a load that has not
   * happened yet. Re-runs if `html` changes, since that reloads the frame.
   *
   * And neither is enough on a slow machine, which is where this used to break. At mount the document
   * can still be parsing; by `load` its own images and fonts may not have settled, so even the first
   * successful measurement can come out short. A small FIXED ladder of re-measurements covers both
   * ends without a ResizeObserver's feedback risk: six cheap reads, each a no-op once the height
   * agrees, all cancelled on unmount. A frame that never parses costs six no-ops and nothing else.
   */
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    // `html` changed ⇒ the frame reloads ⇒ the old measurement describes a document that is gone.
    applied.current = 0;

    fit();
    f.addEventListener("load", fit);
    const timers = [0, 50, 150, 400, 1000, 2500].map((ms) => window.setTimeout(fit, ms));

    return () => {
      f.removeEventListener("load", fit);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [fit, html]);

  // Printing the frame prints the frame's document ALONE — the navbar, the sidebar and the
  // Edit/Delete toolbar live in a different document and cannot be picked up. That is the whole
  // reason this used to open a popup and copy the styles across by hand; the frame already IS the
  // self-contained document that popup was trying to build. srcdoc is same-origin, so reaching
  // contentWindow is allowed.
  //
  // Wrapped for the same reason fit() is: a print dialog that refuses to open is an annoyance, and
  // an exception escaping a click handler is a page-wide error. Embedders differ on what print()
  // does — Electron is not Chromium here — so this is not a hypothetical.
  const printInvoice = useCallback(() => {
    try {
      const f = ref.current;
      if (!f?.contentWindow) return;
      f.contentWindow.focus();
      f.contentWindow.print();
    } catch {
      // No dialog. The Print button simply does nothing rather than taking the invoice with it.
    }
  }, []);

  return (
    <>
      {/* OUTSIDE the frame, so it can never print itself — and rendered for EVERY viewer: someone
          settling an invoice without signing in wants a copy for their records just as much as the
          account holder does. */}
      <div className="flex justify-end mb-2">
        <button type="button" id="btn-print-invoice" className="btn btn-sm" onClick={printInvoice}>
          Print / Save PDF
        </button>
      </div>
      <iframe
        id="invoiceFrame"
        ref={ref}
        title={`Invoice ${invoiceNumber}`}
        style={{ width: "100%", border: 0, display: "block", overflow: "hidden" }}
        srcDoc={html}
      />
    </>
  );
}
