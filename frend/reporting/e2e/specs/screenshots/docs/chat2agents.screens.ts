// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — AI Crew real conversations (for the ai-crew docs)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures REAL Q/A pairs with the provisioned AI Crew agents, from OUR OWN AI Hub
// chat pages (:8440/chat2<agent>) — replacing the hand-authored simulated
// <ChatDemo>/<MatrixChatDemo>/<HermesChatDemo>/<ApolloChatDemo> components in
// content/docs/ai-crew/{athena,hephaestus,hermes,apollo,chat-client-apps}.mdx with
// authentic screenshots. Each shot is `<variant>-dp.png`, dropped BELOW its
// simulated component in the mdx (old-vs-new side by side).
//
// NO Element Web / VS Code / any external app — every agent has its own chat page
// in our app, all sharing components/chat/ChatAgentPage.tsx (same semantic ids the
// chat2db capture machinery already uses). The provisioning + ask/capture machinery
// lives in e2e/helpers/chat-capture-helper.ts (extracted from chat2db.screens.ts).
//
// CLEAN DIRECT QUESTIONS (user preference): the simulated demos stage a "wrong
// answer, then I correct it" to feel real — we skip that. Each variant is asked as
// ONE clear, to-the-point question; `askUntilClean` re-asks until a good answer
// lands. The captured pair is always just the latest Q + latest A, so every shot is
// a clean single exchange (prior turns only give the agent coherent context).
//
// NON-DESTRUCTIVE: the agents chat + provide code snippets (the user writes the
// playground code); the only disk writes are additive artifacts (PRD.org, diagrams)
// into the agent's own agents-output-artifacts/ folder. No existing app files change.
//
// ATHENA is still the requirements/PRD front door (her billing-* turns write the PRD to
// agents-output-artifacts/athena/). But the specialists no longer depend on it: Hermes, Apollo
// and Hephaestus each run a self-contained "make it mine" session — the user comes DIRECT (saw
// the Seed-Data video), copies the shipped billing-portal _custom example, and changes only their
// data model + brand. So specialist runs are independent; Athena-first is no longer required.
//
// HOW TO RUN: needs Docker (AI Hub) + a z.ai Coding-Plan key.
//   cd frend/reporting
//   # E2E_SPEC="chat2agents.screens.ts", E2E_GREP="AI Crew — chat2agents", ZAI_API_KEY=<key>
//   # optional: CHAT2AGENTS_ONLY=athena|hephaestus|hermes|apollo  (run one agent at a time —
//   #           the full ~90-pair run against a small model is long)
//   npm run custom:start-server-and-e2e-electron-screens-grep
// ═══════════════════════════════════════════════════════════════════════════════

import { test } from '@playwright/test';
import { Page } from '@playwright/test';
import * as path from 'path';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { DOCS_IMAGES_DIR } from '../../../utils/docs-screenshot-helper';
import {
  bootAndProvisionAiHub,
  teardownAiHub,
  agentChatUrl,
  connectChat2db,
  askUntilClean,
  captureQAPair,
  type Settle,
} from '../../../helpers/chat-capture-helper';

// -dp shots for the ai-crew docs live under public/images/docs/ai-crew/.
const AI_CREW_DIR = path.join(DOCS_IMAGES_DIR, 'ai-crew');

// Bundled read-only DuckDB Northwind sample (ships with DataPallas) for Athena's
// data questions — same connection the chat2db capture uses.
const SAMPLE_DUCKDB = 'rbt-sample-northwind-duckdb-4f2';

// Optional single-agent filter so the long full run can be split up.
const ONLY = (process.env.CHAT2AGENTS_ONLY || '').toLowerCase();
const wants = (agent: string) => !ONLY || ONLY === agent;

interface Turn {
  variant: string;  // == the mdx <ChatDemo variant="…"> → shot basename
  prompt: string;   // the clean, direct question asked for real
  settle?: Settle;  // default 'text'; 'diagram'/'chart'/'table' waits for that render
}

