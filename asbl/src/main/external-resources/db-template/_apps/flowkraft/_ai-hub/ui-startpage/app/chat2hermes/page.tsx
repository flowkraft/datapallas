"use client";

/**
 * Chat2Hermes — inline chat with Hermes, the Grails Guru & Self-Service Portal advisor.
 * Thin wrapper over the shared ChatAgentPage (no DB — plain OpenAI adapter transport).
 * See lib/chat/agents.tsx.
 */

import { ChatAgentPage } from "@/components/chat/ChatAgentPage";
import { CHAT_AGENTS } from "@/lib/chat/agents";

export default function Chat2HermesPage() {
  return <ChatAgentPage config={CHAT_AGENTS.hermes} />;
}
