# DataPallas Server — Docker Deployment

## Start

```bash
docker compose up -d
```

Then open **http://localhost:9090** and sign in with **`burst` / `burst`**.

**Change that password.** Open your own name in the top right, then **Users**. It is a default administrator account that exists so a fresh install is usable the moment it boots. Fine on your laptop; on anything else, it is an administrator account with a published password. See https://datapallas.com/docs/server/users-roles

Requires Docker with Compose v2 (`docker compose`, not `docker-compose`).

## Stop

```bash
docker compose down
```

Your data lives in the folders next to this file, not inside Docker, so `down` never touches it. Starting again with `docker compose up -d` picks up exactly where you left off.

## Everyday commands

```bash
docker compose logs -f datapallas-server    # follow the logs
docker compose restart datapallas-server    # restart after editing config
docker compose exec datapallas-server bash  # shell inside the container
docker compose pull && docker compose up -d # upgrade to a newer image
```

## What is running

| URL | What |
|---|---|
| http://localhost:9090 | DataPallas — web UI and REST API |
| http://localhost:8025 | MailHog — catches every email DataPallas sends, so you can test delivery without a real mail server |

MailHog also binds SMTP on port 1025. If any of 9090, 8025 or 1025 is already taken on your machine, change the mapping in `docker-compose.yml`.

## The folders next to this file

These are bind-mounted into the container and are where your data lives. Back them up; they survive `docker compose down`, image upgrades, and deletion of the container.

| Folder | What |
|---|---|
| `config` | Server, burst, and email settings — the main thing you will edit |
| `templates` | Report templates |
| `samples` | Sample reports and configurations to start from |
| `db` | Embedded databases and sample data |
| `input-files`, `poll` | Input documents; `poll` is watched and processed automatically |
| `output`, `quarantine`, `backup` | Generated documents, failed deliveries, backups |
| `logs` | Application logs |
| `_apps` | Portals, StarterPacks, and custom apps |
| `scripts`, `temp` | Custom scripts; scratch space |

**Do not empty these folders.** They ship populated, and the server reads its configuration from them. An empty `config` mounted over the container's own configuration will not be repopulated — the server will start broken.

## Notes

**Docker socket.** `docker-compose.yml` mounts `/var/run/docker.sock` so DataPallas can launch StarterPacks and containerized Apps on your Docker host. This grants the container control of your Docker daemon. Remove that line if you do not want those features.

**Pinned version.** `docker-compose.yml` pins an exact image version. A commented `latest` line sits next to it if you would rather track the newest release.

**API key.** For machine callers — schedulers, integrations, the AI Hub proxy. The browser UI does not need it. Generated on first start at `config/_internal/api-key.txt`, or pin your own via the `API_KEY` environment variable in `docker-compose.yml`.

**Command line — most people never need this.** Reports, bursting, and scheduling all live in the web UI. Reach for the command line only when an external tool must trigger a run: cron, Windows Task Scheduler, a CI job, or your own script.

```bash
docker compose run --rm datapallas-server datapallas.sh -c config/my-config.xml --testlist entry1
```

Works on Windows too, despite the `.sh` name — `datapallas.sh` runs inside the Linux container; you are only typing a `docker compose` command. Output goes to `logs/datapallas.sh.log`, not to your terminal.

## Documentation

https://datapallas.com/docs