// ── ATHENA — Chat2DB (data, config, diagrams, PRD) ──────────────────────────────
// athena.mdx + chat-client-apps.mdx variants.
const ATHENA_TURNS: Turn[] = [
  // Athena → DataPallas knowledge
  { variant: 'rb-knowledge', prompt: 'What are the main things DataPallas can do, and how do you help me use them?' },
  { variant: 'payslips', prompt: 'How do I set up DataPallas to burst a payslips PDF and email each employee their own payslip?' },
  { variant: 'payslips-setup', prompt: 'Walk me through the exact configuration steps to burst and email the payslips.' },
  { variant: 'rb-scripts', prompt: 'What sample Groovy scripts does DataPallas provide for customizing the bursting lifecycle?' },
  { variant: 'encrypt-script', prompt: 'Give me a Groovy script that password-protects each generated PDF before it is emailed.' },
  { variant: 'thank-you', prompt: 'That is exactly what I needed — thank you!' },
  // Configure / Build a new PDF Report (OLTP)
  { variant: 'report-choose', prompt: 'I want to build a new PDF report from my database. How do I start in DataPallas?' },
  { variant: 'report-plan', prompt: 'What is the plan to build this PDF report end to end?' },
  { variant: 'report-datasource', prompt: 'How do I configure the SQL data source for this report?' },
  { variant: 'report-menu-fix', prompt: 'My new report is not showing up in the Reports menu — how do I fix that?' },
  { variant: 'report-template', prompt: 'Help me create the HTML template for this PDF report.' },
  { variant: 'report-done', prompt: 'The report generates correctly now — great work.' },
  // Pivot Table Report over a Data Warehouse (OLAP)
  { variant: 'pivot-intro', prompt: 'I want to build a pivot table report over my OLAP data warehouse. Where do I begin?' },
  { variant: 'pivot-create', prompt: 'Create a new pivot table report configuration for me.' },
  { variant: 'pivot-datasource', prompt: 'How do I point the pivot report at the Northwind OLAP DuckDB warehouse?' },
  { variant: 'pivot-config', prompt: 'How do I configure the pivot table rows, columns, and measures?' },
  { variant: 'pivot-test', prompt: 'How do I test the pivot table report and preview the results?' },
  { variant: 'pivot-done', prompt: 'The pivot report looks great — thanks.' },
  { variant: 'pivot-clickhouse', prompt: 'How would this same pivot report work against ClickHouse instead of DuckDB?' },
  { variant: 'pivot-embed', prompt: 'How do I embed this pivot table report as a web component in my own app?' },
  // Athena → Diagraming Skills
  { variant: 'greeting', prompt: 'Hi Athena! What can you help me with?' },
  { variant: 'er-diagram', prompt: 'Draw an entity-relationship diagram of my Northwind database.', settle: 'diagram' },
  { variant: 'invoicing-flow', prompt: 'Create a flowchart of the invoice lifecycle, from creation to payment.' },
  { variant: 'invoice-portal', prompt: 'Design an HTML mockup for a customer invoice portal page.' },
  { variant: 'cfo-dashboard', prompt: 'Design an HTML mockup for a CFO analytics dashboard with KPIs and charts.' },
  // Athena → New Billing Portal (PRD) — writes the PRD the specialists later read
  { variant: 'billing-intro', prompt: 'I need to build a billing portal for our customers. Can you help me write a Product Requirements Document?' },
  { variant: 'billing-requirements', prompt: 'Help me capture the core requirements for the billing portal PRD.' },
  { variant: 'billing-scale', prompt: 'The portal must serve about a thousand customers billed monthly — how does that scale affect the design?' },
  { variant: 'billing-prd', prompt: 'Write the full billing portal PRD document, including the data model, user stories, and a WBS diagram.' },
  { variant: 'billing-bye', prompt: 'The PRD is perfect — thank you, Athena.' },
  { variant: 'billing-mockups', prompt: 'Create HTML mockups for the billing portal — a bills list page and a bill detail page.' },
  { variant: 'billing-summary', prompt: 'Summarize the billing portal plan and the next steps.' },
  { variant: 'billing-final-bye', prompt: 'Great — I will take this PRD to the specialists now. Thanks!' },
  // Administration / Other — OLAP sync (Altinity CDC)
  { variant: 'olap-sync-intro', prompt: 'How do I set up OLTP-to-OLAP data warehouse synchronization in DataPallas?' },
  { variant: 'olap-sync-cdc', prompt: 'Explain how CDC replication to ClickHouse works.' },
  { variant: 'olap-sync-purpose', prompt: 'Why would I want real-time CDC replication instead of a nightly batch?' },
  { variant: 'olap-sync-start', prompt: 'How do I start the Altinity Sink Connector?' },
  { variant: 'olap-sync-configure', prompt: 'How do I configure the CDC connector for a PostgreSQL source?' },
  { variant: 'olap-sync-test', prompt: 'How do I verify the CDC replication to ClickHouse is working?' },
  // dbt Core
  { variant: 'dbt-intro', prompt: 'How do I use dbt Core to transform raw data into a star-schema data warehouse?' },
  { variant: 'dbt-timing', prompt: 'Is dbt real-time or batch, and when should it run relative to the CDC sync?' },
  { variant: 'dbt-structure', prompt: 'How should I structure my dbt project for a sales star schema?' },
  { variant: 'dbt-existing', prompt: 'I already have some dbt models — how do I extend them safely?' },
  { variant: 'dbt-build', prompt: 'Help me build a dbt model for a sales fact table with its dimensions.' },
  { variant: 'dbt-run', prompt: 'How do I run and test my dbt models?' },
  // CloudBeaver
  { variant: 'cloudbeaver-intro', prompt: 'How do I configure CloudBeaver to browse my databases from DataPallas?' },
  { variant: 'cloudbeaver-setup', prompt: 'Walk me through the CloudBeaver setup steps.' },
  { variant: 'cloudbeaver-verify', prompt: 'How do I verify CloudBeaver is connected to my database correctly?' },
  // chat-client-apps.mdx — data table + chart + mermaid
  { variant: 'explore-top-customers', prompt: 'Show me our top ten customers by total revenue.', settle: 'table' },
  { variant: 'explore-pie-chart', prompt: 'Show revenue by product category as a pie chart.', settle: 'chart' },
  { variant: 'chat-mermaid-flow', prompt: 'Create a Mermaid flowchart of our order fulfillment process.' },
];

