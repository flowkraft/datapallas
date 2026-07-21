"use client";

import { useEffect, useState } from "react";
// From lib/flash-cookie, NOT lib/flash: the latter imports next/headers, and importing a VALUE from
// it here would pull that into the client bundle and fail the build.
import { FLASH_COOKIE, type FlashKind } from "@/lib/flash-cookie";

/**
 * The 1:1 mirror of the flash toast in the Grails layouts (portal.gsp / admin.gsp): same
 * id="flashToast", same bottom-right position, same alert-error / alert-success, same ✕, same 3s
 * auto-dismiss.
 *
 * It also clears the flash cookie on mount, because a server component cannot (see lib/flash.ts).
 * That is what makes the message one-shot, the way Grails' flash scope is.
 */
export function FlashToast({ kind, text }: { kind: FlashKind; text: string }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div
      id="flashToast"
      style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 1090, maxWidth: "24rem" }}
      className={`alert ${kind === "error" ? "alert-error" : "alert-success"} shadow-lg`}
    >
      <span>{text}</span>
      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShow(false)}>✕</button>
    </div>
  );
}
