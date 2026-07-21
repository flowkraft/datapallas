"use client";

/**
 * Chat2Mnemo — inline chat with Mnemosyne, the standalone Data Learning Tutor. No database
 * by design (her practice loop is the hands-on koans — you write the SQL). A thin wrapper over
 * the shared ChatAgentPage; Mnemosyne's config sets `showDbConnection: false` (plain OpenAI
 * adapter transport) and offers Element/Matrix as a secondary surface. See lib/chat/agents.tsx.
 */

import { ChatAgentPage } from "@/components/chat/ChatAgentPage";
import { CHAT_AGENTS } from "@/lib/chat/agents";

export default function Chat2MnemoPage() {
  return <ChatAgentPage config={CHAT_AGENTS.mnemosyne} />;
}
