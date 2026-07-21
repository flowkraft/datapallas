import { cookies } from "next/headers";
import { FLASH_COOKIE, type Flash, type FlashKind } from "./flash-cookie";

/**
 * One-shot flash messages — the mirror of Grails' `flash` scope, which holds a message across
 * exactly one redirect and is then dropped ("Invoice 42 created", "Invoice not found", …).
 *
 * Next has no such scope, so the message rides in a short-lived cookie: setFlash() before the
 * action redirects, readFlash() in the layout that renders the toast.
 *
 * SERVER ONLY — this imports next/headers. The cookie name and types live in ./flash-cookie so the
 * client can share them without dragging next/headers into the browser bundle.
 *
 * The cookie is deliberately NOT httpOnly, and readFlash does NOT clear it. A server component may
 * read cookies but may not modify them — only a Server Action or Route Handler can — so clearing
 * has to happen on the client, and FlashToast does it on mount. Without that the same toast would
 * follow the user onto every later page. Nothing secret goes in here: it is UI text the user was
 * about to be shown anyway.
 */

/** Call from a Server Action, before redirect(). Mirrors `flash.message = …` / `flash.error = …`. */
export async function setFlash(kind: FlashKind, text: string) {
  (await cookies()).set(FLASH_COOKIE, JSON.stringify({ kind, text }), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 30, // Long enough to survive the redirect, short enough to never resurface later.
  });
}

/** Read the pending flash, if any. Clearing is FlashToast's job — see the note above. */
export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const f = JSON.parse(raw);
    return f?.text ? { kind: f.kind === "error" ? "error" : "message", text: String(f.text) } : null;
  } catch {
    return null;
  }
}
