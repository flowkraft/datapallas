# DataPallas

All notable changes to this project will be documented in this file.

## 16.3.3 - 2026-07-09

### Added

- **Ask Athena about DataPallas itself — no database needed** — In Chat2DB you can now chat with Athena about how to use DataPallas — setting up and delivering reports, building dashboards, web portals, automation, troubleshooting, and more — without connecting a database first. Connect one and she'll answer questions about your data too, writing the query, running it, and explaining the results. She always knows which kind of question you're asking, so she won't try to run a database query when you're simply asking how something works.

### Fixed

- **The AI agents now set up reliably** — Setting up the Data Greeks (Athena and the rest of your AI crew) could previously fail for all of them at once. It now completes dependably and works with the latest AI models.

- **Athena's directions now match what you actually see** — Her guidance occasionally mentioned a screen or step that doesn't exist (such as a "Save" step, when DataPallas saves your changes automatically). She now uses the real screen and menu names and the correct steps, so you can follow along without getting lost.

- **Chat2DB shows all your databases, samples included** — The database picker in Chat2DB now lists every connection you have, including the ready-made sample databases, all ready to query.

- **"Update Agents" works from any screen** — You can start updating the agents from anywhere in the AI Hub, not only from the Agents page.

### Changed

- **A cleaner, clearer Chat2DB** — A refreshed look, with the "Chat2DB" and "Athena" labels in the DataPallas brand colour and Athena's portrait redrawn with nicer proportions. The welcome message now describes honestly everything DataPallas can do — reports, delivery and web portals, dashboards, and automation — and reassures you that Athena only ever sees your table and column names, never your actual data.

## 16.3.2 - 2026-06-29

### Added

- **Learn data hands-on with the built-in DataZeus lessons** — DataPallas now comes with **DataZeus**, a friendly way to *learn data skills like SQL by actually doing them*, not just reading about them. You work through small "fill-in-the-blank" exercises on a ready-made sample database and get instant feedback as each one goes from red to green — so the ideas really stick. Fresh lessons are added over time, and you can pull the latest ones whenever you like.

- **DuckDB is now available as a one-click extra utility** — On the **Docker / Extra Utilities** screen you'll find a new entry for **DuckDB**, alongside the other tools. Press **Install Now** to add it and **Uninstall Now** to remove it, the same easy way as the rest. DuckDB is a small, fast tool for querying and crunching data files (such as spreadsheets and exported data) right from your computer, without needing to set up a database server first.

## 16.3.1 - 2026-06-17

### Fixed

- **The "Reload" button on published dashboards is now visible** — On dashboards opened in a plain web page, the button you press to apply a filter (such as picking a different country) could appear blank and invisible, making it look like changing the filter did nothing. The button now shows up clearly, so you can pick a value, press **Reload**, confirm with **Yes**, and see the dashboard update.

- **Confirmed the Java & Chocolatey setup works end to end** — Our automated checks for the "Install Java" and "Install Chocolatey" steps now pass, confirming the guided setup runs smoothly from start to finish.

### Added

- **Install and uninstall extra utilities with one click** — On the **Docker / Extra Utilities** screen, each tool (Docker Desktop, Visual Studio Code, Apache Maven, WinMerge, Notepad++) now has an **Install Now** button when it isn't installed and an **Uninstall Now** button when it is. Pressing one asks for confirmation and then runs the installation (or removal) for you.

## 16.3.0 - 2026-06-09

### Fixed

- **The "Install Java" and "Install Chocolatey" buttons now work reliably** — Clicking these buttons now correctly starts the installation. Previously they could appear to do nothing when pressed.

- **Clear "please wait" feedback while installing** — When you start installing Java or Chocolatey, the button is now disabled and a spinning "Please wait while … is being installed" indicator appears, so you can tell the installation is in progress instead of wondering whether anything is happening.

- **No need to restart after installing Java or Chocolatey** — Once an installation finishes, DataPallas recognises the newly installed Java or Chocolatey on its own. After Java is installed it also starts up the parts that need Java and refreshes the screen automatically, so the application is ready to use without having to close and reopen it.

- **"Uninstall Chocolatey" no longer stops with an error** — Removing Chocolatey from within DataPallas previously could fail partway through. It now completes cleanly.

- **Terminal results no longer get overwritten** — When you run a command such as checking the Java version in the built-in terminal, its result now stays on screen instead of being briefly shown and then replaced.

## 16.2.0 - 2026-06-08

### Fixed

- **"Java not found / Install Java" message now appears correctly when Java is missing** — When Java was not installed, the Processing screen could come up blank instead of showing the expected "Java not found / Install Java" guidance. The screen now always loads and clearly tells you that Java is required and how to install it, even when the rest of the application can't start.

## 16.1.0 - 2026-06-02

### Changed

- **Complete modern theme-based UI overhaul** — Brand-new look across the entire application, with 35 built-in themes you can switch between in one click (light, dark, corporate, retro, cyberpunk, and more). Every screen — Processing, Configuration, Customer Portals, Explore Data — now shares a clean, modern visual system that adapts instantly to your chosen theme.

- **Improved REST & CLI interfaces** — Endpoint names, parameters, and command-line arguments now follow consistent naming patterns across both interfaces, so moving between them feels familiar. Existing integrations should require minimal changes.

- **Improved Explore Data & Build Dashboards capabilities** — Smoother widget interactions, better filter handling, more reliable auto-save and undo/redo, and tighter sync between the visual canvas and the DSL editor. Dashboards stay responsive even with many widgets on screen.

- **Improved Customer Portal sample apps** — The bundled Grails portal and Next.js admin sample have been refreshed with the same modern look and theme system as the rest of the application. Both remain ready-to-use starting points for building your own self-service portals.

## 15.2.0 - 2026-05-18

### Added

- **TimescaleDB starter pack** — New starter pack under the "timeseries" category.
  - **It's PostgreSQL with an extension** — same engine, same SQL, same drivers, same tooling. Anything that talks to Postgres talks to TimescaleDB. The extension adds time-series superpowers on top of vanilla Postgres; it doesn't replace it.
  - **It's built for time-series workloads** — append-only data, time-range queries, automatic partitioning by time, and built-in rollups (called *continuous aggregates*). 

- **Per-connection Seed Data tab** — Each connection has its own Seed Data tab where you can define and run your own custom schema and data scripts against any database connection. Bundled examples cover invoice seeding and wipe.

### Fixed

- **Various Data Canvas fixes** — Widget rendering, filter handling, auto-save, history/undo, and DSL editor sync.

## 15.1.0 - 2026-05-04

### Added

- **REST API for integration and automation** — All core operations (burst, generate, merge, license, connections) are now available as REST endpoints. Integrate DataPallas into your workflows, CI/CD pipelines, or custom applications using simple HTTP calls. Interactive documentation available at `/swagger-ui.html` when the server is running.

- **CLI and REST API documentation** — New documentation pages with ready-to-run examples for both the command line interface and REST API.

- **Explore Data Canvas** — Introduces a visual drag-and-drop canvas for building interactive data views and dashboards with charts, tables, pivot tables, and filters — all in one unified workspace.

