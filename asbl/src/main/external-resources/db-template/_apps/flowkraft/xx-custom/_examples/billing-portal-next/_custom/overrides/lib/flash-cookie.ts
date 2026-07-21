/**
 * The flash cookie's name and shape — and NOTHING that touches next/headers.
 *
 * This file exists so the client can share these with the server. lib/flash.ts imports
 * next/headers, which is server-only; FlashToast is a client component and needs the cookie name to
 * clear it. Importing the name from lib/flash.ts pulls that whole module — and next/headers with it
 * — into the client bundle, and the build fails outright. A value import is enough to do it; only
 * `import type` is erased.
 *
 * So: anything both sides need lives here. Server-only helpers stay in lib/flash.ts.
 */
export const FLASH_COOKIE = "bp_flash";

export type FlashKind = "message" | "error";

export interface Flash {
  kind: FlashKind;
  text: string;
}
