# DataPallas Server

**Business Intelligence, Reporting, and Document Distribution in the Age of AI.**

Your BI stack is usually three or four different tools stitched together with glue code. DataPallas is one self-hosted, open-source platform that covers the whole path from database to delivered document:

- **Data Exploration** — connect to PostgreSQL, MySQL, SQL Server, Oracle, SQLite, DuckDB, ClickHouse and more. Explore visually on a drag-and-drop canvas, or conversationally through the built-in Chat2DB app: ask a question in plain language, get SQL, charts, and dashboards back.
- **Dashboards, Analytics & Semantic Layer** — define your metrics, dimensions, and joins once as cubes, and every chart, pivot table, and dashboard reads from that same source of truth. Embed them into your own web apps as data-driven web components. Build a warehouse with OLTP-to-OLAP sync via CDC, powered by DuckDB, ClickHouse, and dbt.
- **Report Generation** — pixel-perfect PDF, Excel, HTML, and Word documents from SQL, Excel, XML, or CSV sources, at scales from one document to millions.
- **Report Bursting & Automation** — split one big report into personalized pieces and route each to the right recipient by email, FTP, cloud storage, or web portal — on schedule, with built-in quality assurance on every delivery.
- **Self-Service & Document Portals** — secure portals where employees, customers, or partners fetch their own payslips or invoices and pay them, in Grails or Next.js/React/Tailwind.
- **AI Crew** — a council of domain-expert AI agents (Athena for data & reports, Hephaestus for automation & ETL, Hermes for portals, Apollo for modern web) that learn your projects and workflows and assist across the entire platform.

No SaaS lock-in, no per-seat metering, no artificial restrictions. Licensed plans exist for professional support and updates, not to unlock features.

- Website: **https://datapallas.com**
- Documentation: **https://datapallas.com/docs**
- Quickstart: **https://datapallas.com/docs/quickstart**

---

## Try it in 30 seconds

```bash
docker run --rm -p 9090:9090 flowkraft/datapallas-server:latest
```

Open **http://localhost:9090** and sign in with **`burst` / `burst`**.

The image ships with a complete default configuration baked in, so this just works — no setup files, no Java install, no volumes to prepare. Everything is discarded when the container stops, which is what you want for a first look.

> **Change that password before anyone else can reach the server.** `burst` / `burst` is a default administrator account that exists so you can evaluate the product without a setup ritual. It is fine on your laptop and dangerous anywhere else — until you change it, anyone who can reach this server can sign in as an administrator.

## Run it with persistence

Use **named volumes**. Docker seeds a fresh named volume from the image's own contents on first use, so the shipped defaults land in the volume and then survive restarts:

```bash
docker run -d --name datapallas-server \
  -p 9090:9090 \
  -v dp-config:/app/config \
  -v dp-db:/app/db \
  -v dp-output:/app/output \
  -v dp-logs:/app/logs \
  -v dp-templates:/app/templates \
  -v dp-samples:/app/samples \
  -v dp-apps:/app/_apps \
  --restart unless-stopped \
  flowkraft/datapallas-server:latest
```

That covers the common case. If you use watched-folder processing or want failed deliveries kept across restarts, add `/app/poll`, `/app/input-files`, `/app/quarantine` and `/app/backup` from the table below — anything not mounted lives only inside the container and is lost when it is recreated.

> **Do not bind-mount empty host directories here.** A bind mount does *not* seed itself from the image — an empty `./config` on the host will shadow the baked-in configuration and the server will come up misconfigured. Bind mounts are for the full bundle below, which ships those directories already populated.

## Full deployment (recommended)

The full bundle adds a MailHog test mail server, Docker-in-Docker access for StarterPacks and Apps, and the complete set of pre-populated host folders you will actually want to edit.

