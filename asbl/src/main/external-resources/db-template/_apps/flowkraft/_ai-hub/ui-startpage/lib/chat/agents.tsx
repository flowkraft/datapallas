import type { ComponentType } from "react";
import { AthenaAvatar, AthenaFull } from "@/components/shared/AthenaAvatar";
import { MnemosyneAvatar, MnemosyneFull } from "@/components/shared/MnemosyneAvatar";
import { AgentAvatar, AgentAvatarFull } from "@/components/chat/AgentAvatar";

/**
 * Per-agent display config for the unified ChatAgentPage. This is the ONLY thing that
 * differs between the six chat pages — everything else (queue engine, streaming, renderer)
 * is shared. It is intentionally lightweight (no Letta system prompts / memory blocks): the
 * heavy agent definitions live in `src/agents/*` and must never enter the client bundle.
 *
 * `showDbConnection` is the one load-bearing flag: true ⇒ the page shows the DB connection
 * bar AND routes turns through the chat2db execution engine (Athena, the only agent that
 * runs SQL + renders charts server-side). false ⇒ the plain OpenAI-adapter transport.
 */
export interface ChatAgentConfig {
  /** Letta agent key; also the `/api/openai/<slug>/…` adapter path segment. */
  slug: string;
  /** Name shown above each assistant bubble. */
  name: string;
  /** Tailwind/daisyUI color class for the agent's name label. */
  accentClass: string;
  Avatar: ComponentType<{ size?: number; className?: string }>;
  AvatarFull: ComponentType<{ height?: number; className?: string }>;
  /** Athena only — show the DB bar and use the chat2db execution transport. */
  showDbConnection: boolean;
  /** Header brand title (left of the tagline). */
  brandTitle: string;
  /** One-liner shown next to the brand title. */
  headerTagline: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Input placeholder when idle (and, for DB agents, no connection yet). */
  placeholderIdle: string;
  /** Athena only — placeholder once a database is connected. */
  placeholderConnected?: string;
  /** Optional "Chat in Element (Matrix)" secondary surface shown in the header. */
  elementRoomUrl?: string;
}

// Adapters so every agent exposes the identical {size}/{height} avatar call shape.
const crewAvatar = (slug: string): ChatAgentConfig["Avatar"] =>
  function CrewAvatar({ size, className }) {
    return <AgentAvatar slug={slug} size={size} className={className} />;
  };
const crewAvatarFull = (slug: string): ChatAgentConfig["AvatarFull"] =>
  function CrewAvatarFull({ height, className }) {
    return <AgentAvatarFull slug={slug} height={height} className={className} />;
  };

const CREW = (slug: string, name: string, tagline: string, emptyDescription: string, placeholderIdle: string): ChatAgentConfig => ({
  slug,
  name,
  accentClass: "text-primary",
  Avatar: crewAvatar(slug),
  AvatarFull: crewAvatarFull(slug),
  showDbConnection: false,
  brandTitle: `Chat with ${name}`,
  headerTagline: tagline,
  emptyTitle: `Chat with ${name}`,
  emptyDescription,
  placeholderIdle,
});

export const CHAT_AGENTS: Record<string, ChatAgentConfig> = {
  athena: {
    slug: "athena",
    name: "Athena",
    accentClass: "text-athena-accent",
    Avatar: AthenaAvatar,
    AvatarFull: AthenaFull,
    showDbConnection: true,
    brandTitle: "Chat2DB",
    headerTagline:
      "powered by Athena — ask in plain English, get SQL + results + charts. Refine, drill deeper, visualize.",
    emptyTitle: "Chat with Athena",
    emptyDescription:
      "Ask me anything about DataPallas — report generation and bursting, document delivery (email, upload, customer web portals), dashboards, and automation. Connect a database above to explore your data too — I write the SQL, run it locally, explain the results, and only ever see table and column names, never your rows.",
    placeholderIdle: "Ask about DataPallas — reports, dashboards, delivery, portals, automation…",
    placeholderConnected: "Ask about your data — or anything about DataPallas…",
  },
  mnemosyne: {
    slug: "mnemosyne",
    name: "Mnemosyne",
    accentClass: "text-primary",
    Avatar: MnemosyneAvatar,
    AvatarFull: MnemosyneFull,
    showDbConnection: false,
    brandTitle: "Chat with Mnemosyne",
    headerTagline: "— your Data Learning Tutor. Learn by doing, then run the koans.",
    emptyTitle: "Chat with Mnemosyne",
    emptyDescription:
      "Learn data by doing it — not by watching. I'm your DataZeus tutor: ask me to walk you through a lesson, review a query you wrote, or explain a concept — then practice with the hands-on koans until it sticks. SQL first, data modeling next. I don't run your queries for you; you write them, and that's how it becomes yours.",
    placeholderIdle: "Ask Mnemosyne to explain a concept, review your SQL, or walk you through a koan…",
    elementRoomUrl: "http://localhost:8441/#/room/%23mnemosyne:localhost",
  },
  hermes: CREW(
    "hermes",
    "Hermes",
    "— Grails Guru & Self-Service Portal advisor: admin panels, customer portals, GSP views, Groovy.",
    "I'm Hermes — your Grails & self-service portal advisor. Ask me about Grails/Groovy views (GSP), admin panels, customer portals, and self-service web-app architecture.",
    "Ask Hermes about Grails, GSP views, or portal architecture…",
  ),
  apollo: CREW(
    "apollo",
    "Apollo",
    "— Next.js Guru & Modern Web advisor: React, TypeScript, Tailwind CSS, shadcn/ui.",
    "I'm Apollo — your modern-web advisor. Ask me about React, Next.js, TypeScript, Tailwind CSS, shadcn/ui, and frontend architecture.",
    "Ask Apollo about React, Next.js, Tailwind, or frontend architecture…",
  ),
  pythia: CREW(
    "pythia",
    "Pythia",
    "— WordPress CMS Portal advisor: WordPress/PHP, Sage theme (Roots), PODS content modeling.",
    "I'm Pythia — your WordPress CMS portal advisor. Ask me about WordPress/PHP, the Sage theme (Roots), PODS content modeling, and self-service portal architecture.",
    "Ask Pythia about WordPress, Sage, PODS, or portal architecture…",
  ),
  hephaestus: CREW(
    "hephaestus",
    "Hephaestus",
    "— Backend Jobs, ETL & Automation advisor: scheduling, pipelines, Groovy, Supabase, Redis.",
    "I'm Hephaestus — your backend, jobs & automation advisor. Ask me about scheduled jobs, ETL pipelines, Groovy scripting, automation patterns, Supabase, and Redis.",
    "Ask Hephaestus about jobs, ETL, Groovy, Supabase, or Redis…",
  ),
};

export function getChatAgent(slug: string): ChatAgentConfig | undefined {
  return CHAT_AGENTS[slug];
}
