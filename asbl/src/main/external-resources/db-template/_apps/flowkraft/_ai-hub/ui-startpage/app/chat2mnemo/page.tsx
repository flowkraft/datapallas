"use client";

/**
 * Chat2Mnemo — inline chat with Mnemosyne, the standalone Data Learning Tutor.
 *
 * Same look and feel as /chat2db (AI Elements Conversation / Message / PromptInput),
 * but there is NO database connection by design: Mnemosyne teaches data by doing —
 * her practice loop is the hands-on koans (you write the SQL), not a chat that writes
 * queries for you. She streams straight from her Letta agent via the OpenAI-compatible
 * adapter (/api/openai/mnemosyne/...) — the same endpoint the Matrix bot uses.
 *
 * Letta is stateful per agent, so each turn sends ONLY the new user message; Mnemosyne
 * keeps the rest of the thread (and remembers you across sessions).
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import pako from "pako";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-groovy";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-java";
import "prismjs/components/prism-sql";
import "@/lib/prism-plantuml";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { MnemosyneAvatar, MnemosyneFull } from "@/components/shared/MnemosyneAvatar";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "queued" | "streaming" | "stopped" | "done" | "error";
  error?: string;
}

/** The AI Crew (and Mnemosyne) were never provisioned — show an actionable CTA. */
function isNoAgentsError(raw?: string): boolean {
  const s = (raw || "").toUpperCase();
  return s.includes("AGENTS_NOT_PROVISIONED") || s.includes("NO AI AGENTS ARE PROVISIONED");
}

/** Encode diagram source for Kroki.io SVG rendering (deflate + url-safe base64). */
function krokiUrl(type: "plantuml", source: string): string {
  const bytes = new TextEncoder().encode(source);
  const deflated = pako.deflate(bytes);
  const base64 = btoa(Array.from(deflated).map((b) => String.fromCharCode(b)).join(""));
  const urlSafe = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `https://kroki.io/${type}/svg/${urlSafe}`;
}

/** Inject a postMessage resize script so the sandboxed iframe auto-sizes to its content. */
function withAutoResize(html: string): string {
  const resizeScript = `<script>
    function notifyHeight() {
      window.parent.postMessage({ type: 'iframe-resize', height: document.body.scrollHeight }, '*');
    }
    window.addEventListener('load', function() { setTimeout(notifyHeight, 300); });
    new MutationObserver(notifyHeight).observe(document.body, { childList: true, subtree: true });
  </script>`;
  return html.includes("</body>") ? html.replace("</body>", resizeScript + "</body>") : html + resizeScript;
}

/** Open HTML content full-screen in a new browser tab. */
function openHtmlInBrowser(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Render a self-contained ```html block (Mermaid, Chart.js, D3, mockups…) in a SANDBOXED,
 * auto-resizing iframe. `sandbox="allow-scripts"` (deliberately no allow-same-origin) lets the
 * CDN JS run but blocks the frame from touching the parent page / cookies. Runs entirely
 * client-side — no backend needed (unlike ```python charts). This is also how Mermaid renders:
 * a self-contained ```html page loads the Mermaid CDN, NOT a bare ```mermaid block.
 */
function HtmlIframe({ content }: { content: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "iframe-resize" && iframeRef.current && e.source === iframeRef.current.contentWindow) {
        iframeRef.current.style.height = `${e.data.height}px`;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div className="my-2 overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between border-b bg-base-200/50 px-3 py-1.5 text-xs text-base-content/60">
        <span>Diagram / HTML</span>
        <button
          onClick={() => openHtmlInBrowser(content)}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-base-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg> Full screen
        </button>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={withAutoResize(content)}
        sandbox="allow-scripts"
        className="w-full border-0 bg-white"
        style={{ minHeight: "200px" }}
      />
    </div>
  );
}

/**
 * PlantUML diagram (Kroki-rendered) wrapped in the same chrome as HtmlIframe, with a
 * **View Full Screen** link that opens the standalone SVG in a new tab — parity with /chat2db, so
 * an ER diagram she draws while teaching modeling gets the same zoom-out affordance Athena's do.
 */
