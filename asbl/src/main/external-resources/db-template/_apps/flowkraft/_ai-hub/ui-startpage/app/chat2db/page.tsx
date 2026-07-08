"use client";

/**
 * Chat2DB — Natural Language to SQL chat interface.
 *
 * Preserves the Jupyter-based flow:
 * 1. Pick a database from the dropdown (auto-discovered connections)
 * 2. Click Connect
 * 3. Toggle "Send Tables" checkbox
 * 4. Ask questions in plain English
 *
 * Uses AI Elements (Conversation, Message, PromptInput) for the chat UI
 * and proxies requests to the FastAPI backend via Next.js API routes.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
// lucide-react removed — icons replaced with inline heroicons below
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

/** Highlight SQL with inline styles — no CSS dependency. */
function highlightSQL(sql: string): string {
  const keywords = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ON|AND|OR|NOT|IN|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|DISTINCT|COUNT|SUM|AVG|MIN|MAX|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INTO|VALUES|SET|UNION|ALL|BETWEEN|LIKE|IS|NULL|CASE|WHEN|THEN|ELSE|END|EXISTS|DESC|ASC|WITH|RECURSIVE)\b/gi;
  const strings = /('[^']*')/g;
  const numbers = /\b(\d+(?:\.\d+)?)\b/g;

  let result = sql
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(strings, '<span style="color:#7ec699">$1</span>')
    .replace(keywords, (m) => `<span style="color:#cc99cd">${m}</span>`)
    .replace(numbers, '<span style="color:#f08d49">$1</span>');
  return result;
}

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
import { AthenaAvatar, AthenaFull } from "@/components/shared/AthenaAvatar";
import { fetchConnections } from "@/lib/explore-data/rb-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DbConnection {
  code: string;
  name: string;
  db_type: string;
  is_default: boolean;
  /** Full `dbserver` block from the Java API — forwarded to the backend on connect. */
  dbserver?: Record<string, any>;
}

interface Chat2DBResponse {
  question?: string;
  sql?: string | null;
  data?: Record<string, any>[];
  row_count?: number;
  execution_time_ms?: number;
  explanation?: string | null;
  viz_image?: string | null;
  text_response?: string | null;
  plantuml_code?: string | null;
  html_content?: string | null;
  content_segments?: { type: string; content: string }[];
  error?: string | null;
  raw_content?: string | null;
}

/** Encode diagram source for Kroki.io SVG rendering. */
function krokiUrl(type: "plantuml", source: string): string {
  const bytes = new TextEncoder().encode(source);
  const deflated = pako.deflate(bytes);
  const base64 = btoa(Array.from(deflated).map((b) => String.fromCharCode(b)).join(""));
  const urlSafe = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `https://kroki.io/${type}/svg/${urlSafe}`;
}

