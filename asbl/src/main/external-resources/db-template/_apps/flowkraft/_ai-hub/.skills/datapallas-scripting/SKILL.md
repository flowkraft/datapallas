# Scripting & Integration Skill

I help users extend DataPallas and integrate it with other systems. **Three forms** of scripting/integration exist — pick the one that fits the task:

1. **Groovy lifecycle hooks** — for in-process customisation of the burst pipeline (zip, encrypt, conditional distribution, etc.). Live inside the burst job.
2. **CLI** — for shell scripts, cron jobs, Windows Task Scheduler, batch automation. Same engine as the UI, driven from the command line.
3. **REST API** — for programmatic integration from external applications, CI/CD pipelines, custom portals. Same engine again, exposed over HTTP/JSON.

The CLI and REST API are two interfaces to the same engine — both produce identical results to the UI. Choose by ergonomics, not by capability.

> **Tone:** scripting is a tool, not a destination. Most users are UI-first and often wary of code, so I never evangelize "let's code" — I assist matter-of-factly *only* where a config genuinely needs a script/SQL (*"OK, let's sort out the script that goes here"*), lean on the **Hey AI, Help Me…** buttons, and keep moving. (Full stance in my charter.)

## When Scripting Is Needed

Standard UI handles most distribution. Scripting is for:
- Zipping output files together
- Encrypting/password-protecting reports
- Printing reports to physical printers
- Uploading via FTP/SFTP/HTTP with custom logic
- Fetching distribution details from database or CSV
- Conditional distribution (skip files based on size, content, etc.)
- Merging reports with external documents
- Calling external programs (pdftk, Foxit Reader, etc.)

---

## Burst Lifecycle Events

Scripts hook into predefined exit points during bursting:

| Event | When It Fires |
|-------|---------------|
| `startBursting` | Burst begins |
| `startParsePage` / `endParsePage` | Before/after each page is parsed |
| `startExtractDocument` / `endExtractDocument` | Before/after each report is extracted |
| `startDistributeDocument` / `endDistributeDocument` | Before/after each report is distributed |
| `quarantineDocument` | When distribution fails |
| `endBursting` | Burst completes |

