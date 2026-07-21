"use client";
import { useRef } from "react";

/**
 * Delete confirmation — the 1:1 mirror of the Grails invoice/index.gsp modal (same ids, same copy).
 *
 * Deleting an invoice is irreversible (it cascades to its line items), so it must never happen on a
 * single stray click.
 *
 * Shape matters: ONE modal for the whole page, retargeted per row — NOT one modal per row. A modal
 * per row would emit N elements all carrying id="confirm-delete-modal" / "btn-confirm-delete-yes",
 * so getElementById would always return the FIRST row's copy and the wrong invoice would be deleted.
 * That is also why this is split in two: DeleteInvoiceButton sits in each row, DeleteInvoiceModal is
 * rendered exactly once by the page.
 */
export function DeleteInvoiceButton({
  invoiceId,
  invoiceNumber,
  // The list renders a compact row action; the invoice detail page a full-size outlined button.
  // Same button, same id, same modal — only the chrome differs, matching the Grails twin.
  className = "btn btn-ghost btn-xs text-error",
}: {
  invoiceId: number;
  invoiceNumber: string;
  className?: string;
}) {
  const onClick = () => {
    const what = document.getElementById("confirm-delete-what");
    const idInput = document.getElementById("confirm-delete-id") as HTMLInputElement | null;
    const modal = document.getElementById("confirm-delete-modal") as HTMLDialogElement | null;
    if (!what || !idInput || !modal) return;
    what.textContent = invoiceNumber;      // …retarget the single modal at THIS row
    idInput.value = String(invoiceId);
    modal.showModal();
  };
  return (
    <button type="button" id={`btn-delete-${invoiceNumber}`} className={className} onClick={onClick}>Delete</button>
  );
}

/** Rendered ONCE per page. `action` is the deleteInvoice server action, passed down from the page. */
export function DeleteInvoiceModal({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <dialog id="confirm-delete-modal" ref={dlg} className="modal">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Delete invoice?</h3>
        <p className="py-4">
          Delete invoice <strong id="confirm-delete-what"></strong>?
          This permanently removes it and its line items. This cannot be undone.
        </p>
        <div className="modal-action">
          <button type="button" id="btn-confirm-delete-no" className="btn" onClick={() => dlg.current?.close()}>No, keep it</button>
          <form action={action}>
            <input type="hidden" id="confirm-delete-id" name="id" defaultValue="" />
            <button type="submit" id="btn-confirm-delete-yes" className="btn btn-error">Yes, delete</button>
          </form>
        </div>
      </div>
      {/* Plain button, not daisyUI's <form method="dialog"> backdrop — a nested form would be
          invalid HTML and the Grails twin's parser closes the OUTER form at the inner </form>. */}
      <button type="button" className="modal-backdrop" onClick={() => dlg.current?.close()}>close</button>
    </dialog>
  );
}
