# DataPallas UI & Documentation Navigation

= DATAPALLAS APPLICATION MENU STRUCTURE
  A complete guide to every screen, what the user can do there,
  and where to read more.
  Base URL: https://datapallas.com

> **Stay current.** This file is a snapshot of the current UI. If the user describes a screen, button, or path you don't recognise — or if it's been a while since you last verified — fetch https://datapallas.com/docs to confirm you're still aligned with the latest UI. Reality on screen is the source of truth; this file is the cheat sheet.

================================================================================
TOP NAVIGATION BAR
================================================================================

┌─────────────────────────────────────────────────────────────────────────────┐
│ [Logo]  Processing   Configuration ▾   Help & Support ▾    (...)            │
└─────────────────────────────────────────────────────────────────────────────┘

─── 1. PROCESSING ─────────────────────────────────────────────────────────────
     Direct link (no dropdown). Opens the Processing area, where the
     user runs burst & report generation jobs, explores data, builds
     dashboards, merges files, runs QA, and inspects logs.
     Docs: /docs/report-bursting
           /docs/report-generation
           /docs/data-exploration
           /docs/bi-analytics/dashboards

─── 2. CONFIGURATION ▾ ────────────────────────────────────────────────────────
     Lean dropdown — the current template plus two management links:

     ├── Bursting
     │   The fallback configuration template (loaded automatically when
     │   no more specific template applies). Click to open its settings
     │   in the per-template Configuration area.
     │   Docs: /docs/configuration
     │
     ├── Reports, Connections & Cubes
     │   Single link that opens the management area with three sub-pages
     │   (Reports, Connections, Cubes / Semantic Layer) — see below.
     │   Reports are NOT enumerated in this dropdown anymore — they live
     │   in a paginated table inside the Reports page.
     │   Docs: /docs/configuration
     │
     └── More Settings
         Opens a modal of app-wide / global settings (not per-report).

─── 3. HELP & SUPPORT ▾ ──────────────────────────────────────────────────────

     ├── Get Software Support
     │   Contact support@datapallas.com with log files attached.
     │   Docs: /docs/troubleshooting
     │
     ├── DataPallas Services
     │   Professional services: custom scripting, branded email templates,
     │   managed solutions.
     │
     ├── Apps / Starter Packs / Extra Utils
     │   Browse and install bundled apps (Matomo, Docuseal, etc.) and
     │   starter packs.
     │   Docs: /docs/advanced/work-well-apps
     │
     ├── Documentation
     │   Quick links to QuickStart, User Guide, Advanced Scenarios.
     │   Docs: /docs  /docs/quickstart  /docs/advanced
     │
     ├── Examples
     │   Real-world use cases with "Try It" demos.
     │
     ├── Customer Reviews
     │   Testimonials from organizations using DataPallas.
     │
     ├── DataPallas Blog
     │   Latest blog posts, features, best practices.
     │
     ├── System Diagnostics / Update    [Electron desktop app only]
     │   Java/system check and update flow.
     │   Docs: /docs/server/installation
     │
     ├── License
     │   View and manage license key.
     │
     └── About
         Version & copyright info.

─── RIGHT SIDE OF NAVBAR ──────────────────────────────────────────────────────
     ├── Request New Feature — opens a feature-request form
     ├── support@datapallas.com — quick link to support
     └── Theme/Skin selector — change the app's visual theme


================================================================================
LEFT SIDEBAR MENUS (one per area)
================================================================================
When you enter an area, the left sidebar shows its dedicated menu.


