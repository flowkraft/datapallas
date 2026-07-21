"use client";

/**
 * Chat2Hephaestus — inline chat with Hephaestus, the Backend Jobs/ETL/Automation advisor.
 * Thin wrapper over the shared ChatAgentPage (no DB — plain OpenAI adapter transport).
 * See lib/chat/agents.tsx.
 */

import { ChatAgentPage } from "@/components/chat/ChatAgentPage";
import { CHAT_AGENTS } from "@/lib/chat/agents";

export default function Chat2HephaestusPage() {
  return <ChatAgentPage config={CHAT_AGENTS.hephaestus} />;
}