// ── HEPHAESTUS — Backend / payment reminders (chat2hephaestus) ──────────────────
// Model-B "make it mine", backend flavor — the user already has a billing portal and wants the
// automation (overdue-marker cron, later reminders) via the shipped billing-portal-bkend example.
// Same seven beats; the "data model" beat becomes the cron rule + schedule, "branding" becomes the
// shared-DB wiring (how the cron reaches the portal's data with no REST call).
const HEPH_TURNS: Turn[] = [
  { variant: 'heph-intro', prompt: 'Hi Hephaestus. I have a billing portal running. I want a backend job that flags overdue invoices (and later sends reminders), like the one in the billing-portal example. Can you help?' },
  { variant: 'heph-reference', prompt: 'Is there an example backend I can copy instead of writing a Spring Boot app from scratch?' },
  { variant: 'heph-cron', prompt: 'How do I make the rule and schedule mine — flip DUE invoices past their due date to OVERDUE, hourly?' },
  { variant: 'heph-shareddb', prompt: 'How does the cron reach my portal invoices without making a REST call?' },
  { variant: 'heph-emit', prompt: 'Great — give me the full _custom bundle for the backend.' },
  { variant: 'heph-run', prompt: 'How do I run it and confirm it is actually flipping overdue invoices?' },
  { variant: 'heph-bye', prompt: 'Perfect — thank you!' },
];

// ── HERMES — Grails admin panel + customer portal UI (chat2hermes) ───────────────
// Model-B "make it mine": the user comes DIRECT (saw the Seed-Data video), wants the shipped
// billing-portal example with their own data model + brand. No PRD hand-off, no pair-programming,
// no cleaning session — copy the _custom bundle, change two things, run it from Seed Data.
const HERMES_TURNS: Turn[] = [
  { variant: 'hermes-intro', prompt: 'Hi Hermes. I saw the video where a Billing Portal appeared right from the Seed Data screen, one click. I want the same thing, but with my own invoice data model and my own branding — my company name and colours. Can you help?' },
  { variant: 'hermes-reference', prompt: 'Where do I start — do I rebuild it, or is there something I can copy?' },
  { variant: 'hermes-datamodel', prompt: 'My invoices have an invoice number, issue and due dates, a status, a customer (name, email, company, VAT id) and line items. How do I make the data model mine?' },
  { variant: 'hermes-branding', prompt: 'My company is Acme Freight and I want a clean corporate look, not the dark theme. How do I rebrand it?' },
  { variant: 'hermes-emit', prompt: 'Great — can you give me the full _custom bundle to drop in?' },
  { variant: 'hermes-run', prompt: 'And then it works exactly like the video, right from the Seed Data screen?' },
  { variant: 'hermes-bye', prompt: 'That is exactly what I wanted — thank you!' },
];