- **Cube semantic layer** — Define dimensions, measures, and joins over your database tables in a reusable semantic layer. Cubes power queries across Data Canvas, dashboards, and reports, giving you a single source of truth for your business metrics.

### Changed

- **Product rebranded to DataPallas** — The product is now named DataPallas. All user-facing names, labels, splash screens, and the desktop executable (`DataPallas.exe`) reflect the new identity.

- **In-process job execution** — Burst, generate, and merge operations now run inside the server process instead of spawning a separate JVM via `reportburster.bat`. This eliminates the 2-3 second JVM startup overhead per job and provides more reliable status bar feedback.

- **Passwords encrypted at rest** — Database, email, and SMS passwords are now encrypted on disk (AES-256-GCM) and decrypted only at the exact moment they are needed (SMTP connect, JDBC connect, Twilio call), then cleared from memory immediately after.

## 14.5.0 - 2026-03-30

### Fixed

- **Docker — Pivot tables and DuckDB now work correctly** — Resolved a missing system library that prevented DuckDB-based features (like the Sales PivotTable sample) from running in Docker.

- **Docker — HTML templates now display in configuration** — Fixed an issue where the Output/Template editor appeared empty for report templates when running in Docker.

## 14.4.0 - 2026-03-23

### Added

- **Dashboards** — Build interactive dashboards combining charts, tables, pivot tables, and parameters in a single view. Select "Dashboard" as the datasource type and let the AI help you design the layout.

- **Share Dashboards** — Each dashboard gets a shareable URL. For example, use the `${dashboard_url}` variable in email templates to automatically send recipients a link to their live dashboard.

- **Database Table Picker for Scripts and Dashboards** — The database connection modal with table selection and AI generation now works for Script and Dashboard datasource types too, not just SQL queries.

- **AI-Assisted Dashboard Design** — Dedicated AI prompts guide you through creating polished, business-ready dashboards with coherent styling across all components.

## 14.3.0 - 2026-03-16

### Changed

- **Improved AI Prompts for HTML-to-PDF Reports** — The "Generate PDF Report (from HTML)" prompts now explicitly specify the HTMLToPDF rendering engine and its CSS 2.1 constraints, so the AI produces templates that render correctly on the first try — no more flexbox, CSS grid, or `calc()` that silently breaks in the PDF output.

- **Improved AI Prompts for XSL-FO Reports** — The "Generate PDF Report (from XSL-FO)" prompt now provides clearer data model guidance with concrete field name examples, helping the AI generate more accurate FreeMarker variable references.

- **Improved AI Prompts for Excel Reports** — The "Generate Excel Report" prompt now names the html-exporter engine and documents additional CSS capabilities (shorthand properties, style inheritance, style precedence), resulting in better-styled spreadsheet output.

- **Improved AI Prompts for JasperReports** — The "Generate JasperReports (.jrxml)" prompt now uses clearer, engine-agnostic language for describing the companion data script.

- **AI Prompts Now Include the Data Script** — All report generation prompts now automatically include the Groovy script or SQL query that produces the data, giving the AI full context to generate templates that match your actual data pipeline.

## 14.2.0 - 2026-03-10

### Added

- **JasperReports Support** — Full JasperReports (.jrxml) engine support as a built-in output type. Supports parameters, subreports, database connections, and all JasperReports export formats (PDF, Excel, CSV, HTML). Includes sample reports (Customer by Country, Employee Detail, Employee Roster).

- **Migrate Existing JasperReports in Seconds** — Already have `.jrxml` templates from Jaspersoft Studio, JasperReports Server, or a legacy system? Drop them into `config/reports-jasper/` and they run immediately. No rewriting, no conversion, no migration project — your existing reports work as-is.

- **Inline JasperReports** — Write .jrxml code directly in the configuration UI without creating external files. Select "JasperReports (.jrxml)" as the output type, choose "Write .jrxml code inline", and edit the report template in the built-in code editor.

- **Ad-hoc Reports from Form Parameters** — Generate reports using only user-provided parameter values — no database or file datasource needed. New sample `g-scr2pdf-adhoc` demonstrates building a report (e.g., employee badge card) entirely from form input.

- **Invoice Data Seeding for Load Testing** — Seed large amounts of invoice data (100 to 1,000,000+ rows) directly from the Starter Packs UI, generate reports against it, and measure actual throughput on your hardware. One-click "Wipe" to clean up without affecting sample data.

- **DataPallas Cookbook AI Skill** — New AI skill providing a catalog of working examples, sample configurations, Groovy scripts, and report templates as reference material.

- **UI & Docs Navigation AI Skill** — New AI skill for navigating DataPallas's UI screens and documentation.

### Changed

- **Guided Development Workflow — Phase 0 Project Setup** — The guided development AI skill now includes a Phase 0 that walks users through backing up the original playground, building on it, and cleaning up sample files only after custom features are working.

- **Test SQL Query — Improved compatibility** — Test SQL Query no longer wraps queries as subqueries, fixing compatibility issues with DB2 `CAST()` parameters and Oracle derived tables. All database engines now use direct `LIMIT`/`FETCH FIRST`/`OFFSET-FETCH` append instead. Also added automatic detection of user-provided limits to avoid double-limiting.

- **Updated AI Crew Knowledge** — Athena agent knowledge updated to cover JasperReports capabilities and new configuration options.

## 14.1.0 - 2026-03-02

### Added

- **New Tabulator, Charts and Pivot Tables Examples & Configuration** — Many new examples and configurations for tabulator tables, charts, and pivot tables

- **Redis Starter Pack** — Your Dashboards Are About to Get Faster.

### Changed

- **Test SQL Query — Fast preview for large datasets** — Test SQL Query now automatically wraps your SQL as a subquery with a database-specific row limit (e.g., `LIMIT 100`, `TOP 100`, `FETCH FIRST 100 ROWS ONLY`, `ROWNUM <= 100`), so even queries against tables with millions of rows return results in seconds. Supported across all database engines (PostgreSQL, MySQL, SQL Server, Oracle, DB2, SQLite, DuckDB, ClickHouse, Supabase).

- **View Data — Improved large dataset handling** — View Data in the Generate Reports screen now auto-injects client-side pagination (50 rows/page) and virtual DOM rendering, keeping the browser responsive even with large result sets. For truly massive datasets (millions of rows), configure `paginationMode: 'remote'` in the tabulator DSL to enable server-side pagination — the data grid then fetches pages on demand directly from the database.

- **Test Script / View Data — Performance drastically improved** — Test Script and View Data operations now complete in seconds even for very large datasets (tested up to 1 million rows).

- **Updated Documentation** — Documentation updated with examples and configurations for tabulator, charts, and pivot tables

## 13.3.0 - 2026-02-23

### Changed

- Updated documentation to reflect the latest developments
- Updated AI Crew agents knowledge to reflect the new DataPallas capabilities

## 13.2.0 - 2026-02-17

### Added

- **Northwind DB (Supabase) Starter Pack** — Supabase is the Postgres development platform. Start your project with a Postgres database, Authentication, instant APIs, Edge Functions, Realtime subscriptions, Storage, and Vector embeddings. Launch the full Supabase stack (13 services) directly from the Starter Packs UI.

