"use client";

/**
 * Chat2DB — Athena, the data & analytics oracle. Natural-language → executed SQL, tables,
 * and charts. This page is now a thin wrapper: all chat behavior lives in the shared
 * ChatAgentPage, and Athena's config sets `showDbConnection: true` (the DB connection bar +
 * the chat2db execution transport). Every other agent renders the SAME component with a
 * different config. See lib/chat/agents.tsx.
 */

import { ChatAgentPage } from "@/components/chat/ChatAgentPage";
import { CHAT_AGENTS } from "@/lib/chat/agents";

export default function Chat2DBPage() {
  return <ChatAgentPage config={CHAT_AGENTS.athena} />;
}