// ── APOLLO — Next.js admin dashboard + customer portal UI (chat2apollo) ──────────
// Model-B "make it mine", Next.js flavor — the 101% mirror of the Hermes arc (Drizzle schema +
// Next branding instead of GORM + GSP). Same seven beats, same Acme Freight persona.
const APOLLO_TURNS: Turn[] = [
  { variant: 'apollo-intro', prompt: 'Hi Apollo. I saw the video where a Billing Portal appeared right from the Seed Data screen, one click. I want the same thing in Next.js, but with my own invoice data model and my own branding. Can you help?' },
  { variant: 'apollo-reference', prompt: 'Where do I start — do I rebuild it, or is there something I can copy?' },
  { variant: 'apollo-datamodel', prompt: 'My invoices have an invoice number, issue and due dates, a status, a customer (name, email, company, VAT id) and line items. How do I make the data model mine?' },
  { variant: 'apollo-branding', prompt: 'My company is Acme Freight and I want a clean corporate look, not the dark theme. How do I rebrand it?' },
  { variant: 'apollo-emit', prompt: 'Great — can you give me the full _custom bundle to drop in?' },
  { variant: 'apollo-run', prompt: 'And then it works exactly like the video, right from the Seed Data screen?' },
  { variant: 'apollo-bye', prompt: 'That is exactly what I wanted — thank you!' },
];

/**
 * Run a list of turns as ONE continuous conversation on the currently-open chat
 * page (context builds naturally), capturing the latest clean Q/A pair after each.
 * `clearBetween: false` so a retry re-asks in place instead of nuking the thread.
 */
async function runTurns(page: Page, turns: Turn[]): Promise<void> {
  for (const t of turns) {
    const settle: Settle = t.settle ?? 'text';
    await askUntilClean(page, t.variant, t.prompt, settle, {
      needTable: settle === 'table',
      clearBetween: false,
    });
    await captureQAPair(page, t.variant, AI_CREW_DIR);
    console.log(`[chat2agents] captured ai-crew/${t.variant}-dp.png`);
  }
}

async function openAgentChat(page: Page, slug: string): Promise<void> {
  await page.goto(agentChatUrl(slug), { waitUntil: 'networkidle' });
  await page.locator('#chat-input-textarea').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1000);
}

electronBeforeAfterAllTest(
  'AI Crew — chat2agents real conversations (all agents)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let externalBrowser: Awaited<ReturnType<typeof bootAndProvisionAiHub>>['externalBrowser'] | null = null;
    try {
      const boot = await bootAndProvisionAiHub(firstPage);
      externalBrowser = boot.externalBrowser;
      const page = boot.page;

      // ── ATHENA (Chat2DB, connected to the DuckDB sample) — runs FIRST so her
      //    billing-* turns write the PRD the specialists then read.
      if (wants('athena')) {
        await connectChat2db(page, SAMPLE_DUCKDB);
        await runTurns(page, ATHENA_TURNS);
      }

      // ── HEPHAESTUS ──
      if (wants('hephaestus')) {
        await openAgentChat(page, 'hephaestus');
        await runTurns(page, HEPH_TURNS);
      }

      // ── HERMES ──
      if (wants('hermes')) {
        await openAgentChat(page, 'hermes');
        await runTurns(page, HERMES_TURNS);
      }

      // ── APOLLO ──
      if (wants('apollo')) {
        await openAgentChat(page, 'apollo');
        await runTurns(page, APOLLO_TURNS);
      }

      console.log('[chat2agents] DONE — captured all requested agent Q/A pairs.');
    } finally {
      await teardownAiHub(firstPage, externalBrowser);
    }
  },
);
