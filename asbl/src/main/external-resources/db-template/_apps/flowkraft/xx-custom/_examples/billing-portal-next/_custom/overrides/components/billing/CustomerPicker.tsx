"use client";
import { useRef, useState } from "react";

type Cust = { id: number; name: string; email: string; city?: string | null; country?: string | null };
type Result = { customers: Cust[]; page: number; totalPages: number; total: number };

// Searchable + paginated customer picker modal — 1:1 mirror of the Grails _form.gsp picker
// (same semantic ids). Fetches /api/customers/search on demand, so it scales to thousands.
export function CustomerPicker({ initialId = null, initialName = "" }: { initialId?: number | null; initialName?: string }) {
  const [selId, setSelId] = useState<number | null>(initialId);
  const [selName, setSelName] = useState(initialName);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Result>({ customers: [], page: 1, totalPages: 1, total: 0 });
  const dlg = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = (query: string, p: number) => {
    fetch(`/api/customers/search?q=${encodeURIComponent(query)}&page=${Math.max(1, p)}`)
      .then((r) => r.json())
      .then((d: Result) => setData(d))
      .catch(() => {});
  };
  const open = () => { setQ(""); load("", 1); dlg.current?.showModal(); };
  const onSearch = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(v, 1), 250);
  };
  const select = (c: Cust) => { setSelId(c.id); setSelName(`${c.name} (${c.email})`); dlg.current?.close(); };

  return (
    <>
      <input type="hidden" id="invoice-customer-id" name="customerId" value={selId ?? ""} />
      <div className="flex gap-2 items-center">
        <span id="customer-picker-display" className="input flex-1 truncate">{selName || "— choose —"}</span>
        <button type="button" id="btn-choose-customer" className="btn btn-neutral" onClick={open}>Choose…</button>
      </div>

      <dialog id="customer-picker-modal" ref={dlg} className="modal">
        <div className="modal-box max-w-2xl">
          <h3 className="font-bold text-lg mb-2">Choose customer</h3>
          <input id="customer-picker-search" type="text" placeholder="Search name or email…" className="input w-full mb-3"
            value={q} onChange={(e) => onSearch(e.target.value)} />
          {/* Name + email only. City/Country pushed the table past the modal width, so it rendered
              with a horizontal scrollbar — and neither helps you pick: you search by name or email,
              and the email is what identifies the account (the portal upserts customers on it). */}
          <table className="table table-sm">
            <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
            <tbody id="customer-picker-results">
              {data.customers.length === 0
                ? <tr><td colSpan={3} className="text-center text-base-content/50 py-4">No customers found.</td></tr>
                : data.customers.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.email}</td>
                    <td className="text-right"><button type="button" id={`customer-picker-select-${c.email}`} className="btn btn-primary btn-xs" onClick={() => select(c)}>Select</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <span id="customer-picker-info" className="text-sm text-base-content/60">Page {data.page} of {data.totalPages} · {data.total} customer(s)</span>
            <div className="join">
              <button type="button" id="customer-picker-first" className="join-item btn btn-sm" disabled={data.page <= 1} onClick={() => load(q, 1)}>« First</button>
              <button type="button" id="customer-picker-prev" className="join-item btn btn-sm" disabled={data.page <= 1} onClick={() => load(q, data.page - 1)}>‹ Prev</button>
              <button type="button" id="customer-picker-next" className="join-item btn btn-sm" disabled={data.page >= data.totalPages} onClick={() => load(q, data.page + 1)}>Next ›</button>
              <button type="button" id="customer-picker-last" className="join-item btn btn-sm" disabled={data.page >= data.totalPages} onClick={() => load(q, data.totalPages)}>Last »</button>
            </div>
          </div>
          <div className="modal-action">
            <button type="button" id="customer-picker-close" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
          </div>
        </div>
        {/* Click-outside-to-close. daisyUI's backdrop is normally <form method="dialog">, but this
            component renders INSIDE the invoice <form> (new/edit page), and a nested form is invalid
            HTML — React's DOM building tolerates it, the Grails twin's HTML parser does not, so the
            two stacks would silently diverge. Kept as a plain button here to match the GSP exactly.
            type="button" is required, or the backdrop would submit the invoice form. */}
        <button type="button" className="modal-backdrop"
                onClick={() => dlg.current?.close()}>close</button>
      </dialog>
    </>
  );
}
