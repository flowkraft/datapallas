"use client";

/**
 * AgentPromptsPanel — a reusable "<Agent>'s Prompts" button + right-side slide-in panel.
 *
 * Rendered top-right of every ChatAgentPage. Clicking the button slides a full-height panel in
 * from the right (and back out to the right) listing the agent's ready-to-use AI Copilot prompts
 * as a one-open-at-a-time accordion. Each open item shows the prompt's description, category, tag
 * chips and full text (with `[UPPER]` placeholder tokens highlighted), plus a working Copy button.
 *
 * Data comes from the DataPallas Java REST API that already backs the AI Copilot — there is no
 * server-side by-category/by-tag filter, so we fetch the full metadata list once
 * (GET /system/ai-prompts), filter client-side, and lazy-load each prompt's text on expand
 * (GET /system/ai-prompts/{id}). Same RB_BASE the rest of the app uses.
 *
 * Every automatable element carries a stable semantic #id (chat-area kebab convention), so a
 * screens/e2e spec can open the panel, expand a prompt, read its text and copy it.
 */

import { useCallback, useEffect, useState } from "react";

// Same-origin proxy — see app/api/dp/[...path]/route.ts.
const RB_BASE = "/api/dp";

/** A prompt belongs to the agent when its category is in `categories` OR any tag is in `tags`. */
export interface AgentPromptsFilter {
  categories?: string[];
  tags?: string[];
}

interface PromptMeta {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
}

/**
 * The default per-agent selection, keyed on the ChatAgentConfig slug:
 *   athena → the "Ask Athena" category + the two custom-schema seed/wipe scripts
 *   anyone else → prompts tagged with the agent's own slug (hermes, apollo, hephaestus, …)
 */
export function defaultAgentPromptsFilter(slug: string): AgentPromptsFilter {
  if (slug === "athena") return { categories: ["Ask Athena"], tags: ["custom-schema"] };
  return { tags: [slug] };
}

function promptMatches(p: PromptMeta, f: AgentPromptsFilter): boolean {
  if (f.categories && p.category && f.categories.includes(p.category)) return true;
  if (f.tags && (p.tags || []).some((t) => f.tags!.includes(t))) return true;
  return false;
}

/** Escape HTML, then highlight `[UPPERCASE …]` placeholder tokens amber — same convention the
 *  Angular AI Copilot uses. Everything else renders verbatim in the monospace box. */
function renderPromptHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(
    /\[[A-Z][^\]]*\]/g,
    (m) => `<span style="background:rgba(251,191,36,0.22);color:#fbbf24;border-radius:3px;padding:0 2px">${m}</span>`,
  );
}

export interface AgentPromptsPanelProps {
  /** Agent display name — drives the default button label and the empty state. */
  agentName: string;
  /** Which prompts belong to this agent (see defaultAgentPromptsFilter). */
  filter: AgentPromptsFilter;
  /** Button label. Default: `${agentName}'s Prompts`. */
  buttonLabel?: string;
}

