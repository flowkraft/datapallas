"use client";

/**
 * Chat2Pythia — inline chat with Pythia, the WordPress CMS Portal advisor.
 * Thin wrapper over the shared ChatAgentPage (no DB — plain OpenAI adapter transport).
 * See lib/chat/agents.tsx.
 */

import { ChatAgentPage } from "@/components/chat/ChatAgentPage";
import { CHAT_AGENTS } from "@/lib/chat/agents";

export default function Chat2PythiaPage() {
  return <ChatAgentPage config={CHAT_AGENTS.pythia} />;
}
