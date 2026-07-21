"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "./types";
import type { StreamOne } from "./transports";

/**
 * The shared chat turn engine: a client-side FIFO queue with ONE in-flight turn.
 *
 * Every agent is a single stateful Letta agent, so turns are serialized here while the
 * input never blocks — a follow-up can be typed and queued mid-stream, and the in-flight
 * turn can be Stopped without dropping the ones queued behind it. The page injects a
 * `streamOne` transport (chat2db for DB agents, the OpenAI adapter otherwise); the engine
 * is identical for all of them. `streamOne` is read through a ref so the running pump
 * always uses the latest closure (e.g. the current "Send Tables" value).
 */
export function useChatQueue(streamOne: StreamOne) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);

  const msgIdCounter = useRef(0);
  const nextId = useCallback(() => `msg-${++msgIdCounter.current}`, []);

  const streamOneRef = useRef(streamOne);
  streamOneRef.current = streamOne;

  const queueRef = useRef<{ assistantId: string; question: string }[]>([]);
  const activeAbortRef = useRef<AbortController | null>(null);
  const pumpingRef = useRef(false);

  // Drain the queue one turn at a time. Re-entrant-safe: a second call while pumping just
  // lets the running loop pick up the newly-queued item.
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
        await streamOneRef.current(setMessages, next.assistantId, next.question, abort.signal);
        activeAbortRef.current = null;
        setBusy(false);
      }
    } finally {
      pumpingRef.current = false;
    }
  }, []);

  // Stop the in-flight turn. Anything already queued behind it keeps going (asked on purpose).
  const handleStop = useCallback(() => {
    activeAbortRef.current?.abort();
  }, []);

  // Show the user bubble + a queued assistant placeholder, then queue the turn.
  const enqueue = useCallback(
    (question: string) => {
      const userId = nextId();
      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: question },
        { id: assistantId, role: "assistant", content: "", status: "queued" },
      ]);
      queueRef.current.push({ assistantId, question });
      pump();
    },
    [nextId, pump],
  );

  return { messages, setMessages, busy, enqueue, handleStop, nextId };
}
