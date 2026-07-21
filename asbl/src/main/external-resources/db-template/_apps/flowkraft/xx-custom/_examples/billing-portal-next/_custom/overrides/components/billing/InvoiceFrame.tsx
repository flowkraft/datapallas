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

  // An iframe has no natural height — left alone it is a 150px porthole onto the invoice. Size it to
  // its content once the document is in.
  const fit = useCallback(() => {
    const f = ref.current;
    if (!f?.contentDocument) return;
    f.style.height = `${f.contentDocument.documentElement.scrollHeight}px`;
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
   */
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    fit();
    f.addEventListener("load", fit);
    return () => f.removeEventListener("load", fit);
  }, [fit, html]);

  // Printing the frame prints the frame's document ALONE — the navbar, the sidebar and the
  // Edit/Delete toolbar live in a different document and cannot be picked up. That is the whole
  // reason this used to open a popup and copy the styles across by hand; the frame already IS the
  // self-contained document that popup was trying to build. srcdoc is same-origin, so reaching
  // contentWindow is allowed.
  const printInvoice = useCallback(() => {
    const f = ref.current;
    if (!f?.contentWindow) return;
    f.contentWindow.focus();
    f.contentWindow.print();
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
