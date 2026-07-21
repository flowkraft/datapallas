"use client";

import { useEffect, useState } from "react";

/** Trailing-debounce a changing value. The first value is emitted immediately;
 *  subsequent changes settle after `delayMs` of quiet. Used so live-streamed
 *  ```plantuml / ```html / ```svg sources (which grow token by token) re-render
 *  their diagram — a Kroki fetch or a sandboxed-iframe reload — at most ~2×/s
 *  instead of once per delta. Completed content is unaffected (it never changes). */
export function useDebouncedValue<T>(value: T, delayMs = 450): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
