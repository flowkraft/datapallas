/** True when the error is the adapter's "0 agents provisioned" signal — the AI Crew was never
 *  created. The chat turns this into a "Provision Agents" call-to-action linking to /agents,
 *  instead of the generic red error box. */
export function isNoAgentsError(raw?: string): boolean {
  const s = (raw || "").toUpperCase();
  return s.includes("AGENTS_NOT_PROVISIONED") || s.includes("NO AI AGENTS ARE PROVISIONED");
}

/** Turn a raw error into a friendly headline by grepping the status / keywords.
 *  Errors come from two very different places: the AI provider (rate limits, auth,
 *  outages) OR the chat2db engine / database (a failed query, a serialization issue).
 *  We classify accordingly and only blame the AI provider when it's actually an AI
 *  provider error. The raw text is still shown under "technical details". */
export function friendlyError(raw: string): string {
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