function PlantUmlBlock({ source }: { source: string }) {
  return (
    <div className="my-2 overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between border-b bg-base-200/50 px-3 py-1.5 text-xs text-base-content/60">
        <span>PlantUML Diagram</span>
        <button
          onClick={() => window.open(krokiUrl("plantuml", source), "_blank")}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-base-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg> View Full Screen
        </button>
      </div>
      <div className="flex justify-center bg-white p-4">
        <img src={krokiUrl("plantuml", source)} alt="PlantUML diagram" loading="lazy" className="max-w-full" />
      </div>
    </div>
  );
}

/**
 * Code renderer for ReactMarkdown (react-markdown v10 — block-vs-inline via the language-
 * className, not the removed `inline` prop):
 *   - ```plantuml → rendered as a Kroki SVG diagram inline (ERDs when she teaches modeling)
 *   - a recognized language → Prism syntax highlighting
 *   - any other fenced block → plain dark code block
 *   - inline code → styled inline
 */
function MarkdownCode({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  if (lang === "plantuml") {
    return <PlantUmlBlock source={code} />;
  }

  // Self-contained ```html page (Mermaid / Chart.js / D3 / mockups) → sandboxed iframe.
  if (lang === "html") {
    return <HtmlIframe content={code} />;
  }

  // Ad-hoc ```svg → render INLINE as an image (not code) inside the sandboxed iframe, so SMIL/CSS/JS
  // animations play and any script is contained. Lets a tutor sketch or animate a concept on the fly.
  if (lang === "svg") {
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:8px;display:flex;justify-content:center;background:#fff}svg{max-width:100%;height:auto}</style></head><body>${code}</body></html>`;
    return <HtmlIframe content={doc} />;
  }

  if (lang && Prism.languages[lang]) {
    const highlighted = Prism.highlight(code, Prism.languages[lang], lang);
    return (
      <pre className="my-2 overflow-x-auto rounded-lg bg-code-bg text-code-fg p-4 text-xs" style={{ margin: 0 }}>
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    );
  }

  if (className?.startsWith("language-")) {
    return (
      <pre className="my-2 overflow-x-auto rounded-lg bg-code-bg text-code-fg p-4 text-xs" style={{ margin: 0 }}>
        <code>{code}</code>
      </pre>
    );
  }

  return <code className="rounded bg-base-200 px-1.5 py-0.5 text-xs" {...props}>{children}</code>;
}

/** Markdown renderer — links open in a new tab; code via Prism/PlantUML; `pre` passthrough (no double-wrap). */
const markdownComponents = {
  a: (props: any) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary underline" />,
  code: MarkdownCode,
  pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => <>{children}</>,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Chat2MnemoPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const msgIdCounter = useRef(0);
  const nextId = () => `msg-${++msgIdCounter.current}`;

  // Client-side FIFO queue + one in-flight turn. Mnemosyne is a single stateful Letta agent, so
  // turns serialize; the input stays enabled so a follow-up can be typed and queued anytime, and the
  // in-flight turn can be cancelled without dropping the ones already queued behind it.
  const queueRef = useRef<{ assistantId: string; question: string }[]>([]);
  const activeAbortRef = useRef<AbortController | null>(null);
  const pumpingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Stream one turn from Mnemosyne's Letta agent (OpenAI-compatible SSE).
  const streamOne = useCallback(async (assistantId: string, question: string, signal: AbortSignal) => {
    let acc = "";
    const patch = (m: Partial<ChatMessage>) =>
      setMessages((prev) => prev.map((x) => (x.id === assistantId ? { ...x, ...m } : x)));
    try {
      const res = await fetch("/api/openai/mnemosyne/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the new message — Letta is stateful and keeps the rest of the thread.
        body: JSON.stringify({ messages: [{ role: "user", content: question }], stream: true }),
        signal,
      });

      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          msg = j?.error?.code || j?.error?.message || msg;
        } catch { /* keep default */ }
        patch({ status: "error", error: msg });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.error) {
              patch({ status: "error", error: ev.error.message || ev.error.code || "stream error", content: acc });
              return;
            }
            const delta = ev?.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              patch({ content: acc });
            }
          } catch { /* ignore partial JSON across chunk boundaries */ }
        }
      }
      patch({ content: acc, status: acc.trim() ? "done" : "error", error: acc.trim() ? undefined : "Mnemosyne returned an empty reply." });
    } catch (e: any) {
      // Abort (Cancel) → keep whatever streamed so far and tag the turn "stopped".
      if (signal.aborted || e?.name === "AbortError") {
        patch({ status: "stopped", content: acc });
      } else {
        patch({ status: "error", error: e?.message || "Connection error", content: acc });
      }
    }
  }, []);

  // Drain the queue one turn at a time (Mnemosyne serializes). Re-entrant-safe: a second call while
  // pumping just lets the running loop pick up the newly-queued item.
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        const abort = new AbortController();
        activeAbortRef.current = abort;
        setBusy(true);
        setMessages((prev) => prev.map((m) => (m.id === next.assistantId ? { ...m, status: "streaming" } : m)));
        await streamOne(next.assistantId, next.question, abort.signal);
        activeAbortRef.current = null;
        setBusy(false);
      }
    } finally {
      pumpingRef.current = false;
    }
  }, [streamOne]);

  // Cancel the in-flight turn. Anything already queued behind it keeps going (it was asked on purpose).
  const handleStop = useCallback(() => {
    activeAbortRef.current?.abort();
  }, []);

  const handleSubmit = useCallback(
    (message: { text: string }) => {
      const q = message.text.trim();
      if (!q) return; // NOTE: no busy-guard — queueing a follow-up while she's thinking is the point.
      const userId = nextId();
      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: q },
        { id: assistantId, role: "assistant", content: "", status: "queued" },
      ]);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      queueRef.current.push({ assistantId, question: q });
      pump();
      inputRef.current?.focus();
    },
    [pump],
  );

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b bg-base-100 px-4 py-2">
        <div className="flex items-center gap-2">
          <MnemosyneAvatar size={28} />
          <span className="font-semibold text-base-content">Chat with Mnemosyne</span>
          <span className="hidden text-xs text-base-content/60 sm:inline">
            — your Data Learning Tutor. Learn by doing, then run the koans.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            id="btn-chat-mnemosyne-element"
            href="http://localhost:8441/#/room/%23mnemosyne:localhost"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-base-content/60 underline hover:text-base-content"
          >
            Chat in Element (Matrix)
          </a>
          {messages.length > 0 && (
            showClearConfirm ? (
              <div className="flex items-center gap-1">
                <Button id="btn-chat-clear-yes" size="sm" variant="destructive" onClick={() => { setMessages([]); setShowClearConfirm(false); }}>
                  Clear
                </Button>
                <Button id="btn-chat-clear-cancel" size="sm" variant="outline" onClick={() => setShowClearConfirm(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button id="btn-chat-clear" size="sm" variant="ghost" onClick={() => setShowClearConfirm(true)}>
                Clear
              </Button>
            )
          )}
        </div>
      </div>

      {/* Conversation */}
      <Conversation id="chat-conversation" className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MnemosyneFull height={160} />}
              title="Chat with Mnemosyne"
              description="Learn data by doing it — not by watching. I'm your DataZeus tutor: ask me to walk you through a lesson, review a query you wrote, or explain a concept — then practice with the hands-on koans until it sticks. SQL first, data modeling next. I don't run your queries for you; you write them, and that's how it becomes yours."
            />
          ) : (
            messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <Message key={msg.id} from="user">
                    <MessageContent className="ml-auto">
                      <div className="rounded-2xl bg-chat-user-bg px-4 py-2.5 text-sm text-chat-user-fg">
                        {msg.content}
                      </div>
                    </MessageContent>
                  </Message>
                );
              }

              const isLastAssistant = messages[messages.length - 1]?.id === msg.id;
              return (
                <Message key={msg.id} from="assistant" id={isLastAssistant ? "chat-assistant-last" : undefined}>
                  <MessageAvatar className="h-9 w-9"><MnemosyneAvatar size={36} /></MessageAvatar>
                  <MessageContent>
                    <span className="text-xs font-semibold text-primary">Mnemosyne</span>

                    {msg.content && (
                      <MessageResponse className="bg-chat-assistant-bg text-chat-assistant-fg">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
                      </MessageResponse>
                    )}

                    {/* Queued — waiting its turn behind an earlier question */}
                    {msg.status === "queued" && (
                      <div id={isLastAssistant ? "chat-queued-indicator" : undefined} className="flex items-center gap-2 rounded-2xl bg-chat-assistant-bg px-4 py-2.5 text-sm text-base-content/50">
                        <span className="italic">Queued — I&apos;ll get to this next…</span>
                      </div>
                    )}

                    {/* Thinking cue while streaming (before / between tokens) */}
                    {msg.status === "streaming" && (
                      <div id="chat-thinking-indicator" className={`${msg.content ? "mt-1.5 " : ""}flex items-center gap-2 rounded-2xl bg-chat-assistant-bg px-4 py-2.5 text-sm text-base-content/70`}>
                        <span className="animate-pulse font-medium">Thinking</span>
                        <span className="flex gap-0.5">
                          <span className="animate-bounce [animation-delay:0ms]">.</span>
                          <span className="animate-bounce [animation-delay:150ms]">.</span>
                          <span className="animate-bounce [animation-delay:300ms]">.</span>
                        </span>
                      </div>
                    )}

                    {/* Error — actionable CTA when the crew isn't provisioned, else a plain notice */}
                    {msg.status === "error" && (
                      isNoAgentsError(msg.error) ? (
                        <div id="chat-error-response" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                          <div className="text-base font-semibold">Mnemosyne isn&apos;t provisioned yet</div>
                          <div className="mt-1 text-amber-800">
                            To start learning, provision the DataPallas agents. If you haven&apos;t added your LLM API key
                            yet, open <span className="font-medium">Settings</span> (the gear, top-right) → <span className="font-medium">API Provider</span> first.
                          </div>
                          <a
                            href="/agents"
                            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
                          >
                            Provision Agents
                          </a>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {msg.error || "Something went wrong."}
                        </div>
                      )
                    )}

                    {/* Cancelled by the user — show whatever streamed, tagged as stopped */}
                    {msg.status === "stopped" && (
                      <div className={`${msg.content ? "mt-1 " : ""}text-xs italic text-base-content/50`}>Stopped.</div>
                    )}

                    {/* Copy button — appears once the reply is complete (or was stopped with partial
                        content), copies the raw markdown so scripts she writes lift straight out */}
                    {(msg.status === "done" || msg.status === "stopped") && msg.content && (
                      <div className="flex justify-end">
                        <button
                          id={isLastAssistant ? "btn-chat-copy-answer" : undefined}
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-200"
                          title="Copy Mnemosyne's response"
                        >
                          {copiedId === msg.id ? (
                            <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg> Copied</>
                          ) : (
                            <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg> Copy</>
                          )}
                        </button>
                      </div>
                    )}
                  </MessageContent>
                </Message>
              );
            })
          )}
        </ConversationContent>
      </Conversation>

      {/* Input bar — stays enabled while she's thinking so you can queue a follow-up. The button is
          Cancel (stop the in-flight turn) when she's busy and the box is empty, and Send (queue it)
          the moment you type something. */}
      <div className="border-t bg-base-100 px-4 py-3">
        <PromptInput id="chat-input-form" onSubmit={handleSubmit} className="mx-auto max-w-4xl">
          <PromptInputTextarea
            id="chat-input-textarea"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={busy ? "Queue another message…" : "Ask Mnemosyne to explain a concept, review your SQL, or walk you through a koan…"}
          />
          {busy && !input.trim() ? (
            <button
              id="btn-stop-chat"
              type="button"
              onClick={handleStop}
              aria-label="Cancel current request"
              title="Cancel"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-error text-error-content transition-colors hover:bg-error/90"
            >
              {/* Heroicon: stop (filled square) */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
          ) : (
            <PromptInputSubmit id="btn-submit-chat" status="ready" disabled={!input.trim()} />
          )}
        </PromptInput>
      </div>
    </div>
  );
}