- **dbt Core ETL Integration** — Transform raw OLTP data replicated into ClickHouse into a proper OLAP star schema (dimensional model) using [dbt Core](https://docs.getdbt.com/) with the [dbt-clickhouse adapter](https://github.com/ClickHouse/dbt-clickhouse)
  - Sample Northwind dbt project included: staging views, dimension tables (`dim_customer`, `dim_product`, `dim_employee`, `dim_time`), fact table (`fact_sales`), and analytical views (`vw_sales_detail`, `vw_monthly_sales`)
  - Dockerized — runs via `docker compose run dbt-transform run`
  - Completes the ELT pipeline: CDC sink connector handles Extract+Load, dbt handles Transform
  - See `db/CONFIGURE_ETL.md` for setup instructions

## 13.1.0 - 2026-02-16

### Added

- **Enhanced OLAP Analytics** — New pivot table analytics engines for enterprise-scale data analysis
  - **DuckDB Engine** — Fast in-process OLAP for instant client-side analytics on local datasets
  - **ClickHouse Engine** — High-performance columnar OLAP for real-time analytics on billions of rows;
  - CDC (Change Data Capture) sink connector for real-time data replication from your own OLTP databases 
  to ClickHouse (OLAP)
  
- **AI Assistants** — A powerful crew of AI agents to accelerate your work
  - **Athena** — DataPallas Guru & Data Modeling advisor; expert on all DataPallas features, report configuration, and schema design
  - **Hephaestus** — Automation & ETL specialist for building data pipelines and job workflows
  - **Hermes** — Grails Guru & Self-Service Portal advisor for GSP views, Groovy scripting, and portal best practices
  - **Apollo** — Next.js/React specialist for modern TypeScript/Tailwind dashboards and admin panels

- **Data Analysis Lab (Chat2DB)** — Chat with Athena to explore your databases using plain English
  - Connect to any configured database (PostgreSQL, MySQL, SQL Server, Oracle, SQLite, DuckDB, ClickHouse, and more)
  - Ask natural language questions — Athena generates SQL, executes it, and explains the results
  - Auto-generated charts and visualizations rendered inline alongside query results
  - Collapsible syntax-highlighted SQL blocks, result tables with row counts and execution times
  - Follow-up questions supported — refine queries, request different chart types, or drill deeper

- **AI Crew Chat** — A built-in web chat to message your AI assistants directly from the browser
  - Dedicated chat rooms for each agent — Athena, Hephaestus, Hermes, Apollo, and Pythia
  - Persistent, encrypted conversation history across sessions
  - Collaborate with multiple agents on different topics simultaneously

- **Next.js Document Portal Boilerplate** — A complete TypeScript/Next.js 15 + Tailwind 4 + shadcn starter template for building custom self-service portals
  - Modern React ecosystem alternative to the Grails/Groovy stack
  - Includes admin panel integration with Drizzle ORM
  - Ready-to-use components for payslips, invoices, and document distribution workflows

### Changed

- Reorganized Flowkraft apps folder structure for better organization
- Apps Manager UI now shows Grails apps (Admin & Webportal) as a consolidated entry with launch dropdown
- Updated port allocation with +10 gaps for flexibility (8480, 8490, 8500, 8510, 8520)

## 12.2.0 - 2026-01-12

### Added

- New 'embeddable analytics' web components rb-report, rb-tabulator, rb-chart, rb-pivottable, rb-parameters; embed DataPallas reports directly into your existing web applications and portals 
- Improved **Apps**
  - 'DataPallas Self Service Portal' is a fast way to build an Employee Portal / Customer Portal  / Partner Portal / Student Portal
  -  Use 'Flowkraft Frontend App' for creating custom dashboards & portals
  - 'Flowkraft Admin Panel App' can be used to easily build admin user interfaces on top of your business data
  - 'Flowkraft Backend App' can be used to quickly deploy / run automation flows across your business systems
- DataPallas can now create pivot tables

### Fixed

- Improved performance when loading many report configuration templates

## 12.1.0 - 2025-12-08

### Added

- New **Apps** Tab accessible via *Help* → **Apps / Starter Packs / Extra Utils** → *Apps* — 10 applications that complement DataPallas. **Docker must be installed & running for starting, stopping, or using these apps.**
  - DataPallas Portal
  - 3x FlowKraft apps (backend automation, admin-panel and frontend dashboards)
  - Rundeck - Runbook automation and job scheduling
  - CloudBeaver - Database management tool
  - Matomo - Web Analytics
  - Docuseal - Document Signing
  - Metabase - BI and visualization tool
  - Clickhouse - High-performance OLAP database
- Tabulator is now configurable via a simple and effective **Tabulator Options DSL**  
- DataPallas can now create charts (powered by **Chart.js**)
- User experience improvements
  - Added option to toggle (show/hide) the left navigation menu to increase usable screen space.
  - Main application window can now be maximized to use the full display area.
  - Email message editor supports manual resizing to provide a larger editing area.

## 11.4.0 - 2025-11-25

### Added

- UI configuration for AI Assistant URL — administrators can now set the AI Assistant endpoint in the Settings / Skins area (copilot URL).

### Fixed

- Improved splash screen feedback when launching DataPallas.exe — clearer progress and better status messages during startup.
- Improved Test SQL Query / Test Script / View Data preview feedback:
  - The UI now detects preview error payloads (ERROR_MESSAGE) and shows an error toast rather than a success message.
  - When errors occur, the Tabulator preview displays an inline ERROR_MESSAGE and the Errors Log Viewer is shown to make debugging easier.
  - “No data” (no burst tokens) is treated as an informational condition (logged at INFO/WARN and shown as a warning in the UI) instead of an application error, reducing noise in errors.log.
  
## 11.3.0 - 2025-11-17

### Added

- 'Oracle Database Server' is now a certified datasource for building reports
- New samples added (IDs and short descriptions):
  - GENERATE-STUDENT-PROFILES-SQL2PDF — 11. Generate Student Profiles (sql2pdf): individualized Student Profile PDFs (Sample Northwind SQLite). Demonstrates Apache FOP for pixel‑perfect PDF output.
  - GENERATE-CUSTOMER-STATEMENTS-SQL2HTML — 12. Generate Customer Statements (sql2html): mail‑merge one HTML file per customer from SQL datasource (example filenames: ALFKI.html, ...).
  - GENERATE-CUSTOMER-SALES-SUMMARY-SQL2XLSX — 13. Customer Sales Summary (sql2xlsx): single consolidated XLSX workbook with sales aggregated by customer.
  - GENERATE-CUSTOMER-INVOICES-MASTER-DETAILS-SCRIPT2HTML — 14. Generate Customer Invoices (script2html): scripted master/detail invoices, one HTML per OrderID (invoice_${OrderID}.html).
  - GENERATE-CATEGORY-REGION-CROSSTAB-SCRIPT2HTML — 15. Category-Region Crosstab (script2html): single consolidated crosstab HTML (CategoryRegionCrosstab.html).
  - GENERATE-MONTHLY-SALES-TREND-SCRIPT2HTML — 16. Monthly Sales Trend (script2html): single HTML time‑series sales trend (MonthlySalesTrend.html).
  - GENERATE-SUPPLIER-SCORECARDS-SCRIPT2HTML — 17. Supplier Scorecards (script2html): per‑supplier HTML scorecards (supplier_${burst_token}_scorecard.html).
  
## 11.2.0 - 2025-11-10

### Added

- Improved support for reporting across multiple database vendors

## 11.1.1 - 2025-09-29

### Added

- MariaDB starter pack Start/Stop
- DataPallas Portal

### Fixed

- Fix for 'Send Test Email'

## 11.1.0 - 2025-08-11

### Added

- New "AI powered" report generation flows
- SQL Queries and Scrips can now be used as input data source for report generation
- XML documents can now be used as input data source for report generation
- DataPallas can now generate XML, JSON and “pixel perfect” PDF documents (using XSL-FO)

## 10.3.0 - 2025-04-14

### Added

- Artificial Intelligence and LLM features assist in designing HTML report layouts
- DataPallas now generates reports (DOCX, PDF, XLSX, HTML) using (also) Excel files as the input data source
- The HTML editor and previewer have been enhanced to improve the report layout design process
- A new sample named "10. Generate Reports From Excel Data Source" is included

## 10.2.6 - 2025-03-18

### Added

- DataPallas now generates (also) Excel (.XLSX) reports
- A sample titled "9. Generate (Excel) Monthly Payslips" is available for users to quickly try it out

### Fixed

- "Samples -> Learn More -> View Configuration small issue"

## 10.2.5 - 2025-03-17

### Added

- "Samples/7. Generate (HTML) Monthly Payslips" for users to quickly "Try It"
- "Samples/8. Generate (PDF) Monthly Payslips" for users to quickly "Try It"

## 10.2.4 - 2025-02-25

### Fixed

- user-acceptance tests

## 10.2.3 - 2024-12-30

### Added

- Implement "TSV File (local file containing tab-separated values)" and
  "Fixed-Width File (local file containing fixed-width columns)" as
  reporting datasources

### Fixed

- 'Delete, Up, Down attachments buttons did not save the changes'
- 'Tomcat Exception when uploading files'
- 'Using Quality Assurance successively the 2nd, 3rd times the file comes
  as null in the input box (instead of the file selected for processing)'

## 10.2.2 - 2024-12-17

### Added

- "Samples/6. Generate Monthly Payslips" for users to quickly "Try It"

### Changed

- general API improvements
- SpringBoot upgrade from v2.5.8 to v2.7.18 (which comes with a newer and more secure version
  of the Apache log4j2 logging framework)

## 10.2.1 - 2024-07-01

### Added

- user-acceptance tests for validating that the packaged reportburster.zip and reportburster-server.zip
  work well

### Fixed

- 'Report Generation' which got broken since the new DataPallas Server release
- 'Let Me Update' which got broken since the new DataPallas Server release
- 'Chocolatey' and 'Java' (auto) installations, which got broken since the new DataPallas Server release

## 10.2.0 - 2024-05-21

### Added

- Install/run DataPallas under Linux (using Docker)

### Fixed

- call validateConfigurationValues() before processing any report
- HTML email messages now can “embed” images from websites, i.e. src="https://barefoot5k.com/wp-content/uploads/2014/12/pepsi-logo-300x204.png"
- fix "Send Test Email" functionality

## 10.1.0 - 2024-04-29

### Added

- New java server which replaces the old NodeJS API calls/functionality
- New DataPallas Server webapp UI having the same capabilities as DataPallas.exe

## 9.1.7 - 2024-02-19

### Added

- "Samples/5. Customer Invoices PDF - Merge and then Process Multiple Files Together" for users to quickly "Try It"

## 9.1.6 - 2024-02-05

### Added

- "Samples/4. Customers with Multiple Invoices (split only)" for users to quickly "Try It"

## 9.1.5 - 2024-01-24

### Added

- "Samples/3. Customer List/Country - split Excel file by distinct column values (split only)" for users to quickly "Try It"

## 9.1.4 - 2024-01-12

### Added

- "Samples/2. Split Excel File by Distinct Sheets (split only)" for users to quickly "Try It"

## 9.1.3 - 2024-01-10

### Added

- An easy way for users to onboard/tour/learn about DataPallas capabilities
- "Samples/1. Monthly Payslips (split only)" is the first of the "Samples" which users can quickly "Try It"

## 9.1.2 - 2023-12-22

### Changed

- DocumentBurster -> DataPallas product rename

## 9.1.1 - 2023-05-25

### Changed

- log4j v1 was updated to the latest log4j v2 (which comes with many security patches)

### Fixed

- View Emails button opens inside electron instead of the default browser (i.e. Chrome, Firefox, etc)
- logs folder could grow to hundreds of GBs (because of logs archiving)
- When submitting a job using the Web Console a null.progress was created instead of the expected job progress file

## 9.1.0 - 2023-05-17

### Added

- Initial support to generate reports
- Mail Merge emails from a CSV file data source
- Generate and/or email (as attachment) Microsoft Word (\*.docx) documents from a CSV file data source and a docx template
- Email connections can now be configured independently of the report definitions which
  means that the same email connection can be reused within different report configurations
- Users can now 'Request New Feature' using the user interface

### Fixed

- Small fixes related with the migrations of existing configuration files (and scripts)
  to the latest version

## 8.8.9 - 2022-12-14

### Added

- Increasing the main app's window (added almost 200px)
- Configuration 'Email Tuning -> Skip Sending Email (just log it)' graduated from the 'Incubating Feature' to being 'Feature Ready for Production'

### Fixed

- The Pause/Cancel buttons for stopping/cancelling of running jobs work better

## 8.8.8 - 2022-12-01

### Added

- Configuration 'Email Tuning -> Debug Email (produce more logging)' graduated from the 'Incubating Feature' to being 'Feature Ready for Production'

### Fixed

- Fixed an issue where the button 'Clear Logs' button could not be used for up to two minutes after the processing was finished

## 8.8.7 - 2022-09-13

### Added

- Configuration 'Custom Session Properties' graduated from the 'Incubating Feature'
  to being 'Feature Ready for Production'

## 8.8.6 - 2022-05-24

### Added

- Configuration 'Custom Email Headers' graduated from the 'Incubating Feature'
  to being 'Feature Ready for Production'

## 8.8.5 - 2022-03-14

### Added

- Configurations 'Delivery Receipt Address' and 'Delivery Receipt Name' graduated from the 'Incubating Feature'
  to being 'Feature Ready for Production'

## 8.8.4 - 2021-11-22

### Added

- Configurations 'Read Receipt Address' and 'Read Receipt Name' graduated from the 'Incubating Feature'
  to being 'Feature Ready for Production'

### Changed

- When Java is not already installed, DocumentBurster will install (by default) Java 8 with which it is confirmed to work. Until now the "latest" Java was installed and DocumentBurster might not always be tested against the "latest" version of Java (which is always changing)
- DocumentBurster was tested and confirmed to work with Java 8, Java 11, Java 14, Java 16 and the (current) latest Java 17 (Windows Services work on Java 8 32bit only)
- documentburster.properties was updated to better serve all the above supported Java versions
- System Diagnostics verifies JRE_HOME environment variable (required by DocumentBurster Web Console)

### Fixed

- The annoying "SSL Exception" which was coming when checking the license key
- DocumentBurster.exe works again on 32bit systems (some customers are still using
  32bit systems!)
- Few smaller fixes for the (automatic) DocumentBurster update process
- sortbyposition default configuration was changed from true to false in the file settings.xml - this seems to work better when parsing the vast majority of the PDF
  files and, for the few cases which not, the configuration remains available to be
  changed

## 8.8.3 - 2021-03-15

### Added

- Configurations 'Bounce To Address' and 'Bounce To Name' graduated from the 'Incubating Feature'
  to being 'Feature Ready for Production'

### Fixed

- Fix an issue when (auto) updating from v8.4 (issue#64)

## 8.8.2 - 2021-01-25

### Added

- Configurations 'Reply To Address' and 'Reply To Name' graduated from the 'Incubating Feature' to being 'Feature Ready for Production'

### Fixed

- sendfiles configurations are now correctly (auto) migrated / updated

## 8.8.1 - 2021-01-13

### Added

- (Advanced) configuration tab 'Email Address Validation' graduated from the 'Incubating Feature'
  to 'Feature Ready for Production'

### Fixed

- Rounded the number of seconds taken to update the software (display)

## 8.8.0 - 2020-12-28

### Added

- The software can now be easily updated without
  the user having to perform any manual (re)configuration work

### Changed

- Improved software changelog

### Fixed

- SSL error happening for some users when checking the license (issue#61)
- UI error happening when defining multiple configuration templates (issue#60)
- Java8 was not found even if it was correctly installed (issue#58)

## 8.7.1 - 2020-09-20

### Added

- New Feature - "Almost" automatic installation for the
  DocumentBurster's Java pre-requisite
- Fix encrypt.groovy, overlay.groovy and print.groovy
  issue#55

## 8.7.0 - 2020-08-16

### Added

- New Feature - Split2ndTime issue#49
- Fix for 'Error The Command Line is Too Long' issue#45
- Fix for Invalid email address 'tony@imi.solutions' issue#39
- Fix for 'Configure Email, Configure SMS, etc buttons are broken in the Enable / Disable Delivery Screen'
  issue#52

## 8.6.0 - 2020-04-12

### Added

- New Feature - Added support for FreeMarker templates and expressions
- Fix for 'Send Test Email' issue#46
- Fix for 'Send Test SMS' issue#46
- Fix for 'Number of user variables is always read from settings.xml
  even if it overridden in a custom template' issue#43

## 8.5.0 - 2020-01-05

### Added

- DocumentBurster.exe user interface technology stack was updated

## 8.4.0 - 2018-11-18

### Added

- Improved log visualization
- Burst statistics calculated for all the jobs
- Fix for a 'Send Test SMS Message' issue
- Java version 1.8 (or higher) is now required as a prerequisite

## 8.3.0 - 2018-01-15

### Added

- Certify DocumentBurster on Java 9
- Fix for a licensing related issue where a java HTTPS/ssl exception
  was coming on few computers were JRE Version 8 (Update 121) was running

## 8.2.0 - 2017-12-17

### Added

- New cloud upload support (i.e. Amazon S3, Microsoft Azure, Microsoft OneDrive, Google Storage, Google Drive, DropBox, Box)
- New Retry Policy feature to improve document delivery reliability for situations when the network / email has temporary failures
- Support for canceling / pausing / resuming running jobs

## 8.1.0 - 2017-10-29

### Added

- WYSIWYG email message editor with support for bold, italic, underline, ordered and un-ordered lists
- Support for sending reports to Microsoft SharePoint websites
- Support for sending reports to Drupal websites
- Support for sending reports to Joomla websites
- Support for additional cloud email providers - Office365, Google Apps, Amazon Simple Email Service, Mailgun,
  SendGrid, SparkPost, Mandrill, etc.
- Improved software resilience when exceptional email network situations occur
- Streamlined QA (quality assurance) mechanism
- Improved logging / tracing
- New and easier to use UI
- The new UI allows users to choose a preferred color scheme

## 7.5.0 - 2016-05-22

### Added

- Support for Microsoft Office 365

## 7.4.0 - 2016-02-21

### Added

- Mobile Responsive HTML Emails

## 7.3.0 - 2016-01-10

### Added

- SMS Documentation

## 7.2.0 - 2015-12-20

### Added

- Add SMS capability

## 7.1.0 - 2015-12-13

### Added

- Software Licensing

## 6.4.1 - 2015-11-29

### Added

- Package rename smartwish to sourcekraft

## 6.4.0 - 2015-10-11

### Added

- user/password security support in the Web Console

## 6.3.5 - 2015-09-23

### Added

- Improved support for
  images in HTML emails
- fix for a Send Test Email/configuration template
  combination which was not working properly

## 6.3.4 - 2015-09-20

### Added

- new parsePageTokens.groovy which makes
  the burst tokens parsing customizable

## 6.3.3 - 2015-05-24

### Added

- Slim down/clean unused dependencies

## 6.3.2 - 2015-05-12

### Added

- Further improvements/integration between the existing Quality Assurance
  mechanism and the new Email Tester capability
- New "Send Test Email" buttons to check email server connections

## 6.3.1 - 2015-04-07

### Added

- New advanced configuration Delay Each Distribution By x seconds
- Documentation for the new Email Tester capability

## 6.3.0 - 2015-03-29

### Added

- tools/email-tester
- tools/remote-access
- tools/text-editor

## 6.2.1 - 2015-02-28

### Added

- Closing [#53] distributeReportErrorHandling.groovy
  is not executed when an invalid email address is provided
  http://sourceforge.net/p/documentburster/bugs/53/
-     Closing [#52] invalid-character-in-file-names -
  http://sourceforge.net/p/documentburster/bugs/52/

## 6.2.0 - 2014-06-01

### Added

- Closing issue [#47] - Fix "Larger Message" screen on laptop
  http://sourceforge.net/p/documentburster/bugs/47/
- Closing issue [#48] - Fix "About" screen on laptop
  http://sourceforge.net/p/documentburster/bugs/48/
- Closing issue [#49] - Email validation situation
  http://sourceforge.net/p/documentburster/bugs/49/
- Closing issue [#50] - Why did it not continue to burst the file when validation was turned off?
  http://sourceforge.net/p/documentburster/bugs/50/
- Closing issue #51- Semi-colon separator replaced with ? when having a list of email addresses in a variable
  http://sourceforge.net/p/documentburster/bugs/51/

## 6.1.7 - 2013-10-29

### Added

- Fix an issue with Windows 7/JRE7 email
- Fix a GUI cropping issue
- Replaced Spring Batch WEB Admin dependency from the 1.3.0-SNAPSHOT to the 1.2.2.RELEASE stable version

## 6.1.6 - 2013-09-09

### Added

- Documentation is now available in HTML format also
- Closing issue [#42] -
  https://sourceforge.net/p/documentburster/bugs/

## 6.1.5 - 2013-07-09

### Added

- Improvements to the dependency management
  mechanism
- Upgrade the dependencies to the latest version

## 6.1.4 - 2013-06-25

### Added

- Closing issues [#16], [#40], [#41] -
  https://sourceforge.net/p/documentburster/bugs/

## 6.1.3 - 2013-06-11

### Added

- Closing few small issues [#8], [#35], [#36], [#37], [#38] -
  https://sourceforge.net/p/documentburster/bugs/
- HSQLDB upgraded to v2.2.9

## 6.1.2 - 2013-04-22

### Added

- Improved error handling capabilities

## 6.1.1 - 2013-01-29

### Added

- Fixes

## 6.1.0 - 2013-01-13

### Added

- Documentation was updated to cover the latest quality assurance
  capability

## 5.8.1 - 2012-12-09

### Added

- Quality Assurance - New Capability

## 5.8.0 - 2012-11-18

### Added

- Documentation was updated to reflect the latest
  capabilities introduced in v5.7.9

## 5.7.9 - 2012-10-28

### Added

- Better cURL Integration (FTP, FTPS, FileShare, SFTP and HTTP/WebDAV are now all supported through the GUI)
- GUI Improvements

## 5.7.8 - 2012-10-08

### Added

- Configuration Templates 2 - Documentation

## 5.7.7 - 2012-09-19

### Added

- Configuration Templates 1 - Initial release with the 'Configuration Templates' functionality

## 5.7.6 - 2012-07-17

### Added

- Fixed SF defect ID 3516416 'Java remains hanging when email is misconfigured'
- Fixed SF defect ID 3523588 'Web Console Windows Service should depend on Server Service'

## 5.7.5 - 2012-06-12

### Added

- A new "Advanced Settings" GUI screen
  to allow to view/modify the current XML-only "advanced" settings

## 5.7.4 - 2012-06-06

### Added

- New feature(ID 3421920) implemented -
  Make the burst tokens separators configurable - ID: 3421920

## 5.7.3 - 2012-05-29

### Added

- Further capabilities to burst legacy reports
  which cannot be modified to include burst meta-data
- New fetch_distribution_details_from_csv_file.groovy
  script which can be used to fetch burst information from
  external files
- New fetch_distribution_details_from_database.groovy
  script which can be used to fetch burst information from
  external databases

## 5.7.2 - 2012-05-22

### Added

- A new feature was introduced
  to burst legacy reports which don't
  contain any bursting meta-data (burst tokens)

## 5.7.1 - 2012-05-20

### Added

- A new test case for bursting based on multiple tokens

## 5.7.0 - 2012-05-17

### Added

- New sample script (batch-pdf-print.groovy) to silently batch
  print the burst reports

## 5.6.9 - 2012-05-15

### Added

- Bug fixing

## 5.6.8 - 2012-05-08

### Added

- This release is coming with an improved and faster method
  for splitting Excel reports

## 5.6.7 - 2012-04-29

### Added

- This release contains a small fix

## 5.6.6 - 2012-04-26

### Added

- Bug Fixes

## 5.6.5 - 2012-04-24

### Added

- This version contains few small fixes

## 5.6.4 - 2012-04-22

### Added

- Documentation for the newly added capability of 'Attachments'
- Updated documentation for the improved upload capability
- GUI was updated to reflect the improved upload capability

## 5.6.3 - 2012-04-19

### Added

- This is a bug fixing release

## 5.6.2 - 2012-04-15

### Added

- This version contains various documentation
  improvements

## 5.6.1 - 2012-04-11

### Added

- This version contains a small fix
  for the new 'attachments' functionality

## 5.6.0 - 2012-04-09

### Added

- New feature(ID 3398253) implemented -
  Attach a file (the pdf onetoo) to email based on a variable.

## 5.5.9 - 2012-04-01

### Added

- Documentation Improvements

## 5.5.8 - 2012-03-29

### Added

- Small Excel issue fix

## 5.5.7 - 2012-03-27

### Added

- Further Bug Fixes

## 5.5.6 - 2012-03-25

### Added

- Bug Fixes

## 5.5.5 - 2012-03-22

### Added

- Documentation Improvements

## 5.5.4 - 2012-03-20

### Added

- Further Excel fixes

## 5.5.3 - 2012-03-18

### Added

- Fix an Excel related issue

## 5.5.2 - 2012-03-15

### Added

- Documentation Improvements

## 5.5.1 - 2012-03-13

### Added

- Bug Fixes

## 5.5.0 - 2012-03-11

### Added

- Bug Fixes

## 5.4.9 - 2012-03-08

### Added

- One small bug was fixed

## 5.4.8 - 2012-03-06

### Added

- Bug Fixes

## 5.4.7 - 2012-03-04

### Added

- Documentation Improvements

## 5.4.6 - 2012-03-01

### Added

- Small Features Improvements

## 5.4.5 - 2012-02-28

### Added

- Bug-fixes

## 5.4.4 - 2012-02-23

### Added

- Bug-fixes

## 5.4.3 - 2012-02-21

### Added

- Bug-fixes

## 5.4.2 - 2012-02-19

### Added

- Request 3488527 was implemented - Keep bursting order the same with the original report

## 5.4.1 - 2012-02-16

### Added

- Request 3000590 was implemented - Use a burst token until it is replaced

## 5.4.0 - 2012-02-14

### Added

- Bug-fixes

## 5.3.9 - 2012-02-12

### Added

- Documentation Improvements 12 - Advanced report delivery scenarios, Chapter 1. Introduction
- Documentation Improvements 12 - Advanced report delivery scenarios, Chapter 3. cURL integration

## 5.3.8 - 2012-02-07

### Added

- Documentation Improvements 11 - User Guide, Appendix B - SharePoint Report Delivery
- Documentation Improvements 11 - User Guide, Appendix C - DocumentBurster Performance

## 5.3.7 - 2012-02-05

### Added

- Documentation Improvements 10 - User Guide, Appendix A - How to Do This and That
- Documentation Improvements 10 - User Guide, Appendix D - Troubleshooting

## 5.3.6 - 2012-01-30

### Added

- Documentation Improvements 9 - User Guide, Chapter 6. Command Line
- Documentation Improvements 9 - User Guide, Chapter 7. Auditing & Tracing
- Documentation Improvements 9 - User Guide, Chapter Chapter 8. DocumentBurster Server

## 5.3.5 - 2012-01-25

### Added

- Documentation Improvements 8 - User Guide, Chapter 5. Variables
- User Guide, Chapter 6. Automatic Polling for Incoming Reports

## 5.3.4 - 2012-01-23

### Added

- Documentation Improvements 7 - User Guide, Chapter 4. Distributing Reports

## 5.3.3 - 2012-01-18

### Added

- Documentation Improvements 6 - User Guide, Chapter 3. Bursting Excel Reports

## 5.3.2 - 2012-01-15

### Added

- Fix for case 3472385 - Support polling for files with uppercase PDF extension
- Documentation Improvements 5 - User Guide, Chapter 2. Bursting and Merging PDF

## 5.3.1 - 2012-01-08

### Added

- New sample script (ant-mail.groovy) for sending ad-hoc email
- New sample script (skip-current-file-distribution-if.groovy) to support
  advanced conditional report delivery scenarios
- Documentation Improvements 4

## 5.3.0 - 2012-01-01

### Added

- Upgrade to HSQLDB 2.2.6
- Documentation Improvements 3

## 5.2.9 - 2011-12-25

### Added

- Fix for 3433637 - Small Web GUI incompatibility with IE9
- Documentation Improvements 2

## 5.2.8 - 2011-11-07

### Added

- Fix for 3421943 - Zip the program files in a common parent folder
- Fix for 3421945 - Documentation improvements 1

## 5.2.7 - 2011-10-31

### Added

- Documentation improvements
  1.1 - Audit chapter from the user guide was updated
  with the latest changes to the software
  1.2 - New chapter which describes how to set up
  a performance monitoring system for the report distribution

## 5.2.6 - 2011-10-23

### Added

- Following two new sample scripts are available
  add_and_format_page_numbers.groovy
  merge_with_external_files.groovy

## 5.2.5 - 2011-10-17

### Added

- Further performance improvements

## 5.2.4 - 2011-10-13

### Added

- This release is adding support for profiling
  the system performance in production (through JIP integration)
- Various performance improvements

## 5.2.3 - 2011-10-10

### Added

- Performance 1 - This release is adding support for gathering
  production performance statistics (through perf4j integration)

## 5.2.2 - 2011-10-02

### Added

- This release is adding support for doing concurrent
  report distribution

## 5.2.1 - 2011-09-25

### Added

- This release is adding support for profiling the application performance

## 5.2.0 - 2011-09-18

### Added

- This release is adding support to
  burst and distribute JD Edwards reports through email, FTP
  and file share

## 5.1.9 - 2011-09-15

### Added

- This release is adding support to
  burst and distribute Microsoft Dynamics reports through email, FTP
  and file share

## 5.1.8 - 2011-09-13

### Added

- This release is adding support to
  burst and distribute BIRT reports through email, FTP
  and file share

## 5.1.7 - 2011-09-11

### Added

- This release is adding support to
  burst and distribute Pentaho reports through email, FTP
  and file share

## 5.1.6 - 2011-09-07

### Added

- This release is adding support to
  burst and distribute Lewis PAY-PACK Payroll software reports through email, FTP
  and file share

## 5.1.5 - 2011-09-04

### Added

- This release is adding support to
  burst and distribute MYOB reports through email, FTP
  and file share

## 5.1.4 - 2011-09-01

### Added

- This release is adding support to
  burst and distribute QlikView reports through email, FTP
  and file share

## 5.1.3 - 2011-08-30

### Added

- This release is improving the
  QuickStart and the User Guide documents

## 5.1.2 - 2011-08-28

### Added

- This release is upgrading the Maven
  build to work with Maven 3

## 5.1.1 - 2011-08-25

### Added

- This release is improving the documentation
  which describes how to burst and distribute Microsoft Excel reports
  through email, FTP and file share

## 5.1.0 - 2011-08-23

### Added

- This release is adding support to
  burst and distribute Microsoft Excel reports through email, FTP
  and file share

## 4.6.9 - 2011-08-21

### Added

- This release is adding support to
  burst and distribute Microsoft Access reports through email, FTP
  and file share

## 4.6.8 - 2011-08-19

### Added

- This release is adding support to
  burst and distribute SQL Server Reporting Services reports through email, FTP
  and file share

## 4.6.7 - 2011-08-14

### Added

- This release is adding support to
  split and deliver JasperReports reports through email, FTP and to shared folders

## 4.6.6 - 2011-08-10

### Added

- This release is adding support to
  burst and distribute Cognos reports through email, FTP and to SharePoint sites

## 4.6.5 - 2011-08-07

### Added

- This release is adding support to
  burst and deliver SAP reports by email and FTP

## 4.6.4 - 2011-08-03

### Added

- This release is adding support to
  burst and upload Oracle Hyperion reports through SFTP

## 4.6.3 - 2011-07-31

### Added

- This release is adding support to
  burst and distribute Crystal Reports documents to SharePoint sites

## 4.6.2 - 2011-07-27

### Added

- This release is adding support to
  burst and distribute SAGE reports by FTPs

## 4.6.1 - 2011-07-24

### Added

- This release is adding support to
  upload PeopleSoft reports by FTPs

## 4.6.0 - 2011-07-19

### Added

- Bug-fixes

## 4.5.9 - 2011-07-17

### Added

- This is a maintaince release with
  documentation improvements

## 4.5.8 - 2011-07-14

### Added

- This is a regular maintaince release

## 4.5.7 - 2011-07-10

### Added

- Bug fixes

## 4.5.6 - 2011-07-05

### Added

- More documentation improvements

## 4.5.5 - 2011-07-04

### Added

- Documentation improvements

## 4.5.4 - 2011-06-30

### Added

- ant_vfs.groovy sample script
  provided to upload the output burst files using
  Commons VFS - http://commons.apache.org/vfs/index.html

## 4.5.3 - 2011-06-28

### Added

- ant_ftp.groovy and ant_scp_sftp.groovy sample scripts
  provided to upload the output burst files to FTP and or SFTP/SCP
  remote server locations.
- Documentation improvements with two separate help
  documents, one for common day to day report distribution scenarios
  and another one for more complex requirements
  (reports-distribution-manual.pdf and advanced-report-delivery.pdf).

## 4.5.2 - 2011-06-26

### Added

- Fix for bug 3333739 - High CPU usage
- copy_shared_drive.groovy sample script to
  copy the burst reports to shared drive.

## 4.5.1 - 2011-06-23

### Added

- cURL 2 - Better cURL integration support and cURL
  documentation support.
- curl_ftp.groovy and curl_sftp.groovy sample scripts are
  now provided with the package.

## 4.5.0 - 2011-06-21

### Added

- cURL 1 - Initial integration of cURL.

## 4.4.4 - 2011-06-19

### Added

- Documentation improvements with a more
  clear quick start guide and trouble shooting section.

## 4.4.3 - 2011-06-16

### Added

- 3317807 - SharePoint 1 - SharePoint email distribution
- The 'validatemailaddresses' true/false configuration was
  introduced to allow for less strict email address validation.

## 4.4.2 - 2011-06-14

### Added

- Various bug-fixes

## 4.4.1 - 2011-06-09

### Added

- Documentation improvements

## 4.4.0 - 2011-06-05

### Added

- 3301393 - Run DocumentBurster as a Windows Service

## 4.3.3 - 2011-04-19

### Added

- 3285201 - Add support to print the output reports

## 4.3.2 - 2011-04-17

### Added

- Provide a sample script to execute external programs
  during the report bursting life cycle

## 4.3.1 - 2011-04-14

### Added

- 3174511 - Add report stamping support
- Build system improvements 4 - Improve the documentation build

## 4.3.0 - 2011-04-11

### Added

- 3244901 - Add support for sending HTML based emails
- 3243463 - Make the number of variables configurable
- Fix the FindBugs reported instances

## 4.2.3 - 2011-04-03

### Added

- 3174510 - Add report encryption support
- 3174512 - Add electronic signature report support

## 4.2.2 - 2011-03-29

### Added

- Build system improvements 3 - Maven support

## 4.2.1 - 2011-03-23

### Added

- Build system improvements 2

## 4.2.0 - 2011-03-21

### Added

- Build system improvements 1
- Upgrade HSQLDB to version 2.1
- Fix for bug 3232337 - Out of memory error in the Server

## 4.1.3 - 2011-02-28

### Added

- Various documentation improvements

## 4.1.2 - 2011-02-22

### Added

- Fix for bug 3182235 - DocumentBurster fails on Ubuntu
- User Guide updated with more "Trouble Shooting" items
- QuickStart document updated pre-requisites to make Java 1.6 mandatory
- Combined the separate Unix and Windows archive files for a single unitary ZIP file targeting
  both platforms

## 4.1.1 - 2011-02-14

### Added

- Fix for bug 3163238 - Sometimes variables are not properly filled
- Fix for bug 3177540 - Web - Console is failing on Java 1.5
- User Guide updated with 'Chapter 7 - DocumentBurster Server\Windows - Run DocumentBurster Server at system startup'
  paragraph

## 4.1.0 - 2011-02-07

### Added

- DocumentBurster Server released as open source

## 3.2.1 - 2011-01-04

### Added

- Fix for bug 3151775 - Email template file which is saved does not appear

## 3.2.0 - 2010-12-28

### Added

- FTP GUI support
- Add the possibility to configure Email Connection settings using variables
- Make default email to, cc, bcc configurable through variables
- Load/Save email message templates

## 3.1.2 - 2010-12-04

### Added

- Documentation Improvements

## 3.1.1 - 2010-11-30

### Added

- Introduce the GNU AFFERO GENERAL PUBLIC LICENSE 3 licensing
- Documentation improvements
- GUI improvements
- Site improvements

## 3.1.0 - 2010-11-24

### Added

- Add support for Groovy scripting, Ant, AntBuilder
  and Common VFS
- Upgrade of runtime dependencies

## 2.5.1 - 2010-11-20

### Added

- Bug and documentation fixes

## 2.5.0 - 2010-11-17

### Added

- Add support for user-defined variables

## 2.4.1 - 2010-11-06

### Added

- Various Bug fixes

## 2.4.0 - 2010-10-28

### Added

- Add support for a series of built-in variables

## 2.3.0 - 2010-10-19

### Added

- GUI issues on UNIX/Ubuntu
- Broken functionality on Unix/Ubuntu

## 2.2.0 - 2010-10-16

### Added

- Configurable backup folder
- Polling - configurable polling folder

## 2.1.0 - 2010-08-28

### Added

- Deployed the GUI with .Net mono framework.
- Even more changes in order to make
  the DocumentBurster better GPL aligned.

## 1.3.2 - 2010-07-06

### Added

- Changes in order to make
  the APP better GPL aligned.

## 1.3.1 - 2010-06-07

### Added

- DocumentBurster.sh UNIX shell script was
  created and tested under Ubuntu.

## 1.3.0 - 2010-05-30

### Added

- All the files related operations
  were changed to use the Commons FileUtils library.

## 1.2.0 - 2010-05-26

### Added

- Give commercial support for DocumentBurster
- open source GPLv3 will continue to be supported.

## 1.1.0 - 2010-05-23

### Added

- Further improved user guide.

## 0.9.8 - 2010-05-19

### Added

- Improved user guide documentation.

## 0.9.7 - 2010-04-13

### Added

- Bug Fixes.
- Failed jobs are not hanging any more. The job file is deleted in case
  of an error.
- While bursting the PDF random FileNofFoundException was coming. The problem
  is fixed.
- Code Formatting.

## 0.9.6 - 2010-03-30

### Added

- Support for sending mails to multiple recipients was added.
  Go in the config/settings.xml and check the <destinations> tag.
  Check the already existing commented email destination token="sampleEmailToken".
  By using the same template you can define your own email destinations to
  be used by DocumentBurster for sending the e-mails to multiple recipients.
  Please make sure you will not corrupt the settings.xml file and that
  your new destinations will be uncommented(should not be between
  <!-- -->).
  In the PDF file - instead of using the direct email address tokens
  ( eg. {john.george@yahoo.com} ) - Which results in sending the e-mails to a single address,
  you will need to use the destination tokens - ( eg. {sampleEmailToken} ).
  This way DocumentBurster will know to send the email
  to all the recipients defined for the sampleEmailToken destination.

## 0.9.5 - 2010-03-28

### Added

- Quarantine status is shown in the main status bar.
- 'View Bursted Files' button was added close to the 'Burst PDF'
- 'View Quarantined Files' was added in the 'View' menu

## 0.9.4 - 2010-03-25

### Added

- Open any bursted file with Acrobat Reader then goto File -> Properties...
  Following PDF document properties are now updated
  a) Application and PDF Producer updated with DocumentBurster
  b) Keywords updated with the token used to generate the document.
- The name of the bursted documents was changed to be more simple and more
  meaningful.

## 0.9.3 - 2010-03-22

### Added

- GUI was re-organized.
  Under the new 'View' menu entry you can find the output which is being
  generated by the program.
- View -> View Bursted Files will open a folder where all the bursted files are saved
- View -> View Current Log File will open the DocumentBurster log file
- View -> View All Logs will open a folder where all the log files are located.

## 0.9.2 - 2010-03-18

### Added

- 'Burster' - > 'View Bursted Files' will open the folder
  where the files are bursted.

## 0.9.1 - 2010-03-17

### Added

- 'output' was made the default bursting folder.
- better logging.

## 0.9.0 - 2010-03-14

### Added

- All the dependencies were upgraded to the latest.

## 0.0.8 - 2008-11-14

### Added

- Log support was added through Log4j.
- Output folder for the bursted files is now configurable
- GUI was improved
- Bug fixes
- Now DocumentBurster is working in Java5 environments
  (Previous versions where running in Java6 only)
- Bug Fixes.

## 0.0.8 - 2008-11-14

### Added

- Log support was added through Log4j.
- Output folder for the bursted files is now configurable
- GUI was improved
- Bug fixes
- Now DocumentBurster is working in Java5 environments
  (Previous versions where running in Java6 only)
- Bug Fixes.

## 0.0.6 - 2008-05-04

### Added

- Adding logging support using apache commons-logging.

## 0.0.5 - 2008-04-30

### Added

- Minor Fixes.

## 0.0.4 - 2008-04-28

### Added

- Added 'Give Your Feedback' option. Please
  feel free to use it and tell about DocumentBurster.

## 0.0.3 - 2008-02-02

### Added

- Added GUI (DocumentBurster.exe) for the program. Now most of
  the important settings can be edited through the GUI.

## 0.0.2 - 2008-01-26

### Added

- Scheduling support. Simple or complex burst schedules can be defined in config/quartz-jobs.xml file.

## 0.0.1 - 2008-01-20

### Added

- Support for Email Sender. SMTP servers supported. Yahoo STMP and Gmail SMTP are also supported.
- Support for FTP Sender.
