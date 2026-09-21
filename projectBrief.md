# DataPallas — Project Brief

Functional Overview
- DataPallas: AI-assisted, automated report generation, bursting, and distribution for business documents.
- Capabilities:
  - AI-driven report definition: describe what you need and AI generates the report definition — no coding, no SQL, no template design required.
  - Flexible inputs/outputs: connect to databases, Excel/CSV/XML and export to PDF, Excel, Word, HTML, JSON, etc.
  - Automated bursting & personalization: split and personalize documents per recipient with rules and scheduling.
  - Multi-channel delivery: email, web portal, file sharing, or cloud services.
  - Self-service portal: users can access documents, manage accounts, and make payments.
- Benefits: quick to start, scalable, enterprise-grade reliability, and built-in quality assurance.

Components

1. asbl

- Assembling layer: contains the assembling code that puts the parts together, creates package artifacts and ZIP distributions (e.g. datapallas.zip, datapallas-server.zip); main classes include AbstractAssembler, NoExeAssembler, DataPallasAssembler, DataPallasServerSpringBootAssembler, DataPallasSourceAssembler. Packaging/test scripts include pack-datapallas.bat and pack-prepare-for-e2e.bat. 

- UAT scripts: inside asbl/src/uat there are Robot Framework (Python) scripts that run User Acceptance Tests against the final packages (datapallas.zip, datapallas-server.zip) to prove the packages work.

- Inside asbl/docker are scripts to build and deploy the app using Docker.

2. bkend
- Multi-module Maven backend: contains the Java code for reporting and related services.
  - bkend/common: shared utilities used by other modules. The package com.sourcekraft.documentburster.common.db contains database utilities, including the capability to prepopulate the Northwind sample schema and data.
  - bkend/reporting: the main reporting implementation. Key report-generation classes follow the chain AbstractBurster -> AbstractReporter -> SqlReporter / ScriptedReporter / CsvReporter / XmlReporter, and key bursting classes include PdfBurster and PoiExcelBurster.
  - bkend/reporting also includes an extensive test suite (400+ jUnit tests) that verifies the core reporting functionality.
  - bkend/server: Spring Boot REST and WebSocket API used by the frontend (the server the Angular frend talks to).
  - bkend/update: code for the auto-update capability.

3. frend
- frend/reporting: main Angular UI webapp (also compiled as an Electron desktop app).
- frend/rb-webcomponents: Svelte project that builds the embeddable web components used by DataPallas: rb-tabulator (data tables, wraps https://tabulator.info), rb-chart, rb-pivot-table, rb-report, rb-parameters, rb-filter-pane, rb-cube-renderer, rb-detail, rb-gauge, rb-map, rb-progress, rb-sankey, rb-trend and rb-value.
- UI communication: Angular app talks to bkend/server over REST and WebSocket.
- Dual deployment: almost the same source is built and deployed both as an Electron desktop app and as a normal Web App.
- E2E tests: frend/reporting/e2e contains an exhaustive set of 100+ Playwright end-to-end tests that validate main use cases; the same tests run against both the Electron app and the Web App.

Package scripts (package.json)
- build:prod
  - Builds the frontend for production (useful to catch Angular compilation issues early).
- custom:start-server-and-e2e-electron
  - Starts the backend/server and runs the full E2E suite (Electron). Note: the full run takes many hours.
- custom:start-server-and-e2e-web
  - Starts the backend/server and runs the full E2E suite against the web app (same 100+ Playwright tests).
- custom:e2e-rename-ts2ignore
  - Helper to rename many .spec.ts tests to .spec.ignore (e.g. renamer --find .spec.ts --replace .spec.ignore **) so you can run only a small subset by renaming back the specific .spec.ts files you want to execute.
- custom:e2e-rename-robot2ignore
  - Similar helper for Robot Framework UAT scripts to run a subset of UAT tests quickly.
- custom:compile-and-stage-backend-jars
  - Compiles backend modules and stages the jars used by the frontend/packaging steps.
- custom:compile-and-stage-web-components
  - Builds the frend/rb-webcomponents Svelte web components and stages them for the app, the e2e testground and packaging.

Release verification flow (minimal)
- Run build:prod and compile-and-stage scripts to produce fresh frontend and backend artifacts.
- Run the subset of E2E tests you need during development (using the rename helpers to limit the test set).
- For release: run the full 100+ Playwright E2E suite (Electron or Web) and the Robot Framework UATs.
- After all tests pass, run asbl/pack-datapallas.bat to create datapallas.zip and datapallas-server.zip.
- Execute asbl/src/uat/run-tests.bat against the generated ZIPs to validate final packages before uploading/releasing.

- IMPORTANT: Above all, simplicity and pragmatism trump everything: whether proposing design options or writing code, aim for the most straightforward, to‑the‑point solution that gets the job done. Change only what is strictly required for the task, avoid touching unrelated lines or files, and always ask one more time "could this be done even simpler?"