━━━ PROCESSING (left menu) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Header: "ACTIONS"

     ├── Processing
     │   The default landing item. Selecting it shows a TAB STRIP in the
     │   main pane (see Processing Tabs below).
     │   Docs: /docs/report-bursting
     │
     ├── Merge -> Burst
     │   Combine multiple PDFs into one merged document, then optionally
     │   burst the result. Drag to reorder before merging.
     │   Docs: /docs/report-bursting
     │
     ├── Quality Assurance
     │   Test the configuration before going live: test all tokens,
     │   random tokens, or specific values. Built-in test email server
     │   captures outgoing email safely.
     │   Docs: /docs/report-distribution-qa
     │
     ├── Logging, Tracing
     │   Detailed logs from completed jobs (burst, merge, QA). Search,
     │   filter, diagnose.
     │   Docs: /docs/troubleshooting
     │
     └── Samples - Try All
         Built-in sample configurations covering different capabilities.
         Each sample has a "Try It" button to run it instantly. The two
         sample dashboards live here too.
         Docs: /docs/quickstart


━━━ PROCESSING TABS (main pane, when "Processing" left menu is selected) ━━━━━

When Processing (Burst) is selected in the left menu, the main pane shows
a tab strip. The visible tabs are:

     Tabs, left to right:
       Burst Reports · Generate Reports · Explore Data & Build Dashboards · Customer Portal · Logging and Tracing · License

     ├── Burst Reports
     │   Pick a PDF/Excel input file and click Burst — splits the input
     │   into individual files based on burst tokens. Real-time progress.
     │   Docs: /docs/report-bursting
     │
     ├── Generate Reports
     │   Run report generation jobs from configured data sources (CSV,
     │   Excel, SQL, Groovy scripts, JasperReports).
     │   Docs: /docs/report-generation
     │
     ├── Explore Data & Build Dashboards    ★ NEW IN 15.2.0
     │   Apps Manager for the Explore Data Canvas — a Docker-based
     │   visual workspace. Click Start (waits for the container), then
     │   Launch (opens the canvas in a browser at localhost:8440/explore-data).
     │   This is where the user explores data visually and prototypes
     │   dashboards by dropping cubes or tables onto the canvas.
     │   Docs: /docs/data-exploration
     │         /docs/data-exploration/canvas
     │         /docs/bi-analytics/dashboards
     │
     ├── Customer Portal
     │   Start / launch the bundled self-service document & BI web-portal
     │   apps (Grails, Next.js, WordPress).
     │   Docs: /docs/document-portal
     │
     ├── Logging and Tracing
     │   View logs from running and completed jobs.
     │   Docs: /docs/troubleshooting
     │
     └── License
         Standard License tab (mirror of Help → License).

When other left-menu items are selected (Merge -> Burst, Quality Assurance,
Logging Tracing, Samples), only the relevant tab plus Logging and License
are shown.


━━━ REPORTS, CONNECTIONS & CUBES (left menu) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Header: "Reports, Connections & Cubes"
Reached via: Top menu → Configuration → Reports, Connections & Cubes

     ├── Reports
     │   Paginated table of every configured report. Browse, create,
     │   duplicate, edit name/capabilities, toggle visibility, restore
     │   defaults, delete. The default fallback template (Bursting) is
     │   always present.
     │   Docs: /docs/configuration
     │
     ├── Connections
     │   Manage reusable email-server and database connection profiles.
     │   Create, edit, test, set default, duplicate, delete. Templates
     │   reference connections by name so credentials are configured
     │   once and reused everywhere.
     │   Docs: /docs/data-exploration/database-connections
     │         /docs/report-distribution-email
     │
     └── Cubes / Semantic Layer
         ★ NEW IN 15.2.0
         Define reusable Cube definitions over your database tables —
         dimensions, measures, joins, segments, hierarchies — in business
         language. Cubes power the Explore Data Canvas, dashboards,
         reports, and AI questions, all reading from the same source of
         truth. Five Northwind sample cubes ship bundled (Customer
         Management, Human Resources, Product Inventory, Sales Analysis,
         Sales Warehouse).
         Docs: /docs/semantic-layer
               /docs/semantic-layer/quickstart
               /docs/semantic-layer/dsl-reference


