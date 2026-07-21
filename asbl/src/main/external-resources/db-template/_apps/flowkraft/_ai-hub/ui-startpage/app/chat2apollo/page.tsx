"use client";

/**
 * Chat2Apollo — inline chat with Apollo, the Next.js Guru & Modern Web advisor.
 * Thin wrapper over the shared ChatAgentPage (no DB — plain OpenAI adapter transport).
 * See lib/chat/agents.tsx.
 */

import { ChatAgentPage } from "@/components/chat/ChatAgentPage";
import { CHAT_AGENTS } from "@/lib/chat/agents";

export default function Chat2ApolloPage() {
  return <ChatAgentPage config={CHAT_AGENTS.apollo} />;
}
