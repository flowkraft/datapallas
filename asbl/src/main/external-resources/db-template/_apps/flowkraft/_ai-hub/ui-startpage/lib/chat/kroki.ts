import pako from "pako";

/** Encode diagram source for Kroki.io SVG rendering (deflate + url-safe base64). */
export function krokiUrl(type: "plantuml", source: string): string {
  const bytes = new TextEncoder().encode(source);
  const deflated = pako.deflate(bytes);
  const base64 = btoa(Array.from(deflated).map((b) => String.fromCharCode(b)).join(""));
  const urlSafe = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `https://kroki.io/${type}/svg/${urlSafe}`;
}

/** Open HTML content in a new browser tab (full-screen preview). */
export function openHtmlInBrowser(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Open a base64-encoded PNG (e.g. an executed Python chart) full-size in a new browser
 *  tab. Goes via a Blob rather than a `data:` URL — some browsers block `window.open` on
 *  `data:` URLs, and a large chart would make an unwieldy URL. */
export function openImageInBrowser(base64Png: string) {
  const byteChars = atob(base64Png);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Inject a postMessage resize script so a sandboxed iframe auto-sizes to its content. */
export function withAutoResize(html: string): string {
  const resizeScript = `<script>
    function notifyHeight() {
      window.parent.postMessage({ type: 'iframe-resize', height: document.body.scrollHeight }, '*');
    }
    window.addEventListener('load', function() { setTimeout(notifyHeight, 300); });
    new MutationObserver(notifyHeight).observe(document.body, { childList: true, subtree: true });
  </script>`;
  if (html.includes("</body>")) {
    return html.replace("</body>", resizeScript + "</body>");
  }
  return html + resizeScript;
}