━━━ PER-TEMPLATE CONFIGURATION (left menu) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Header: "CONFIGURATION" + (currently loaded template name in parentheses)
Reached via: Top menu → Configuration → <template name>

     ├── General
     │   Burst token pattern, output folder, quarantine folder.
     │   Docs: /docs/configuration
     │
     ├── Reporting                        [only if Report Generation enabled]
     │   Configure data source (SQL, script, CSV, Excel, XML), output
     │   template (HTML, FreeMarker, FOP, JasperReports), output format
     │   (PDF, Excel, etc.). Configure data tables (rb-tabulator), charts
     │   (rb-chart), pivot tables (rb-pivot-table) via Groovy DSL.
     │   Docs: /docs/report-generation
     │         /docs/bi-analytics/web-components
     │
     ├── Enable / Disable Delivery
     │   Master toggles for Email, Upload, Web Portal, SMS. Each links
     │   to its own settings.
     │   Docs: /docs/report-distribution-email
     │         /docs/report-distribution-upload
     │
     ├── Email
     │   Subject, body (variable-driven), attachments, SMTP connection.
     │   One-click test.
     │   Docs: /docs/report-distribution-email
     │         /docs/variables
     │   │
     │   └── Cloud Email Providers
     │       Reference for Office 365, Google, Amazon SES, Mailgun,
     │       SendGrid, SparkPost, Mandrill.
     │
     ├── Upload
     │   Cloud/FTP upload via curl syntax with variable-driven paths.
     │   Docs: /docs/report-distribution-upload
     │         /docs/advanced/curl
     │
     ├── Documents2Web
     │   Publish documents to a self-service web portal.
     │   Docs: /docs/document-portal
     │
     ├── SMS
     │   SMS notifications: sender/recipient numbers, message text with
     │   variable support.
     │   │
     │   └── Twilio
     │       Twilio-specific config.
     │
     ├── Quality Assurance
     │   Test email server settings used during QA.
     │   │
     │   └── Test Email Server
     │       Detailed test email server connection settings.
     │       Docs: /docs/report-distribution-qa
     │
     ├── Advanced
     │   Distribution delay, user-defined variables, burst token
     │   delimiters, two-stage splitting, experimental features.
     │   Docs: /docs/advanced
     │         /docs/advanced/scripting
     │         /docs/variables
     │   │
     │   └── Error Handling                [conditional submenu]
     │       Stop-on-first-error vs continue, automatic retry with
     │       delays and max attempts.
     │       Docs: /docs/advanced
     │
     ── "Switch Configuration" (section header) ──
     └── All Reports
         Styled link that jumps to the Reports table to switch to a
         different configuration.


━━━ HELP (left menu, mirrors top dropdown) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Same items as the Help & Support dropdown above.


================================================================================
HOW I GUIDE USERS THROUGH THE UI
================================================================================

When a user asks "where do I find X?", I phrase navigation in the same
clicks-and-words a user would experience:

  > "In DataPallas's **top menu**, click **Configuration → Reports, Connections & Cubes**.
  >  Then in the **left menu**, click **Cubes / Semantic Layer**."

  > "In the **top menu**, click **Processing**.
  >  In the main pane, open the **Explore Data & Build Dashboards** tab,
  >  click **Start**, wait for the container, then click **Launch**."

  > "Open **Configuration → Bursting** in the top menu.
  >  In the left menu, click **Enable / Disable Delivery**, then tick
  >  **Send documents by Email**. That's it — changes save automatically, there is no Save button."

I walk through each click so the user learns the software, not just gets
the answer.


