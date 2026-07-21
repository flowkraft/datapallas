"use client";

import { useEffect, useState } from "react";
import Prism from "prismjs";
import "@/lib/chat/prism-setup";
import { krokiUrl } from "@/lib/chat/kroki";
import { useDebouncedValue } from "@/lib/chat/useDebouncedValue";

/** PlantUML diagram with Kroki.io rendering and error fallback.
 *  Uses fetch() to detect HTTP errors reliably — Kroki returns 400 for syntax
 *  errors but as a renderable SVG, so <img onError> never fires. On failure it
 *  shows the (Prism-highlighted) source instead of a broken image.
 *
 *  Streaming-safe: while a reply streams, the fenced source grows token by token —
 *  the debounce fetches Kroki at most ~2×/s, a success clears any earlier partial-
 *  source failure, and the last good SVG stays up while a newer source renders. */
export function PlantUmlDiagram({ source }: { source: string }) {
  const settled = useDebouncedValue(source, 450);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(krokiUrl("plantuml", settled))
      .then((res) => {
        if (!res.ok) throw new Error(`Kroki returned ${res.status}`);
        return res.text();
      })
      .then((svg) => {
        if (!cancelled) {
          setSvgHtml(svg);
          setFailed(false); // a partial-source failure must not latch past a later success
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [settled]);

  // Keep showing the last good SVG while a newer source is being fetched.
  if (svgHtml) {
    return <div dangerouslySetInnerHTML={{ __html: svgHtml }} className="max-w-full [&>svg]:max-w-full" />;
  }

  if (failed) {
    const highlighted = Prism.languages.plantuml
      ? Prism.highlight(source, Prism.languages.plantuml, "plantuml")
      : source;
    return (
      <div>
        <div className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning mb-2">
          Kroki.io failed to render this diagram — showing source code
        </div>
        <pre className="overflow-x-auto rounded-lg text-xs bg-code-bg text-code-fg p-4" style={{ margin: 0 }}>
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    );
  }

  return <div className="text-sm text-base-content/60 p-4">Rendering diagram...</div>;
}
