// Shared types for the unified agent chat (ChatAgentPage + transports + hook).

export interface DbConnection {
  code: string;
  name: string;
  db_type: string;
  is_default: boolean;
  /** Full `dbserver` block from the Java API — forwarded to the backend on connect. */
  dbserver?: Record<string, any>;
}

/** Structured result the chat2db (Athena) engine returns in its final `done` frame:
 *  executed SQL, real result rows, a rendered chart, and ordered content segments.
 *  Agents on the plain OpenAI adapter never populate this — their answer is `content`. */
export interface Chat2DBResponse {
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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  /** Streamed tokens (all transports) and the final markdown answer (OpenAI-adapter agents). */
  content: string;
  /** Structured result — chat2db/Athena only. Also carries `error` for every transport. */
  response?: Chat2DBResponse;
  /** Assistant turn lifecycle: queued → streaming → done | stopped | error. */
  status?: "queued" | "streaming" | "done" | "stopped" | "error";
}
