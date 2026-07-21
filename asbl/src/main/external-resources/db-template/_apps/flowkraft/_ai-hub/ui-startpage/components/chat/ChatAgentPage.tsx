"use client";

/**
 * ChatAgentPage — ONE chat surface for every DataPallas agent.
 *
 * All six agent pages (/chat2db, /chat2mnemo, /chat2hermes, …) render this component with a
 * different ChatAgentConfig; nothing else differs. The shared `useChatQueue` engine serializes
 * turns (each agent is a single stateful Letta agent) while the input never blocks, and the
 * superset renderer shows Athena's executed SQL / tables / charts AND any agent's inline
 * ```plantuml / ```html / ```svg diagrams.
 *
 * The one load-bearing switch is `config.showDbConnection`:
 *   true  → render the DB connection bar + route turns through the chat2db execution engine
 *           (Athena is the only agent that runs SQL and renders charts server-side)
 *   false → the plain OpenAI-adapter transport (`/api/openai/<slug>/…`)
 *
 * Every significant element carries a stable semantic #id (see the locked chat2db.screens.ts
 * contract) so the pages are e2e-automatable.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "@/lib/chat/prism-setup";

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
import { fetchConnections } from "@/lib/explore-data/rb-api";

import { markdownComponents } from "@/components/chat/MarkdownCode";
import { PlantUmlDiagram } from "@/components/chat/PlantUmlDiagram";
import { HtmlIframe } from "@/components/chat/HtmlIframe";
import { AgentPromptsPanel, defaultAgentPromptsFilter } from "@/components/chat/AgentPromptsPanel";
import { krokiUrl, openHtmlInBrowser, openImageInBrowser } from "@/lib/chat/kroki";
import { friendlyError, isNoAgentsError } from "@/lib/chat/errors";
import { useChatQueue } from "@/lib/chat/useChatQueue";
import { chat2dbStreamOne, openaiStreamOne, type StreamOne } from "@/lib/chat/transports";
import type { ChatAgentConfig } from "@/lib/chat/agents";
import type { DbConnection } from "@/lib/chat/types";

/** Highlight SQL with inline styles — no CSS dependency. Used for Athena's executed-SQL
 *  segment (the `#chat-last-sql-code` block the docs spec reads). */
function highlightSQL(sql: string): string {
  const keywords = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ON|AND|OR|NOT|IN|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|DISTINCT|COUNT|SUM|AVG|MIN|MAX|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INTO|VALUES|SET|UNION|ALL|BETWEEN|LIKE|IS|NULL|CASE|WHEN|THEN|ELSE|END|EXISTS|DESC|ASC|WITH|RECURSIVE)\b/gi;
  const strings = /('[^']*')/g;
  const numbers = /\b(\d+(?:\.\d+)?)\b/g;
  return sql
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(strings, '<span style="color:#7ec699">$1</span>')
    .replace(keywords, (m) => `<span style="color:#cc99cd">${m}</span>`)
    .replace(numbers, '<span style="color:#f08d49">$1</span>');
}