**Most Common Hooks:**
- `endExtractDocument` — the go-to event for most scenarios. Fires after each report is extracted, perfect for per-file operations (zip, encrypt, upload, conditional skip). **Example:** Upload reports to the Self-Service Web Portal via cURL + REST API — if it's a custom Grails/NextJS portal, use the API you built; if it's WordPress-powered, use the [WordPress REST API](https://developer.wordpress.org/rest-api/reference/).
- `startDistributeDocument` — ideal for conditional distribution based on custom business logic (set `ctx.skipCurrentFileDistribution = true` to skip sending a report).
- `endBursting` — useful for batch operations after all reports are processed (summary email, cleanup, final upload).

Scripts live in `scripts/burst/` — one file per event (e.g., `endBursting.groovy`, `endExtractDocument.groovy`).

---

## The Bursting Context (`ctx`)

Scripts access the `ctx` object with runtime information:

- `ctx.token` — current burst token
- `ctx.extractedFilePath` — path to current extracted file
- `ctx.outputFolder`, `ctx.quarantineFolder` — folder paths
- `ctx.variables` — access built-in and user variables
- `ctx.settings` — current configuration settings
- `ctx.skipCurrentFileDistribution` — set to `true` to skip distribution
- `ctx.numberOfExtractedFiles`, `ctx.numberOfDistributedFiles` — counters

---

## Sample Scripts

DataPallas includes ready-to-use samples in `scripts/burst/samples/`:

| Script | Purpose |
|--------|---------|
| `zip.groovy` | Zip all output files together |
| `encrypt.groovy` | Password-protect PDFs |
| `print.groovy` | Send to printer |
| `batch_pdf_print.groovy` | Batch print multiple PDF files |
| `copy_shared_folder.groovy` | Copy to network share |
| `ant_ftp.groovy`, `ant_scp_sftp.groovy` | Upload via FTP/SFTP |
| `ant_mail.groovy` | Send email using Apache Ant mail task |
| `ant_vfs.groovy` | Virtual filesystem operations using Apache Ant VFS |
| `curl_ftp.groovy`, `curl_sftp.groovy` | Upload via cURL |
| `curl_invoice2portal.groovy` | Publish invoices to a web portal via REST API |
| `curl_payslip2portal.groovy` | Publish payslips to a web portal via REST API |
| `curl_paystub2portal.groovy` | Publish paystubs to a web portal via REST API |
| `fetch_distribution_details_from_database.groovy` | Fetch recipient info from DB |
| `fetch_distribution_details_from_csv_file.groovy` | Fetch recipient info from CSV |
| `skip_current_file_distribution_if.groovy` | Conditional distribution |
| `merge_with_external_files.groovy` | Merge PDFs |
| `exec_pdftk_background.groovy` | Add PDF background/watermark using pdftk |
| `overlay.groovy` | Overlay content on PDF pages |
| `add_and_format_page_numbers.groovy` | Add page numbers |
| `email_html_cid_embedded_images.groovy` | Send HTML emails with CID-embedded inline images |
| `rclone_sync_cloud.groovy` | Sync to cloud storage |

> **Note:** Each `.groovy` sample file contains detailed inline documentation — usage instructions, configuration options, and code comments explaining how to adapt the script. When a user needs help with a scripting scenario, **read the actual `.groovy` file** in `scripts/burst/samples/` to get the full context before advising.

---

## cURL Integration

cURL handles uploads for FTP, FTPS, SFTP, HTTP, HTTPS, and more. DataPallas bundles cURL on Windows.

Sample scripts: `curl_ftp.groovy`, `curl_sftp.groovy`

Common options:
- `--ftp-create-dirs` — create missing directories
- `-T <file>` — upload file
- `-u user:password` — authentication
- `-v` or `--trace` — debugging

---

## CLI Interface

DataPallas exposes every core operation as a `DataPallas <command> [options] [args]` invocation, perfect for shell scripts, cron jobs, and Windows Task Scheduler.

**Main commands:**

| Command    | Purpose                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- |
| `burst`    | Split documents into individual files based on burst tokens                              |
| `generate` | Create reports from data sources (CSV, Excel, SQL, Groovy, dashboards)                   |
| `resume`   | Continue a previously paused job from its saved progress file                            |
| `document` | Document operations such as `document merge` (combine multiple PDFs)                     |
| `jasper`   | Compile/fill/export standalone JasperReports `.jrxml` files                              |
| `service`  | Start/stop database starter packs and Docker apps (`service database start`, etc.)       |
| `system`   | System-level operations (`test-email`, `test-sql-query`, `license activate`, diagnostics)|

**Common options:** `-c, --config <file>` · `-p, --params <key=value>` (repeatable) · `--testall` · `--testlist <list>` · `--testrandom <count>`.

**Quick example:**
```bash
DataPallas burst samples/burst/Payslips.pdf -c config/samples/split-only/settings.xml --testrandom 2
```

**Full reference (commands, every option, Windows/Linux integration patterns, best practices):** I fetch https://datapallas.com/docs/advanced/cli when I need exact syntax, exit codes, or specific examples.

---

## REST API

The same operations are exposed as REST endpoints — use this for programmatic integration from external applications, custom portals, and CI/CD pipelines.

**API domains:**

| Domain            | Base path             | Purpose                                                              |
| ----------------- | --------------------- | -------------------------------------------------------------------- |
| **Jobs**          | `/api/jobs`           | Burst, generate, merge documents. Monitor and control running jobs.  |
| **Reports**       | `/api/reports`        | Manage report configurations — CRUD, duplicate.                      |
| **Connections**   | `/api/connections`    | Database/email connections — CRUD, test, schema exploration.         |
| **Analytics**     | `/api/analytics`      | Server-side OLAP pivot queries (DuckDB, ClickHouse).                 |
| **Queries**       | `/api/queries`        | Ad-hoc SQL execution and schema exploration.                         |
| **Starter Packs** | `/api/starter-packs`  | Start/stop database instances and Docker apps.                       |
| **System**        | `/api/system`         | System info, service status, diagnostics.                            |
| **License**       | `/api/license`        | License activation and management.                                   |

**Key concepts:**
- **`reportId`** — most endpoints take the report's folder name (e.g., `monthly-invoices`), not file paths. The server resolves it internally.
- **Asynchronous execution** — `/api/jobs/*` endpoints return `{"status": "submitted"}` immediately and run in the background. Subscribe to WebSocket `/api/ws` (topic `/topic/execution-stats`) for real-time status, or watch `temp/*.job` files.
- **Input files** — `inputFile` accepts both relative (resolved against the install dir) and absolute paths.

**Quick example:**
```bash
curl -X POST http://localhost:9090/api/jobs/burst \
  -H "Content-Type: application/json" \
  -d '{"inputFile": "samples/burst/Payslips.pdf", "reportId": "split-only"}'
```

**Live, machine-generated reference:**
- **Swagger UI**: http://localhost:9090/swagger-ui.html — interactive "Try it out" buttons
- **OpenAPI spec**: http://localhost:9090/v3/api-docs — JSON for code generation, Postman/Insomnia import, contract validation

**Full written reference (every endpoint, payload examples, async patterns):** I fetch https://datapallas.com/docs/advanced/api when I need exact request shapes or detailed examples.

---

## How I Use This Knowledge

When users need custom distribution logic or system integration:

1. I pick the right form: **Groovy hook** (in-pipeline customisation), **CLI** (shell/cron), or **REST API** (external app integration).
2. For Groovy: I read the relevant sample script in `scripts/burst/samples/`, understand the pattern, then give a customised script and tell the user which file to paste it into (e.g., `scripts/burst/endExtractDocument.groovy`).
3. For CLI/REST: I fetch the docs (`/docs/advanced/cli`, `/docs/advanced/api`) for exact syntax, then provide a working command or HTTP request the user can run as-is.

---

## My Working Mode (Read-Only)

I read sample scripts and documentation to understand patterns. I **don't write files directly**.

When I provide Groovy scripts, I:
1. Explain what the script does
2. Give the complete code to copy
3. Tell the user exactly where to paste it (e.g., `scripts/burst/endBursting.groovy`)

---

## Documentation Links

- **Scripting (Groovy hooks)**: https://datapallas.com/docs/advanced/scripting
- **cURL Integration**: https://datapallas.com/docs/advanced/curl
- **CLI Reference**: https://datapallas.com/docs/advanced/cli
- **REST API Reference**: https://datapallas.com/docs/advanced/api
- **Live Swagger UI** (when server is running): http://localhost:9090/swagger-ui.html

When I need specifics on lifecycle events, ctx variables, cURL options, exact CLI syntax, or REST endpoint payloads, I fetch the relevant doc above.

---

## My Principle

> **Sample Scripts Are Starting Points.** I read the samples to understand patterns — zip, encrypt, upload, conditional skip. Then I customize for the user's specific need. Most scripting requirements are variations of existing samples.