export function AgentPromptsPanel({ agentName, filter, buttonLabel }: AgentPromptsPanelProps) {
  const label = buttonLabel ?? `${agentName}'s Prompts`;

  const [open, setOpen] = useState(false);
  const [prompts, setPrompts] = useState<PromptMeta[] | null>(null); // null = not loaded yet
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [textById, setTextById] = useState<Record<string, string>>({}); // id → promptText (undefined = loading)
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Load + filter the prompt list the first time the panel is opened.
  useEffect(() => {
    if (!open || prompts !== null) return;
    let alive = true;
    fetch(`${RB_BASE}/system/ai-prompts`)
      .then((r) => { if (!r.ok) throw new Error("Could not load prompts"); return r.json(); })
      .then((all: PromptMeta[]) => {
        if (!alive) return;
        const mine = (all || []).filter((p) => promptMatches(p, filter));
        setPrompts(mine);
        if (mine.length) setExpandedId(mine[0].id); // first item open by default
      })
      .catch((e) => { if (alive) { setError(e?.message || "Could not load prompts"); setPrompts([]); } });
    return () => { alive = false; };
  }, [open, prompts, filter]);

  // Lazy-load the full prompt text whenever an item is expanded (cached, one request per prompt).
  useEffect(() => {
    if (!expandedId || textById[expandedId] !== undefined) return;
    let alive = true;
    fetch(`${RB_BASE}/system/ai-prompts/${encodeURIComponent(expandedId)}`)
      .then((r) => { if (!r.ok) throw new Error("Could not load prompt"); return r.json(); })
      .then((full: { promptText?: string }) => {
        if (alive) setTextById((prev) => ({ ...prev, [expandedId]: full.promptText ?? "" }));
      })
      .catch(() => { if (alive) setTextById((prev) => ({ ...prev, [expandedId]: "" })); });
    return () => { alive = false; };
  }, [expandedId, textById]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const copy = (id: string) => {
    const t = textById[id];
    if (!t) return;
    navigator.clipboard.writeText(t).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    });
  };

  return (
    <>
      {/* Trigger button (top-right of the chat header) */}
      <button
        id="btn-agent-prompts"
        type="button"
        onClick={() => setOpen(true)}
        title={`Browse ${agentName}'s ready-to-use prompts`}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-base-content/70 transition-colors hover:bg-base-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3.5 w-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
        {label}
      </button>

      {/* Slide-in overlay — always mounted so it animates in AND out. */}
      <div className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        {/* backdrop */}
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={close}
        />
        {/* panel — slides in from / out to the right, full height */}
        <div
          id="agent-prompts-panel"
          role="dialog"
          aria-label={`${agentName}'s prompts`}
          className={`absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-base-100 shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        >
          {/* panel header */}
          <div className="flex flex-shrink-0 items-center gap-2 border-b bg-base-100 px-4 py-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-5 w-5 text-primary">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            <span className="text-sm font-semibold">{label}</span>
            <button
              id="btn-agent-prompts-close"
              type="button"
              onClick={close}
              aria-label="Close"
              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* body — the prompts accordion */}
          <div id="agent-prompts-list" className="flex-1 overflow-y-auto">
            {prompts === null && <div className="p-6 text-sm text-base-content/60">Loading…</div>}

            {prompts !== null && prompts.length === 0 && (
              <div id="agent-prompts-empty" className="p-6 text-sm text-base-content/60">
                {error || `No ready-made prompts for ${agentName} yet.`}
              </div>
            )}

            {prompts !== null && prompts.map((p) => {
              const isOpen = expandedId === p.id;
              const text = textById[p.id];
              return (
                <div id={`agent-prompt-${p.id}`} key={p.id} className="border-b">
                  {/* accordion header — click opens this one, closes the rest */}
                  <button
                    id={`btn-agent-prompt-${p.id}`}
                    type="button"
                    onClick={() => setExpandedId(p.id)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-base-200/50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
                      className={`h-4 w-4 shrink-0 text-base-content/50 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                    <span className="text-sm font-semibold text-primary">{p.title}</span>
                  </button>

                  {/* accordion body — the screenshot's info + Copy */}
                  {isOpen && (
                    <div id={`agent-prompt-body-${p.id}`} className="space-y-3 px-4 pb-4">
                      <p className="text-sm text-base-content/80">
                        <span className="font-semibold">Description:</span> {p.description}
                      </p>
                      <p className="text-sm text-base-content/80">
                        <span className="font-semibold">Category:</span> {p.category}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="font-semibold text-base-content/80">Tags:</span>
                        {(p.tags || []).map((t) => (
                          <span key={t} className="rounded border px-2 py-0.5 text-xs text-base-content/70">{t}</span>
                        ))}
                      </div>

                      <div className="rounded-lg border bg-code-bg">
                        <pre
                          id={`agent-prompt-text-${p.id}`}
                          className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-3 text-xs leading-relaxed text-code-fg"
                          style={{ margin: 0 }}
                        >
                          {text === undefined ? (
                            <span className="text-base-content/50">Loading…</span>
                          ) : (
                            <code dangerouslySetInnerHTML={{ __html: renderPromptHtml(text) }} />
                          )}
                        </pre>
                      </div>

                      <div className="flex justify-end">
                        <button
                          id={`btn-copy-agent-prompt-${p.id}`}
                          type="button"
                          disabled={!text}
                          onClick={() => copy(p.id)}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-base-content/70 transition-colors hover:bg-base-200 disabled:opacity-50"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3.5 w-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                          </svg>
                          {copiedId === p.id ? "Copied!" : "Copy Prompt Text"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
