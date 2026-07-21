import { redirect } from "next/navigation";

/**
 * The site root — the customer portal, mirroring the Grails twin's `"/"(controller: 'portalHome')`.
 *
 * It has to be declared here because the blueprint served `/` from app/(main)/page.tsx (the
 * analytics playground home), and app-seed strips the whole (main) group. That left the portal with
 * NO route for `/` at all: the root 404'd, and the customer notification the Burst sends says
 * "sign in to your account" pointing at exactly that URL — so every emailed sign-in link landed on a
 * 404 while the Grails twin opened the portal.
 *
 * A redirect rather than a copy of the portal home: one page owns that markup, and /portal is where
 * the nav, the invoice list and the middleware's session gate already live. An unauthenticated
 * visitor therefore lands on /login exactly as they do on Grails, because /portal is gated.
 */
export default function Root() {
  redirect("/portal");
}
