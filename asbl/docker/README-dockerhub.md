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

The image carries its own configuration, sample data, and report templates, so this just works — nothing to set up, no Java to install, no volumes to prepare. Everything is discarded when the container stops, which is what you want for a first look.

## Run it with persistence

Use **named volumes**. Docker fills them from the image the first time you start, so your settings, samples, and templates are there from the outset and stay put across restarts:

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

That covers the common case. Add `/app/poll`, `/app/input-files`, `/app/quarantine` and `/app/backup` from the table below if you use watched-folder processing or want undelivered items kept across restarts — anything not mounted lives inside the container and starts fresh when it is recreated.

Named volumes are the thing to use here. Folders on your own machine are for the full bundle below, which ships them already filled in.

## Full deployment (recommended)

The full bundle adds a MailHog test mail server for checking email delivery, lets DataPallas start portals and Apps for you from the web UI, and keeps your work in folders on your own machine where they are easy to back up.

1. Download **[datapallas-server-docker.zip](https://downloads.datapallas.com/file/datapallas/newest/datapallas-server-docker.zip)**
2. Extract it, then:

```bash
cd DataPallas
docker compose up -d
```

3. Open **http://localhost:9090** and sign in with **`burst` / `burst`** — and **http://localhost:8025** for the MailHog inbox, where test email deliveries land.

Full instructions: **https://datapallas.com/docs/server/self-host**

## First login

DataPallas Server comes with one account ready to go, **`burst` / `burst`**, so you can sign in the moment it starts.

**Set your own password** when you have a minute: open your name in the top right, then **Users**. Worth doing early, especially if colleagues will be using this server too.

Roles, creating accounts for colleagues, and signing in with existing Microsoft / Okta / Google Workspace accounts: **https://datapallas.com/docs/server/users-roles**

Running it for a team? On a trusted network plain `http://` works fine — though browsers allow copy-to-clipboard only over `https://` or on `localhost`, so the **Copy** buttons go quiet for colleagues reaching the server by hostname.

Publishing DataPallas Server to the **Internet** is a normal way to run it — the self-service document portals are meant to be reached that way, so your customers, employees, or partners can sign in and collect their own invoices or payslips from wherever they are. Serve it over HTTPS when you do: on plain HTTP, sign-ins and sessions travel in the clear.

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

Mount these to keep your work across restarts and upgrades. The web UI manages everything in them, so there is no need to open them day to day.

| Path | What is in it |
|---|---|
| `/app/config` | Your settings — connections, email, report configuration |
| `/app/templates` | Report templates |
| `/app/samples` | Sample reports and configurations to start from |
| `/app/db` | Databases and sample data |
| `/app/output`, `/app/quarantine`, `/app/backup` | Generated documents, anything that could not be delivered, backups |
| `/app/input-files`, `/app/poll` | Input documents — files dropped into `poll` are picked up and processed automatically |
| `/app/_apps` | Portals, StarterPacks, and custom apps |
| `/app/logs` | Log files, if you ever need to look |
| `/app/scripts`, `/app/temp` | Custom scripts and working space |

### StarterPacks and Apps

Mounting `/var/run/docker.sock` lets DataPallas start portals, StarterPacks, and other containerized Apps for you, straight from the web UI. The full bundle does this already; add it to a `docker run` if you want those features.

### API key

For integrations rather than people — a scheduler, an embedding host app, the AI Hub proxy. The browser UI signs in with a session cookie and needs no key.

It is generated on first start at `/app/config/_internal/api-key.txt`, so it persists with the config volume:

```bash
docker exec datapallas-server cat /app/config/_internal/api-key.txt
```

Or set your own with `-e API_KEY=...`.

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