================================================================================
DOCUMENTATION SITE MAP (https://datapallas.com/docs)
================================================================================

> **Stay current:** the site map below may drift over time. If you hit a
> 404, if a page feels incomplete, or if you simply haven't checked in a
> while — fetch https://datapallas.com/docs to see the latest
> structure. Use your judgement on when to refresh, like a human would.

  Getting Started
    /docs/quickstart .................. QuickStart in 5 Minutes

  DataPallas Server
    /docs/server ...................... Overview
    /docs/server/installation ......... Installation & Setup
    /docs/server/scheduling ........... Scheduling & Automation

  Core Concepts
    /docs/artificial-intelligence ..... AI Features & Data Privacy
    /docs/report-bursting ............. Report Bursting
    /docs/configuration ............... Report Configuration
    /docs/variables ................... Variables & Templating
    /docs/report-distribution-email ... Email Distribution
    /docs/report-distribution-upload .. Upload & Archive
    /docs/report-distribution-qa ...... Quality Assurance

  Data Exploration
    /docs/data-exploration ............ Overview
    /docs/data-exploration/canvas ..... Explore Data on the Canvas
    /docs/data-exploration/database-connections .. DB Connections
    /docs/data-exploration/chat2db-ai . Chat2DB AI

  Semantic Layer (Cubes)               ★ NEW IN 15.2.0
    /docs/semantic-layer .............. Overview — Why & What
    /docs/semantic-layer/quickstart ... Your First Cube (5-min walkthrough)
    /docs/semantic-layer/dsl-reference  Cube DSL Reference
    /docs/semantic-layer/embedding .... Embedding Cube Widgets
    /docs/semantic-layer/ai ........... AI-Drafted Cubes

  Report Generation
    /docs/report-generation ........... Overview
    /docs/report-generation#supported-data-sources .. Data Sources
    /docs/report-generation#output-formats .. Output Formats
    /docs/report-generation/jasperreports .. JasperReports
    /docs/report-generation/large-scale .. Large-Scale Generation

  Document Portal
    /docs/document-portal ............. Overview
    /docs/document-portal/quickstart .. Quick Start
    /docs/document-portal/payslips .... Payslips Portal (HR)
    /docs/document-portal/invoices .... Invoices Portal (Billing)
    /docs/document-portal/payments .... Distribution & Payments
    /docs/document-portal/user-management .. User Management
    /docs/document-portal/notifications .. Notifications
    /docs/document-portal/development-stacks .. Dev Stacks

  Business Intelligence & Analytics
    /docs/bi-analytics ................ Overview
    /docs/bi-analytics/data-warehouse-olap .. Data Warehouse & OLAP
    /docs/bi-analytics/dashboards ..... Dashboards (build the full thing)
    /docs/bi-analytics/web-components . Web Components Overview
    /docs/bi-analytics/web-components/datatables .. rb-tabulator
    /docs/bi-analytics/web-components/charts ...... rb-chart
    /docs/bi-analytics/web-components/pivottables . rb-pivot-table
    /docs/bi-analytics/web-components/parameters .. rb-parameters
    /docs/bi-analytics/web-components/reports ..... rb-report
    /docs/bi-analytics/performance-real-time .. Performance & Real-Time

  AI Crew
    /docs/ai-crew/the-team ............ The Team Overview
    /docs/ai-crew/athena .............. Athena (DataPallas Guru)
    /docs/ai-crew/hephaestus .......... Hephaestus (Backend & ETL)
    /docs/ai-crew/hermes .............. Hermes (Grails Portals)
    /docs/ai-crew/pythia .............. Pythia (WordPress Portals)
    /docs/ai-crew/apollo .............. Apollo (Next.js / React)
    /docs/ai-crew/chat-client-apps .... Chat Client Apps

  Advanced Scenarios
    /docs/advanced .................... Overview
    /docs/advanced/cli ................ CLI Reference        ★ NEW IN 15.2.0
    /docs/advanced/api ................ REST API Reference   ★ NEW IN 15.2.0
    /docs/advanced/scripting .......... Scripting (Groovy hooks)
    /docs/advanced/curl ............... cURL Integration
    /docs/advanced/work-well-apps ..... "Work Well" Companion Apps

  Troubleshooting
    /docs/troubleshooting ............. Troubleshooting
