# DataPallas Server — Docker Deployment

## Start

```bash
docker compose up -d
```

Then open **http://localhost:9090** and sign in with **`burst` / `burst`**.

**Set your own password** when you have a minute: open your name in the top right, then **Users**. Worth doing early, especially if colleagues will be using this server too. See https://datapallas.com/docs/server/users-roles

Requires Docker with Compose v2 (`docker compose`, not `docker-compose`).

## Stop

```bash
docker compose down
```

Your work lives in the folders next to this file, not inside Docker, so `down` never touches it. Starting again with `docker compose up -d` picks up exactly where you left off.

## Everyday commands

```bash
docker compose logs -f datapallas-server    # follow the logs
docker compose restart datapallas-server    # restart the server
docker compose down                         # stop; your folders are untouched
docker compose up -d                        # start again where you left off
```

Everything else — running reports, bursting, scheduling — is done in the web UI.

## What is running

| URL | What |
|---|---|
| http://localhost:9090 | DataPallas — the web UI |
| http://localhost:8025 | MailHog — catches every email DataPallas sends, so you can test delivery without a real mail server |

MailHog also uses port 1025 for SMTP. If 9090, 8025 or 1025 is already taken on your machine, change the mapping in `docker-compose.yml`.

## The folders next to this file

Your work lives here. These folders carry across restarts, upgrades, and `docker compose down` — so these are the ones to back up.

You do not need to open any of them day to day; the web UI takes care of that. They are listed here so you know where things are.

| Folder | What is in it |
|---|---|
| `config` | Your settings — connections, email, report configuration, all managed from the web UI |
| `templates` | Report templates |
| `samples` | Sample reports and configurations to start from |
| `db` | Databases and sample data |
| `output`, `quarantine`, `backup` | Generated documents, anything that could not be delivered, backups |
| `input-files`, `poll` | Input documents — files dropped into `poll` are picked up and processed automatically |
| `_apps` | Portals, StarterPacks, and custom apps |
| `logs` | Log files, if you ever need to look |
| `scripts`, `temp` | Custom scripts and working space |

Keep the folder together, and move it as a whole if you relocate it later.

## Notes

**StarterPacks and Apps.** `docker-compose.yml` shares your Docker socket with DataPallas so it can start portals, StarterPacks, and other containerized Apps for you, straight from the web UI. If you would rather not use those features, remove that line.

**Upgrading.** `docker-compose.yml` names an exact version, so you upgrade when you choose to. Edit the `image:` line — or uncomment the `latest` line next to it — then `docker compose pull` and `docker compose up -d`. Your folders carry over as they are.

**Sharing it with your team.** DataPallas Server is built for several people at once — give everyone their own account under **Users**.

On a trusted network, plain `http://` works fine. Worth knowing: browsers allow copy-to-clipboard only over `https://` or on `localhost`, so the **Copy** buttons go quiet for colleagues who reach the server by hostname over plain HTTP.

**On the Internet.** Publishing DataPallas Server to the Internet is a normal way to run it. The self-service document portals are meant to be reached over the Internet — that is the whole point of them: your customers, employees, or partners sign in and collect their own invoices or payslips from wherever they are.

Serve it over HTTPS when you do: on plain HTTP, sign-ins and sessions travel in the clear. Most people use the reverse proxy they already run.

**Running a job from the command line — most people never need this.** Reports, bursting, and scheduling all live in the web UI. Reach for the command line only when an external tool must trigger a run: cron, Windows Task Scheduler, a CI job, or your own script.

```bash
docker compose run --rm datapallas-server datapallas.sh -c config/my-config.xml --testlist entry1
```

Works on Windows too, despite the `.sh` name — `datapallas.sh` runs inside the Linux container; you are only typing a `docker compose` command. Output goes to `logs/datapallas.sh.log`, not to your terminal.

## Documentation

https://datapallas.com/docs