export function ChatAgentPage({ config: cfg }: { config: ChatAgentConfig }) {
  // ── Connection state (only meaningful / rendered when cfg.showDbConnection) ──
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [connectedCode, setConnectedCode] = useState(""); // actually connected DB
  const [connStatus, setConnStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [connError, setConnError] = useState("");
  const [sendSchema, setSendSchema] = useState(true);

  // ── Input + message history (Up/Down arrow) ──
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const savedInput = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pick the transport from the one load-bearing flag. Rebuilt when sendSchema changes;
  // useChatQueue reads it through a ref so the in-flight pump always uses the latest value.
  const streamOne = useCallback<StreamOne>(
    (setMessages, assistantId, question, signal) =>
      cfg.showDbConnection
        ? chat2dbStreamOne(setMessages, assistantId, question, signal, sendSchema)
        : openaiStreamOne(setMessages, assistantId, question, signal, cfg.slug),
    [cfg.showDbConnection, cfg.slug, sendSchema],
  );

  const { messages, setMessages, busy, enqueue, handleStop, nextId } = useChatQueue(streamOne);

  // ── Load connections on mount (DB agents only). Same source as /explore-data: the
  //    DataPallas Java REST API (includes virtual in-memory "sample" connections). ──
  useEffect(() => {
    if (!cfg.showDbConnection) return;
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
  }, [cfg.showDbConnection]);

  // ── Connect ──
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
  }, [selectedCode, connections, setMessages, nextId]);

  // ── Submit — queue the turn; the input clears but never disables ──
  const handleSubmit = useCallback(
    (msg: { text: string }) => {
      const question = msg.text.trim();
      // No DB required: with no connection, questions route to the agent as product/help
      // questions (the backend detects the missing connection for Athena).
      if (!question) return;
      setHistory((prev) => {
        const next = prev[prev.length - 1] === question ? prev : [...prev, question];
        return next.length > 50 ? next.slice(1) : next;
      });
      setHistoryIdx(-1);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      enqueue(question);
      inputRef.current?.focus();
    },
    [enqueue],
  );

  const handleClear = () => {
    setShowClearConfirm(false);
    if (cfg.showDbConnection && connStatus === "connected") {
      const conn = connections.find((c) => c.code === selectedCode);
      setMessages([
        { id: nextId(), role: "system", content: `Connected to ${conn?.name || selectedCode}. Ask me anything!` },
      ]);
    } else {
      setMessages([]);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

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

  const isConnected = connStatus === "connected" || !!connectedCode;
  const Avatar = cfg.Avatar;
  const AvatarFull = cfg.AvatarFull;
  // Stable per-agent prompt filter — memoized so the header button doesn't refetch on re-render.
  const promptsFilter = useMemo(() => defaultAgentPromptsFilter(cfg.slug), [cfg.slug]);
  const placeholder = busy
    ? "Queue another question…"
    : cfg.showDbConnection
      ? isConnected
        ? cfg.placeholderConnected || cfg.placeholderIdle
        : cfg.placeholderIdle
      : cfg.placeholderIdle;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
      {/* ====== Header ====== */}
      <div id="chat-header" className="flex-shrink-0 border-b bg-base-100 px-4 py-2 space-y-1.5">
        {/* Line 1: Brand (+ optional Element link) */}
        <div className="flex items-center gap-2">
          <Avatar size={32} />
          <span className={`text-sm font-semibold ${cfg.accentClass}`}>{cfg.brandTitle}</span>
          <span className="text-xs text-base-content/60">{cfg.headerTagline}</span>
          <div className="ml-auto flex items-center gap-3">
            <AgentPromptsPanel agentName={cfg.name} filter={promptsFilter} />
            {cfg.elementRoomUrl && (
              <a
                id="btn-chat-element"
                href={cfg.elementRoomUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-base-content/60 underline hover:text-base-content"
              >
                Chat in Element (Matrix)
              </a>
            )}
          </div>
        </div>

        {/* Line 2: DB controls + status (DB agents only — Athena) */}
        {cfg.showDbConnection && (
          <div id="chat-connection-bar" className="flex items-center gap-2 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-base-content/60 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>

            <select
              id="database-selector"
              value={selectedCode}
              onChange={(e) => {
                setSelectedCode(e.target.value);
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

            <Button id="btn-connect-database" size="sm" onClick={handleConnect} disabled={!selectedCode || connStatus === "connecting"}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-1 h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
              {connStatus === "connecting" ? "Connecting..." : "Connect"}
            </Button>

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

            <div id="connection-status" className="ml-auto flex items-center gap-1.5 text-sm truncate">
              {connStatus === "connected" && (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-green-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  <span className="text-green-600 truncate">Connected to {connectedCode}</span>
                </>
              )}
              {connStatus === "connecting" && <span className="text-base-content/60">Connecting...</span>}
              {connStatus === "error" && (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-red-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                  <span className="text-red-600 truncate">{connError}</span>
                </>
              )}
              {connStatus === "idle" && !connectedCode && <span className="text-base-content/60">No database connected</span>}
              {connStatus === "idle" && connectedCode && (
                <span className="text-base-content/60 truncate">Press Connect to switch from {connectedCode}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ====== Chat area ====== */}
      <Conversation id="chat-conversation" className="flex-1">
        {/* Clear button row */}
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
              icon={<AvatarFull height={160} />}
              title={cfg.emptyTitle}
              description={cfg.emptyDescription}
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
                // The latest user question carries #chat-user-last so e2e can frame the last Q+A pair.
                const isLastUser = msg.id === messages.filter((m) => m.role === "user").at(-1)?.id;
                return (
                  <Message key={msg.id} from="user" id={isLastUser ? "chat-user-last" : undefined}>
                    <MessageContent className="ml-auto">
                      <div className="rounded-2xl px-4 py-2.5 text-sm bg-chat-user-bg text-chat-user-fg">{msg.content}</div>
                    </MessageContent>
                  </Message>
                );
              }

              // Assistant message
              const r = msg.response;
              const isLastAssistant = messages[messages.length - 1]?.id === msg.id;
              // Copy the raw markdown once the turn completed — or was stopped with partial content.
              const copyText = r?.raw_content ?? (msg.status === "done" || msg.status === "stopped" ? msg.content : "");
              return (
                <Message key={msg.id} from="assistant" id={isLastAssistant ? "chat-assistant-last" : undefined}>
                  <MessageAvatar className="h-9 w-9"><Avatar size={36} /></MessageAvatar>
                  <MessageContent>
                    <span className={`text-xs font-semibold ${cfg.accentClass}`}>{cfg.name}</span>

                    {/* Queued (waiting its turn behind an earlier question) */}
                    {msg.status === "queued" && (
                      <div
                        id={isLastAssistant ? "chat-queued-indicator" : undefined}
                        className="rounded-2xl px-4 py-2 text-xs italic bg-chat-assistant-bg text-base-content/50"
                      >
                        Queued — I&apos;ll get to this next…
                      </div>
                    )}

                    {/* Live streaming turn — #chat-thinking-indicator stays present the whole turn */}
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

                    {/* Error — actionable CTA when the crew isn't provisioned, else the friendly box */}
                    {r?.error &&
                      (isNoAgentsError(r.error) ? (
                        <div id="chat-error-response" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                          <div className="text-base font-semibold">{cfg.name}&apos;s agents aren&apos;t provisioned yet</div>
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
                      ))}

                    {/* Answer body — Athena's ordered content_segments, or a plain-markdown reply */}
                    {!r?.error && r?.content_segments ? (
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
                              <div className="flex justify-between items-center px-3 py-1.5 text-xs text-base-content/60 border-b bg-base-200/50">
                                <span>Visualization</span>
                                <button
                                  id={isLastAssistant ? "btn-chat-viz-fullscreen" : undefined}
                                  onClick={() => openImageInBrowser(r.viz_image!)}
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-base-200"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg> View Full Screen
                                </button>
                              </div>
                              <div className="p-4 bg-base-100 flex justify-center">
                                <img src={`data:image/png;base64,${r.viz_image}`} alt="Visualization" className="max-w-full" />
                              </div>
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
                                <PlantUmlDiagram source={seg.content} />
                              </div>
                            </div>
                          )}
                          {seg.type === "html" && (
                            <div id={isLastAssistant ? "chat-last-html" : undefined}>
                              <HtmlIframe
                                content={seg.content}
                                label="HTML Preview"
                                onFullScreen={() => openHtmlInBrowser(seg.content)}
                                fullScreenButtonId={isLastAssistant ? "btn-chat-html-fullscreen" : undefined}
                              />
                            </div>
                          )}
                        </React.Fragment>
                      ))
                    ) : !r?.error && (r?.text_response || r?.explanation) ? (
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
                    ) : !r?.error && msg.status === "done" && msg.content ? (
                      // Plain-markdown reply (every agent except Athena). Diagrams render inline
                      // via the superset MarkdownCode (```plantuml / ```html / ```svg).
                      <MessageResponse className="bg-chat-assistant-bg text-chat-assistant-fg">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
                      </MessageResponse>
                    ) : null}

                    {/* Copy answer */}
                    {!r?.error && copyText && (
                      <div className="flex justify-end">
                        <button
                          id={isLastAssistant ? "btn-chat-copy-answer" : undefined}
                          onClick={() => copyToClipboard(copyText, msg.id)}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-200"
                          title={`Copy ${cfg.name}'s response`}
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

      {/* ====== Input bar ====== */}
      <div className="border-t bg-base-100 px-4 py-3">
        <PromptInput id="chat-input-form" onSubmit={handleSubmit} className="mx-auto max-w-4xl">
          <PromptInputTextarea
            id="chat-input-textarea"
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setHistoryIdx(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
          />
          {busy && !input.trim() ? (
            <button
              id="btn-stop-chat"
              type="button"
              onClick={handleStop}
              aria-label="Stop generating"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-error text-error-content transition-colors hover:bg-error/90"
            >
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
