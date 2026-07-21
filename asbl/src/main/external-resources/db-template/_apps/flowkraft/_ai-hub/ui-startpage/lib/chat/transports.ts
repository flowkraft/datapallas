import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage } from "./types";

type SetMessages = Dispatch<SetStateAction<ChatMessage[]>>;

/** A transport streams one assistant turn: it drives the message identified by
 *  `assistantId` from "streaming" to its terminal state (done | stopped | error).
 *  Which transport is used is decided by the page (chat2db for DB agents, the plain
 *  OpenAI adapter otherwise). */
export type StreamOne = (
  setMessages: SetMessages,
  assistantId: string,
  question: string,
  signal: AbortSignal,
) => Promise<void>;

/** chat2db transport (Athena) — POST /api/chat2db, custom SSE frames.
 *
 *  Athena's narrative arrives as {type:"delta"} frames as she types, then one
 *  {type:"done", ...full structured result...} (executed SQL / table / chart) or
 *  {type:"error"}. Abort (Stop) keeps whatever streamed and tags the turn "stopped". */
export async function chat2dbStreamOne(
  setMessages: SetMessages,
  assistantId: string,
  question: string,
  signal: AbortSignal,
  sendSchema: boolean,
): Promise<void> {
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
}

/** OpenAI-adapter transport (every agent except Athena) — POST
 *  /api/openai/<slug>/v1/chat/completions, OpenAI-compatible SSE chunks. The agent is
 *  a stateful Letta agent, so each turn sends ONLY the new user message. The reply is
 *  plain markdown (no structured result); diagrams are rendered client-side from fenced
 *  blocks by the shared MarkdownCode. Errors flow through `response.error`, same as chat2db. */
export async function openaiStreamOne(
  setMessages: SetMessages,
  assistantId: string,
  question: string,
  signal: AbortSignal,
  agentSlug: string,
): Promise<void> {
  let acc = "";
  const patch = (m: Partial<ChatMessage>) =>
    setMessages((prev) => prev.map((x) => (x.id === assistantId ? { ...x, ...m } : x)));
  try {
    const res = await fetch(`/api/openai/${agentSlug}/v1/chat/completions`, {
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
      } catch {
        /* keep default */
      }
      patch({ status: "error", response: { error: msg } });
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
            patch({ status: "error", response: { error: ev.error.message || ev.error.code || "stream error" }, content: acc });
            return;
          }
          const delta = ev?.choices?.[0]?.delta?.content;
          if (delta) {
            acc += delta;
            patch({ content: acc });
          }
        } catch {
          /* ignore partial JSON across chunk boundaries */
        }
      }
    }
    patch({
      content: acc,
      status: acc.trim() ? "done" : "error",
      response: acc.trim() ? undefined : { error: "The agent returned an empty reply." },
    });
  } catch (e: any) {
    // Abort (Cancel) → keep whatever streamed so far and tag the turn "stopped".
    if (signal.aborted || e?.name === "AbortError") {
      patch({ status: "stopped", content: acc });
    } else {
      patch({ status: "error", response: { error: e?.message || "Connection error" }, content: acc });
    }
  }
}