1. Download **[datapallas-server-docker.zip](https://downloads.datapallas.com/file/datapallas/newest/datapallas-server-docker.zip)**
2. Extract it, then:

```bash
cd DataPallas
docker compose up -d
```

3. Open **http://localhost:9090** and sign in with **`burst` / `burst`** — and **http://localhost:8025** for the MailHog inbox, where test email deliveries land.

Full instructions: **https://datapallas.com/docs/server/self-host**

## First login

DataPallas Server starts with one administrator account, **`burst` / `burst`**, so that a fresh install is usable the moment it boots rather than sending you to hunt for a token on the filesystem.

Change it before the server is reachable by anyone else: open your own name in the top right, then **Users**. On a laptop evaluation it costs you nothing to leave it; on anything with a route to it, it is an administrator account with a published password.

Roles, creating accounts for colleagues, and signing in with existing Microsoft / Okta / Google Workspace accounts: **https://datapallas.com/docs/server/users-roles**

---

## Configuration

### Ports

| Port | Purpose |
|---|---|
| `9090` | Web UI and REST API (exposed by this image) |
| `8025` | MailHog web inbox (full bundle only) |
| `1025` | MailHog SMTP (full bundle only) |

Change the published port with `-p 8080:9090`. With plain `docker run`, `SERVER_PORT` changes the port the server listens on *inside* the container — so if you set it, publish that same port. In the full bundle's `docker-compose.yml` it works the other way round: `SERVER_PORT` selects the **host** port and the container always listens on 9090, so `SERVER_PORT=8080 docker compose up -d` is all you need there.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SERVER_PORT` | `9090` | Port the server listens on inside the container |
| `API_KEY` | auto-generated | Credential for machine callers of the REST API |

### Volumes

| Path | Contents |
|---|---|
| `/app/config` | Server, burst, and email settings — the main thing you will edit |
| `/app/db` | Embedded databases and sample data |
| `/app/templates` | Report templates |
| `/app/samples` | Sample reports and configurations |
| `/app/input-files`, `/app/poll` | Input documents; `poll` is watched for automated processing |
| `/app/output`, `/app/quarantine`, `/app/backup` | Generated documents, failed deliveries, backups |
| `/app/logs` | Application logs |
| `/app/_apps` | Portals, StarterPacks, and custom apps |
| `/app/scripts`, `/app/temp` | Custom scripts; scratch space |

Mounting `/var/run/docker.sock` lets DataPallas launch StarterPacks and containerized Apps on your Docker host. The full bundle does this; it is optional otherwise, and grants the container control of your Docker daemon — mount it only if you want those features.

### API key

The browser UI does not need a key — it is same-origin with the backend and uses a session cookie plus CSRF. The API key is for *machine* callers: the AI Hub proxy, a scheduler, an embedding host app.

It is generated on first start and written to `/app/config/_internal/api-key.txt`, so it persists with the config volume. Read it back with:

```bash
docker exec datapallas-server cat /app/config/_internal/api-key.txt
```

Or pin your own with `-e API_KEY=...`.

---

## Command-line usage — most people never need this

Reports, bursting, and scheduling all live in the web UI. Reach for the CLI only when an external tool must trigger a run: cron, Windows Task Scheduler, a CI job, or your own script. Pass `datapallas.sh` as the first argument, followed by the CLI's own arguments:

```bash
docker exec datapallas-server ./datapallas.sh -c config/my-config.xml --testlist entry1
```

Works on Windows too, despite the `.sh` name — it runs inside the Linux container; you are only typing a `docker` command on the host.

Output goes to `/app/logs/datapallas.sh.log` rather than to stdout, so tail that file to follow a run:

```bash
docker exec datapallas-server tail -f /app/logs/datapallas.sh.log
```

---

## Tags

- `latest` — most recent release
- `X.Y.Z` — pinned release, e.g. `16.5.0`. See the **Tags** tab for everything published.

Pin an explicit version for production. `latest` moves under you on the next release.

---

## Support

- Documentation — https://datapallas.com/docs
- Samples — https://datapallas.com/docs/samples
- Source — https://github.com/flowkraft/DataPallas

Licensed plans provide professional support, regular updates, and commercial peace of mind: https://datapallas.com