/** Open HTML content in a new browser tab (full-screen preview). */
function openHtmlInBrowser(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Inject a postMessage resize script into HTML content for iframe auto-sizing. */
function withAutoResize(html: string): string {
  const resizeScript = `<script>
    function notifyHeight() {
      window.parent.postMessage({ type: 'iframe-resize', height: document.body.scrollHeight }, '*');
    }
    window.addEventListener('load', function() { setTimeout(notifyHeight, 300); });
    new MutationObserver(notifyHeight).observe(document.body, { childList: true, subtree: true });
  </script>`;
  if (html.includes('</body>')) {
    return html.replace('</body>', resizeScript + '</body>');
  }
  return html + resizeScript;
}

/** Auto-resizing iframe for HTML content (mockups, Mermaid diagrams, etc.). */
function HtmlIframe({ content, label, onFullScreen }: { content: string; label: string; onFullScreen: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'iframe-resize' && iframeRef.current && e.source === iframeRef.current.contentWindow) {
        iframeRef.current.style.height = `${e.data.height}px`;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex justify-between items-center px-3 py-1.5 text-xs text-base-content/60 border-b bg-base-200/50">
        <span>{label}</span>
        <button
          onClick={onFullScreen}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-base-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg> View Full Screen
        </button>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={withAutoResize(content)}
        sandbox="allow-scripts"
        className="w-full border-0"
        style={{ minHeight: "200px" }}
      />
    </div>
  );
}

/** PlantUML diagram with Kroki.io rendering and error fallback.
 *  Uses fetch() to detect HTTP errors reliably — Kroki returns 400 for syntax
 *  errors but as a renderable SVG, so <img onError> never fires. */
function PlantUMLDiagram({ source }: { source: string }) {
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(krokiUrl("plantuml", source))
      .then((res) => {
        if (!res.ok) throw new Error(`Kroki returned ${res.status}`);
        return res.text();
      })
      .then((svg) => {
        if (!cancelled) setSvgHtml(svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [source]);

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

  if (!svgHtml) {
    return <div className="text-sm text-base-content/60 p-4">Rendering diagram...</div>;
  }

  return <div dangerouslySetInnerHTML={{ __html: svgHtml }} className="max-w-full [&>svg]:max-w-full" />;
}

/** Prism-highlighted code component for ReactMarkdown. */
function MarkdownCode({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  if (lang && Prism.languages[lang]) {
    const highlighted = Prism.highlight(code, Prism.languages[lang], lang);
    return (
      <pre className="overflow-x-auto rounded-lg text-xs my-2 bg-code-bg text-code-fg p-4" style={{ margin: 0 }}>
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    );
  }

  // Fenced block without recognized language — dark code block, no highlighting
  if (className?.startsWith("language-")) {
    return (
      <pre className="overflow-x-auto rounded-lg text-xs my-2 bg-code-bg text-code-fg p-4" style={{ margin: 0 }}>
        <code>{code}</code>
      </pre>
    );
  }

  // Inline code
  return <code className="px-1.5 py-0.5 rounded text-xs bg-base-200" {...props}>{children}</code>;
}

/** Shared markdown components for ReactMarkdown — uses Prism for code highlighting. */
const markdownComponents = {
  code: MarkdownCode,
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => <>{children}</>,
};

/** Turn a raw error into a friendly headline by grepping the status / keywords.
 *  Errors come from two very different places: the AI provider (rate limits, auth,
 *  outages) OR the chat2db engine / database (a failed query, a serialization issue).
 *  We classify accordingly and only blame the AI provider when it's actually an AI
 *  provider error. The raw text is still shown under "technical details". */
function friendlyError(raw: string): string {
  const s = (raw || "").toLowerCase();
  // ── Data / query / serialization — the chat2db engine or the database, NOT the AI ──
  if (s.includes("serializable"))
    return "The query ran, but its result couldn't be formatted for display (an unsupported data type). This looks like a DataPallas bug — please report it.";
  if (s.includes("not connected to a database") || s.includes("no database is connected"))
    return "No database is connected. Click Connect at the top, then try again.";
  if (s.includes("syntax error") || s.includes("no such table") || s.includes("no such column") ||
      s.includes("does not exist") || s.includes("sqlexception") || s.includes("jdbc") ||
      s.includes("binder error") || s.includes("catalog error") || s.includes("parser error"))
    return "The query failed against the database — a table/column name or the SQL may be off. Try rephrasing your question.";
  // ── AI-provider transport errors (genuine provider issues) ──
  if (/\b429\b/.test(s) || s.includes("rate limit") || s.includes("rate_limit") || s.includes("too many requests"))
    return "The AI provider is rate-limited (HTTP 429). Please wait a few seconds and try again.";
  if (/\b401\b/.test(s) || s.includes("unauthorized") || s.includes("invalid api key") || s.includes("api key"))
    return "The AI provider rejected the request — check the API key / provider settings.";
  if (/\b402\b/.test(s) || s.includes("insufficient") || s.includes("quota") || s.includes("balance") || s.includes("billing"))
    return "The AI provider reports a quota or billing limit. Check your plan / balance.";
  if (/\b5\d\d\b/.test(s) || s.includes("overloaded") || s.includes("unavailable") || s.includes("connection error") || s.includes("timeout") || s.includes("timed out"))
    return "The AI provider is temporarily unavailable. Please try again in a moment.";
  // ── Neutral fallback — don't blame the AI provider for an unknown error ──
  return "Something went wrong processing your request. Please try again.";
}

/** True when the error is the adapter's "0 agents provisioned" signal — the AI Crew was never
 *  created. Chat2DB turns this into a "Provision Agents" call-to-action linking to /agents,
 *  instead of the generic red error box. */
function isNoAgentsError(raw: string): boolean {
  const s = (raw || "").toUpperCase();
  return s.includes("AGENTS_NOT_PROVISIONED") || s.includes("NO AI AGENTS ARE PROVISIONED");
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  response?: Chat2DBResponse;
  /** Assistant turn lifecycle: queued → streaming → done | stopped | error. */
  status?: "queued" | "streaming" | "done" | "stopped" | "error";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Chat2DBPage() {
  // Connection state
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [connectedCode, setConnectedCode] = useState("");  // actually connected DB
  const [connStatus, setConnStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [connError, setConnError] = useState("");
  const [sendSchema, setSendSchema] = useState(true);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  // A turn is streaming right now (drives the Stop button). The input is NEVER
  // disabled by this — follow-up questions can be typed and queued anytime.
  const [busy, setBusy] = useState(false);

  // Message history (Up/Down arrow)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const savedInput = useRef("");

  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgIdCounter = useRef(0);

  const nextId = () => `msg-${++msgIdCounter.current}`;

  // Client-side FIFO queue + one in-flight turn. Athena is a single stateful
  // Letta agent, so turns are serialized here; the input never blocks.
  const queueRef = useRef<{ assistantId: string; question: string }[]>([]);
  const activeAbortRef = useRef<AbortController | null>(null);
  const pumpingRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Load connections on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Same source as /explore-data: the DataPallas Java REST API. Includes both
    // on-disk connections AND virtual (in-memory) "sample" connections, which
    // never exist as files and so can only come from this API.
    fetchConnections()
      .then((list) => {
        const mapped: DbConnection[] = (list || []).map((c: any) => ({
          code: c.connectionCode,
          name: c.connectionName,
          db_type: c.dbserver?.type || "",
          is_default: !!c.defaultConnection,
          dbserver: c.dbserver,
        }));
        setConnections(mapped);
        const def = mapped.find((c) => c.is_default);
        if (def) setSelectedCode(def.code);
      })
      .catch(() => {});
  }, []);

  // ---------------------------------------------------------------------------
  // Connect
  // ---------------------------------------------------------------------------

  const handleConnect = useCallback(async () => {
    if (!selectedCode) return;
    setConnStatus("connecting");
    setConnError("");

    try {
      const conn = connections.find((c) => c.code === selectedCode);
      const res = await fetch("/api/chat2db/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_code: selectedCode,
          connection_name: conn?.name,
          dbserver: conn?.dbserver,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setConnStatus("error");
        setConnError(data.detail || "Connection failed");
        return;
      }

      setConnStatus("connected");
      setConnectedCode(selectedCode);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "system",
          content: `Connected to ${conn?.name || selectedCode} (${conn?.db_type || ""}). Ask me anything!`,
        },
      ]);
    } catch (e: any) {
      setConnStatus("error");
      setConnError(e.message || "Connection failed");
    }
  }, [selectedCode, connections]);

  // ---------------------------------------------------------------------------
  // Ask
  // ---------------------------------------------------------------------------

  // Stream one queued turn over SSE: append Athena's tokens live, then set the
  // final structured result (SQL / table / chart) when the "done" frame arrives.
  // Abort (Stop) → keep whatever streamed so far and tag the turn "stopped".
  const streamOne = useCallback(
    async (assistantId: string, question: string, signal: AbortSignal) => {
      let acc = "";
      try {
        const res = await fetch("/api/chat2db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, send_schema: sendSchema }),
          signal,
        });

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, status: "error", response: { error: err.detail || err.error || "Request failed" } }
                : m,
            ),
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            if (payload === "[DONE]") continue;
            let ev: any;
            try {
              ev = JSON.parse(payload);
            } catch {
              continue;
            }
            if (ev.type === "delta") {
              acc += ev.text || "";
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)));
            } else if (ev.type === "done") {
              const { type: _t, ...result } = ev;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, status: "done", response: result } : m)),
              );
            } else if (ev.type === "error") {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, status: "error", response: { error: ev.detail || "error" } } : m)),
              );
            }
          }
        }
      } catch (e: any) {
        if (signal.aborted || e?.name === "AbortError") {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: "stopped" } : m)));
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: "error", response: { error: String(e?.message || e) } } : m)),
          );
        }
      }
    },
    [sendSchema],
  );

  // Drain the queue one turn at a time (Athena serializes). Re-entrant-safe: a
  // second call while pumping just lets the running loop pick up the new item.
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

  // Stop the current turn. Queued follow-ups keep going (they were already asked).
  const handleStop = useCallback(() => {
    activeAbortRef.current?.abort();
  }, []);

  const handleSubmit = useCallback(
    (msg: { text: string }) => {
      const question = msg.text.trim();
      // No DB required — questions are allowed with no connection. Those are pure
      // DataPallas product questions (setup, config, troubleshooting, how-to); the
      // backend detects the missing connection and routes them to Athena as such.
      if (!question) return;

      // Add to history
      setHistory((prev) => {
        const next = prev[prev.length - 1] === question ? prev : [...prev, question];
        return next.length > 50 ? next.slice(1) : next;
      });
      setHistoryIdx(-1);

      // Show the user bubble + a queued assistant placeholder immediately.
      const userId = nextId();
      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: question },
        { id: assistantId, role: "assistant", content: "", status: "queued" },
      ]);

      // Clear the box (but keep it enabled) and queue the turn.
      setInput("");
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
      queueRef.current.push({ assistantId, question });
      pump();
      inputRef.current?.focus();
    },
    [pump],
  );

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClear = () => {
    setMessages([]);
    setShowClearConfirm(false);
    if (connStatus === "connected") {
      const conn = connections.find((c) => c.code === selectedCode);
      setMessages([
        {
          id: nextId(),
          role: "system",
          content: `Connected to ${conn?.name || selectedCode}. Ask me anything!`,
        },
      ]);
    }
  };

  // ---------------------------------------------------------------------------
  // Copy to clipboard
  // ---------------------------------------------------------------------------

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  // ---------------------------------------------------------------------------
  // Up/Down arrow history navigation
  // ---------------------------------------------------------------------------

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      if (historyIdx === -1) {
        savedInput.current = input;
        const newIdx = history.length - 1;
        setHistoryIdx(newIdx);
        setInput(history[newIdx]);
      } else if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        setHistoryIdx(newIdx);
        setInput(history[newIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx === -1) return;
      if (historyIdx < history.length - 1) {
        const newIdx = historyIdx + 1;
        setHistoryIdx(newIdx);
        setInput(history[newIdx]);
      } else {
        setHistoryIdx(-1);
        setInput(savedInput.current);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const isConnected = connStatus === "connected" || !!connectedCode;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
      {/* ====== Connection bar (2-line compact layout, stays pinned) ====== */}
      <div className="flex-shrink-0 border-b bg-base-100 px-4 py-2 space-y-1.5">
        {/* Line 1: Brand */}
        <div className="flex items-center gap-2">
          <AthenaAvatar size={32} />
          <span className="text-sm font-semibold text-athena-accent">Chat2DB</span>
          <span className="text-xs text-base-content/60">
            powered by Athena — ask in plain English, get SQL + results + charts. Refine, drill deeper, visualize.
          </span>
        </div>

        {/* Line 2: DB controls + status */}
        <div className="flex items-center gap-2 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-base-content/60 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>

          {/* Dropdown */}
          <select
            id="database-selector"
            value={selectedCode}
            onChange={(e) => {
              setSelectedCode(e.target.value);
              // Reset status when switching — user must press Connect
              if (e.target.value !== connectedCode) {
                setConnStatus("idle");
                setConnError("");
              } else if (connectedCode) {
                setConnStatus("connected");
              }
            }}
            className="h-8 rounded-md border bg-base-100 px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">-- Select a database --</option>
            {connections.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name} ({c.db_type})
              </option>
            ))}
          </select>

          {/* Connect button */}
          <Button
            id="btn-connect-database"
            size="sm"
            onClick={handleConnect}
            disabled={!selectedCode || connStatus === "connecting"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-1 h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
            {connStatus === "connecting" ? "Connecting..." : "Connect"}
          </Button>

          {/* Send Tables checkbox */}
          <label className="flex items-center gap-1.5 text-sm text-base-content/60">
            <input
              id="chat-send-tables"
              type="checkbox"
              checked={sendSchema}
              onChange={(e) => setSendSchema(e.target.checked)}
              className="h-4 w-4 rounded border"
            />
            Send Tables
            <span
              title="Sends table names to Athena as a quick index. Recommended for database queries. Uncheck only for chit-chat or non-database topics."
              className="cursor-help text-base-content/60"
            >
              &#9432;
            </span>
          </label>

          {/* Status — right-aligned, truncated to prevent 3rd line */}
          <div id="connection-status" className="ml-auto flex items-center gap-1.5 text-sm truncate">
            {connStatus === "connected" && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-green-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                <span className="text-green-600 truncate">Connected to {connectedCode}</span>
              </>
            )}
            {connStatus === "connecting" && (
              <span className="text-base-content/60">Connecting...</span>
            )}
            {connStatus === "error" && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-red-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                <span className="text-red-600 truncate">{connError}</span>
              </>
            )}
            {connStatus === "idle" && !connectedCode && (
              <span className="text-base-content/60">No database connected</span>
            )}
            {connStatus === "idle" && connectedCode && (
              <span className="text-base-content/60 truncate">
                Press Connect to switch from {connectedCode}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ====== Chat area ====== */}
      <Conversation id="chat-conversation" className="flex-1">
        {/* Header row with Clear button */}
        {messages.length > 0 && (
          <div className="flex items-center justify-end border-b px-4 py-1.5">
            {showClearConfirm ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-red-500">Clear all messages?</span>
                <Button id="btn-chat-clear-confirm" size="sm" variant="destructive" onClick={handleClear}>
                  Yes, clear
                </Button>
                <Button id="btn-chat-clear-cancel" size="sm" variant="outline" onClick={() => setShowClearConfirm(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button id="btn-chat-clear" size="sm" variant="ghost" onClick={() => setShowClearConfirm(true)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-1 h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                Clear
              </Button>
            )}
          </div>
        )}

        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<AthenaFull height={160} />}
              title="Chat with Athena"
              description="Ask me anything about DataPallas — report generation and bursting, document delivery (email, upload, customer web portals), dashboards, and automation. Connect a database above to explore your data too — I write the SQL, run it locally, explain the results, and only ever see table and column names, never your rows."
            />
          ) : (
            messages.map((msg) => {
              if (msg.role === "system") {
                return (
                  <div key={msg.id} className="text-center text-xs text-base-content/60 py-1">
                    — {msg.content} —
                  </div>
                );
              }

              if (msg.role === "user") {
                // The latest user question carries #chat-user-last so e2e can frame /
                // screenshot the last Q + A pair (scroll #chat-user-last to the top).
                const isLastUser = msg.id === messages.filter((m) => m.role === "user").at(-1)?.id;
                return (
                  <Message key={msg.id} from="user" id={isLastUser ? "chat-user-last" : undefined}>
                    <MessageContent className="ml-auto">
                      <div className="rounded-2xl px-4 py-2.5 text-sm bg-chat-user-bg text-chat-user-fg">
                        {msg.content}
                      </div>
                    </MessageContent>
                  </Message>
                );
              }

              // Assistant message
              const r = msg.response;
              // Only the latest assistant turn carries the stable "last" IDs, so e2e can
              // target the current reply (and its diagram/chart/table) by a unique #id.
              const isLastAssistant = messages[messages.length - 1]?.id === msg.id;
              return (
                <Message key={msg.id} from="assistant" id={isLastAssistant ? "chat-assistant-last" : undefined}>
                  <MessageAvatar className="h-9 w-9"><AthenaAvatar size={36} /></MessageAvatar>
                  <MessageContent>
                    <span className="text-xs font-semibold text-athena-accent">Athena</span>

                    {/* Queued (waiting its turn behind an earlier question) */}
                    {msg.status === "queued" && (
                      <div className="rounded-2xl px-4 py-2 text-xs italic bg-chat-assistant-bg text-base-content/50">
                        Queued…
                      </div>
                    )}

                    {/* Live streaming turn — #chat-thinking-indicator stays present the
                        whole turn, and now ALWAYS shows a clearly-visible "still working"
                        cue (not a dim caret) so the wait signal never disappears during
                        Athena's long silent reasoning / visualization phases. */}
                    {msg.status === "streaming" && (
                      <div id="chat-thinking-indicator">
                        {msg.content && (
                          <MessageResponse className="bg-chat-assistant-bg text-chat-assistant-fg">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
                          </MessageResponse>
                        )}
                        <div className={`${msg.content ? "mt-1.5 " : ""}flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm bg-chat-assistant-bg text-base-content/70`}>
                          <span className="animate-pulse font-medium">
                            {(msg.content?.includes("```") || /diagram|chart|visuali[sz]|\bplot\b|\bgraph\b/i.test(msg.content ?? ""))
                              ? "Crunching the visualization"
                              : "Thinking"}
                          </span>
                          <span className="flex gap-0.5">
                            <span className="animate-bounce [animation-delay:0ms]">.</span>
                            <span className="animate-bounce [animation-delay:150ms]">.</span>
                            <span className="animate-bounce [animation-delay:300ms]">.</span>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Stopped mid-turn — show whatever streamed, tagged */}
                    {msg.status === "stopped" && (
                      <>
                        {msg.content && (
                          <MessageResponse className="bg-chat-assistant-bg text-chat-assistant-fg">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
                          </MessageResponse>
                        )}
                        <div className="text-xs italic text-base-content/50">Stopped</div>
                      </>
                    )}

                    {/* Error */}
                    {r?.error && (
                      isNoAgentsError(r.error) ? (
                        /* The AI Crew was never provisioned → an actionable CTA, not a red error box */
                        <div id="chat-error-response" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                          <div className="text-base font-semibold">Athena&apos;s agents aren&apos;t provisioned yet</div>
                          <div className="mt-1 text-amber-800">
                            To start chatting, provision the DataPallas AI Crew. If you haven&apos;t added your LLM API key
                            yet, open <span className="font-medium">Settings</span> (the gear, top-right) → <span className="font-medium">API Provider</span> first.
                          </div>
                          <a
                            id="btn-provision-agents"
                            href="/agents"
                            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
                          >
                            Provision Agents
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                          </a>
                        </div>
                      ) : (
                      <div id="chat-error-response" className="rounded-2xl px-4 py-3 text-sm bg-red-50 text-red-700">
                        <div className="font-medium">{friendlyError(r.error)}</div>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs opacity-70">Show technical details</summary>
                          <div className="mt-1 text-xs whitespace-pre-wrap break-words">{r.error}</div>
                        </details>
                        <div className="flex justify-end mt-2">
                          <button
                            id={isLastAssistant ? "btn-chat-copy-error" : undefined}
                            onClick={() => copyToClipboard(r.error!, msg.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-100"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                            {copiedId === msg.id ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      </div>
                      )
                    )}

                    {/* Content segments — rendered in Athena's original order */}
                    {r?.content_segments && !r?.error ? (
                      r.content_segments.map((seg: { type: string; content: string }, segIdx: number) => (
                        <React.Fragment key={segIdx}>
                          {seg.type === "narrative" && (
                            <MessageResponse className="bg-chat-assistant-bg text-chat-assistant-fg">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{seg.content}</ReactMarkdown>
                            </MessageResponse>
                          )}
                          {seg.type === "sql_results" && (
                            <>
                              {r.sql && (
                                <details id={isLastAssistant ? "chat-last-sql" : undefined} className="rounded-xl bg-base-200 text-sm overflow-hidden">
                                  <summary className="cursor-pointer px-4 py-2 text-xs text-base-content/60 hover:bg-base-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-1 inline h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                                    Show SQL
                                  </summary>
                                  <pre className="overflow-x-auto px-4 py-3 text-xs bg-code-bg text-code-fg" style={{ margin: 0 }}>
                                    <code id={isLastAssistant ? "chat-last-sql-code" : undefined} dangerouslySetInnerHTML={{ __html: highlightSQL(r.sql) }} />
                                  </pre>
                                </details>
                              )}
                              {r.data && r.data.length > 0 && (
                                <div id={isLastAssistant ? "chat-last-table" : undefined} className="overflow-x-auto rounded-xl border text-sm">
                                  <div className="px-3 py-1.5 text-xs text-base-content/60 border-b bg-base-200/50">
                                    {r.row_count} row{r.row_count !== 1 ? "s" : ""}
                                    {r.execution_time_ms ? ` · ${r.execution_time_ms.toFixed(0)} ms` : ""}
                                  </div>
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="border-b bg-base-200/30">
                                        {Object.keys(r.data[0]).map((col) => (
                                          <th key={col} className="px-3 py-2 font-medium whitespace-nowrap">{col}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.data.slice(0, 20).map((row, i) => (
                                        <tr key={i} className="border-b last:border-0 hover:bg-base-200/20">
                                          {Object.values(row).map((val, j) => (
                                            <td key={j} className="px-3 py-1.5 whitespace-nowrap">
                                              {val === null ? <span className="text-base-content/60 italic">null</span> : String(val)}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {r.data.length > 20 && (
                                    <div className="px-3 py-1.5 text-xs text-base-content/60 border-t bg-base-200/50">
                                      Showing 20 of {r.row_count} rows
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          {seg.type === "viz" && r.viz_image && (
                            <div id={isLastAssistant ? "chat-last-viz" : undefined} className="overflow-hidden rounded-xl border">
                              <img src={`data:image/png;base64,${r.viz_image}`} alt="Visualization" className="max-w-full" />
                            </div>
                          )}
                          {seg.type === "plantuml" && (
                            <div id={isLastAssistant ? "chat-last-plantuml" : undefined} className="overflow-hidden rounded-xl border">
                              <div className="flex justify-between items-center px-3 py-1.5 text-xs text-base-content/60 border-b bg-base-200/50">
                                <span>PlantUML Diagram</span>
                                <button
                                  id={isLastAssistant ? "btn-chat-plantuml-fullscreen" : undefined}
                                  onClick={() => window.open(krokiUrl("plantuml", seg.content), "_blank")}
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-base-200"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg> View Full Screen
                                </button>
                              </div>
                              <div className="p-4 bg-base-100 flex justify-center">
                                <PlantUMLDiagram source={seg.content} />
                              </div>
                            </div>
                          )}
                          {seg.type === "html" && (
                            <div id={isLastAssistant ? "chat-last-html" : undefined}>
                              <HtmlIframe
                                content={seg.content}
                                label="HTML Preview"
                                onFullScreen={() => openHtmlInBrowser(seg.content)}
                              />
                            </div>
                          )}
                        </React.Fragment>
                      ))
                    ) : !r?.error && (
                      <>
                        {r?.text_response && (
                          <MessageResponse className="bg-chat-assistant-bg text-chat-assistant-fg">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{r.text_response}</ReactMarkdown>
                          </MessageResponse>
                        )}
                        {r?.explanation && !r?.text_response && (
                          <div className="prose prose-sm max-w-none rounded-2xl px-4 py-3 bg-chat-assistant-bg text-chat-assistant-fg">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{r.explanation}</ReactMarkdown>
                          </div>
                        )}
                      </>
                    )}

                    {/* Copy button */}
                    {r?.raw_content && (
                      <div className="flex justify-end">
                        <button
                          id={isLastAssistant ? "btn-chat-copy-answer" : undefined}
                          onClick={() => copyToClipboard(r.raw_content!, msg.id)}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-200"
                          title="Copy Athena's response"
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

          {/* Per-message streaming indicator now lives inside each assistant bubble
              (see status === "streaming" above), so no global indicator here. */}
        </ConversationContent>
      </Conversation>

      {/* ====== Input bar ====== */}
      <div className="border-t bg-base-100 px-4 py-3">
        <PromptInput
          id="chat-input-form"
          onSubmit={handleSubmit}
          className="mx-auto max-w-4xl"
        >
          <PromptInputTextarea
            id="chat-input-textarea"
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setHistoryIdx(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              busy
                ? "Queue another question…"
                : isConnected
                  ? "Ask about your data — or anything about DataPallas…"
                  : "Ask about DataPallas — reports, dashboards, delivery, portals, automation…"
            }
          />
          {busy && !input.trim() ? (
            <button
              id="btn-stop-chat"
              type="button"
              onClick={handleStop}
              aria-label="Stop generating"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-error text-error-content transition-colors hover:bg-error/90"
            >
              {/* Heroicon: stop (filled square) */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
          ) : (
            <PromptInputSubmit
              id="btn-submit-chat"
              status="ready"
              disabled={!input.trim()}
            />
          )}
        </PromptInput>
      </div>
    </div>
  );
}
