"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ShareLink,
  absoluteShareUrl,
  createShareLink,
  listShareLinks,
  revokeShareLink,
} from "@/lib/explore-data/share-api";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  /** The published report code. Sharing is only possible once a dashboard has been published. */
  reportId: string;
}

/**
 * Manage the links that let people without an account open this dashboard.
 *
 * The Share button opens this dialog; it does NOT create a link. Pressing Share repeatedly would
 * otherwise mint a pile of tokens nobody is tracking. Creating is a deliberate action inside, and
 * every existing link is listed so it can be revoked — which is the only protection a long-lived
 * link has.
 *
 * A newly created URL is shown once. The server stores just a hash, so it genuinely cannot be
 * displayed again later; the answer to a lost link is to create a new one and revoke the old.
 */
export function ShareDialog({ open, onClose, reportId }: ShareDialogProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [expiry, setExpiry] = useState<"never" | "7" | "30" | "90">("never");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    setError("");
    try {
      setLinks(await listShareLinks(reportId));
    } catch {
      setError("Could not load the existing links. You may not have permission to manage sharing.");
    }
  }, [reportId]);

  useEffect(() => {
    if (open && reportId) {
      setNewUrl("");
      setCopied(false);
      void reload();
    }
  }, [open, reportId, reload]);

  if (!open) return null;

  const handleCreate = async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await createShareLink(reportId, expiry === "never" ? undefined : Number(expiry));
      setNewUrl(absoluteShareUrl(url));
      setCopied(false);
      await reload();
    } catch {
      setError("Could not create the link.");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: number) => {
    setBusy(true);
    setError("");
    try {
      await revokeShareLink(id);
      await reload();
    } catch {
      setError("Could not revoke the link.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(newUrl);
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        id="shareDialog"
        className="w-full max-w-2xl rounded-xl bg-base-100 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-medium">Share dashboard</h2>
        <p className="mb-4 text-sm text-base-content/60">
          Anyone with a link can open this dashboard without signing in. Links stay valid until you
          revoke them.
        </p>

        {error && (
          <div id="shareError" role="alert" className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}

        {newUrl && (
          <div className="mb-4 rounded-lg border border-success/40 bg-success/10 p-3">
            <p className="mb-2 text-sm font-medium">
              Copy this link now — it is not shown again.
            </p>
            <div className="flex gap-2">
              <input
                id="shareNewUrl"
                readOnly
                value={newUrl}
                className="input input-bordered input-sm w-full font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button id="btnCopyShareUrl" className="btn btn-sm btn-primary" onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 flex items-end gap-2">
          <label className="form-control">
            <div className="label">
              <span className="label-text text-xs">Expires</span>
            </div>
            <select
              id="shareExpiry"
              className="select select-bordered select-sm"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as typeof expiry)}
            >
              <option value="never">Never</option>
              <option value="7">In 7 days</option>
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
            </select>
          </label>
          <button
            id="btnCreateShareLink"
            className="btn btn-sm btn-primary"
            disabled={busy}
            onClick={handleCreate}
          >
            Create link
          </button>
        </div>

        <table id="tableShareLinks" className="table table-sm w-full">
          <thead>
            <tr>
              <th>Created</th>
              <th>Expires</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link.id} id={`shareLink-${link.id}`}>
                <td className="text-xs">{link.createdAt}</td>
                <td className="text-xs">{link.expiresAt ?? "Never"}</td>
                <td className="text-right">
                  <button
                    id={`btnRevokeShareLink-${link.id}`}
                    className="btn btn-ghost btn-xs text-error"
                    disabled={busy}
                    onClick={() => handleRevoke(link.id)}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {links.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-xs opacity-60">
                  Not shared with anyone yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-5 flex justify-end">
          <button id="btnShareClose" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
