# JasperReports 6 legacy renderer

Runs **classic `.jrxml`** — the format JasperReports used from 1.x through 6.21 —
inside a container, so templates written for JasperReports Server or older
Jaspersoft Studio render without being converted first.

DataPallas itself runs **JasperReports 7**, whose file format is new and cannot
read classic JRXML. That is not a version-by-version problem: there were never
separate "JR5", "JR4" or "JR3" formats. Classic JRXML was one continuously
backward-compatible schema for twenty years, and JasperReports 7.0 is its only
break. So this one image covers **every** classic template, whatever year it was
written in.

| Your template | DataPallas (JR 7) | This image (JR 6.21.5) |
|---|---|---|
| `<element kind="staticText">` — written by Studio 7 | ✅ | ❌ |
| `<staticText><reportElement/>` — Studio 6.x and earlier, Server exports | ❌ | ✅ |
| `<!DOCTYPE jasperReport ... jasperreport.dtd>` — circa 2005 | ❌ | ✅ |

## Coming from JasperReports Server? Start here

Point `jr.bat analyze` at your reports and it will tell you which engine each one
needs, what it reaches for outside itself, and what each fix costs:

```bash
jr.bat analyze C:\exported-reports          # ./jr.sh analyze on Linux/macOS
```

It reads the `.jrxml` files as text — **no Docker, no services, nothing
installed**, just the Java DataPallas already requires — so you can run it before
committing to anything. It changes nothing unless you ask.

```
WHICH ENGINE
  2    classic JRXML (1.x - 6.21)   -> config/reports-jasper-legacy/
  1    JasperReports 7              -> config/reports-jasper/

READINESS
  1    run as they are
  2    need something first

WHAT EACH REPORT NEEDS

  payslips\payslip.jrxml
    repo: file             repo:/images/company_logo.png
                           -> rewrite the path and copy the file next to the report
    scriptlet              com.acme.payroll.PayslipScriptlet
                           -> copy the jar holding this class into tools/jasper-legacy/lib/
    font                   Acme Sans
                           -> copy the font-extension jar into tools/jasper-legacy/lib/
```

It finds `repo:` paths, scriptlet and custom classes, fonts the renderer does not
have, query languages that need their own library, and sub-reports that are
missing or referenced as `.jrxml` instead of compiled `.jasper`.

Then it offers to do the mechanical part:

```bash
jr.bat analyze C:\exported-reports --fix
```

`--fix` rewrites `repo:/images/logo.png` into `$P{SUBREPORT_DIR} + "images/logo.png"`,
declares `SUBREPORT_DIR` where the template does not already (referencing an
undeclared parameter is a compile error, not a warning), and keeps a `.bak` beside
every file it touches. It changes nothing else — the jars and the Server objects
are yours to move, and it says so.

What remains after that is the honest list: copy the jars you already own into
[`lib/`](lib/README.md), and recreate anything that was a Server object rather
than a file — data adapters, input controls, Domains. Scope those before you
promise anyone a date.

## Why a container

JasperReports 6 pins `openpdf 1.3.32` and `jfreechart 1.0.19`. DataPallas runs
`1.3.43` and `1.5.6`. Those cannot share a classpath, so they do not share a
process. Everything crossing the boundary is a file path, a few parameters and a
JDBC URL going in, and bytes coming out.

## Prerequisites

Docker. Nothing else — the image carries its own Java, so this does not care
which JDK DataPallas is using.

## Build

There is nothing to do. The first render builds the image from `internal/Dockerfile`
— a few minutes, and it needs internet access that once. Every run after that
starts immediately. `jr.bat analyze` needs none of this.

The image is **not** pulled from a registry. It is built on your machine from
sources you can read, which is also why `internal/pom.xml` and `internal/Dockerfile`
ship here rather than being hidden inside a published image.

To build it yourself ahead of time, or to rebuild after editing the pom:

```bash
cd tools/jasper-legacy/internal
docker build -t flowkraft/datapallas-jasper-legacy:6.21.5 .
```

The build needs Maven Central. On an air-gapped machine, build the image once on
a connected machine and move it across with `docker save` / `docker load`.

## Use it

The options are identical to `datapallas.bat jasper`, so a report moves between
the two engines by changing the command name and nothing else.

```bash
jr.bat --report-dir <dir> --jrxml <file> --format <fmt> --out <file>
       [--jdbc-url <url>] [--jdbc-user <u>] [--jdbc-pass <p>]
       [-p "KEY=VALUE"]...
```

| Option | Description |
|---|---|
| `--report-dir <dir>` | Folder holding the `.jrxml` and its resources (required) |
| `--jrxml <file>` | Main `.jrxml` template filename (required) |
| `--format <fmt>` | `pdf`, `xlsx`, `csv`, `html` (required) |
| `--out <file>` | Output file path (required) |
| `--jdbc-url <url>` | JDBC connection URL |
| `--jdbc-user <user>` | JDBC username |
| `--jdbc-pass <password>` | JDBC password |
| `-p, --params <key=value>` | Report parameter, repeatable |

Exit codes match the rest of the CLI: `0` success, `1` the job failed, `2` the
command line was invalid. Output is echoed and appended to `logs/jr.bat.log`
(`logs/jr.sh.log`).

### Examples

```bash
# A template with no data source — parameters only
jr.bat --report-dir .\legacy-reports\employee-detail --jrxml employee_detail.jrxml ^
       --format pdf --out .\output\employee-detail.pdf ^
       -p "EmployeeID=1" -p "FirstName=Nancy" -p "LastName=Davolio"

# Straight off a database, using the report's own embedded <queryString>
jr.bat --report-dir .\legacy-reports\sales-summary --jrxml sales_summary.jrxml ^
       --format pdf --out .\output\sales-summary.pdf ^
       --jdbc-url "jdbc:postgresql://localhost:5432/northwind" ^
       --jdbc-user postgres --jdbc-pass postgres

# Same template, straight to Excel
jr.bat --report-dir .\legacy-reports\sales-summary --jrxml sales_summary.jrxml ^
       --format xlsx --out .\output\sales-summary.xlsx ^
       --jdbc-url "jdbc:postgresql://localhost:5432/northwind" ^
       --jdbc-user postgres --jdbc-pass postgres
```

On Linux and in the Docker Server image use `./jr.sh` with the same options.

> **Quote your parameters.** `-p Who=World` is split by `cmd.exe` into two
> arguments before the CLI ever sees it. `-p "Who=World"` works. This is the
> same behaviour as `datapallas.bat jasper`.

## Connecting to databases

The container has ordinary outbound network access, so **a database anywhere on
your network or the internet just works** — no configuration:

```
--jdbc-url "jdbc:postgresql://reporting-db.corp.example.com:5432/sales"
--jdbc-url "jdbc:sqlserver://10.20.30.40:1433;databaseName=Finance"
```

The one word that needs care is `localhost`, because inside a container that
means the container. **`jr.bat` and `jr.sh` rewrite it for you** — `localhost`
and `127.0.0.1` in `--jdbc-url` become `host.docker.internal`, which is the
machine you ran the command on. So this works as written:

```bash
--jdbc-url "jdbc:mysql://localhost:3306/payroll"
```

That same rewrite is what reaches a database **DataPallas started for you**
(`datapallas.bat system service database start northwind postgresql 5432`),
because those publish their port on the host like any other local database.

Drivers for PostgreSQL, MySQL, MariaDB, SQL Server and H2 are in the image, at
the versions DataPallas itself ships. Oracle and DB2 cannot be redistributed —
put those driver jars in [`lib/`](lib/README.md) and they are picked up
automatically.

## Your own jars

Drop them in [`lib/`](lib/README.md) — scriptlets, custom data sources, custom
functions, corporate font extensions, restricted JDBC drivers. Copy the file in
and the next run picks it up: no rebuild, no configuration, no restart.

This is usually the difference between a report that fails and one that renders,
and it costs a file copy, because the jar is already sitting in your old
application.

**How it is guaranteed.** Two things, and nothing else:

1. `jr.bat` / `jr.sh` mount this folder into every container they start —
   `-v <...>/lib:/opt/jr/userlib:ro`. It is not optional and there is no flag to
   forget.
2. The image's classpath is `/opt/jr/userlib/*:/opt/jr/lib/*`. Java expands a
   `dir/*` entry when the JVM starts, so whatever jars are in the folder at that
   moment are on the classpath — and since each CLI run starts a fresh JVM, that
   moment is every run. Your jars come first, so a report built against your
   version of a library gets your version.

Two consequences worth knowing:

* Java's `dir/*` does **not** recurse. A jar in a subfolder is ignored. Put jars
  directly in `lib/`.
* The REST service mounts the same folder, but it is a long-running process, so
  a jar added after it started is picked up on the next
  `startJasperLegacyServer` — not mid-flight.

## Using classic reports inside DataPallas

You do not have to use this tool by hand. DataPallas treats classic templates as
first-class reports:

1. Start the renderer once — `startJasperLegacyServer.bat`.
2. Drop your report folder into `config/reports-jasper-legacy/` (the same shape
   as `config/reports-jasper/`: the `.jrxml` plus its images and resources).
3. It appears in the Reports screen marked **(legacy)**, with its parameter form,
   its own database connection, scheduling, bursting and distribution — the same
   as any other report.

The marker is deliberate. The two engines read different file formats, so which
one a report uses is a real property of that report, not an implementation
detail, and it is shown wherever a report is listed or selected.

In the Output tab of a report configuration you can also pick **JasperReports
Legacy (.jrxml)** as the output type, which renders a normal DataPallas report —
SQL, CSV, Excel, Groovy — through a classic template. One template, one document
per row, exactly as the JasperReports 7 output type behaves.

DataPallas talks to the service over HTTP, never through `jr.bat`: a container
start per report would make bursting unusable. If the service is not running, the
generation fails with a message telling you to start it.

## The REST service

The CLI starts a container per report, about 2–4 seconds. When something else
needs to render classic reports over HTTP — DataPallas itself included — or you
are rendering enough of them that the container start hurts, run the same engine
as a service instead:

```bash
startJasperLegacyServer.bat      # startJasperLegacyServer.sh on Linux/macOS
```

It is the **same image and the same renderer** — the CLI and the REST service
both call one engine class, so the bytes are identical either way.

```
POST http://localhost:9095/api/reports/render
GET  http://localhost:9095/api/health
```

Every field of the request maps one-to-one onto a `jr.bat` option:

```bash
curl -X POST http://localhost:9095/api/reports/render \
  -H "Content-Type: application/json" \
  -o payslip.pdf \
  -d '{
        "reportDir": "/work/report",
        "jrxml": "monthly_payslip.jrxml",
        "format": "pdf",
        "params": { "EmployeeID": "1" },
        "jdbcUrl": "jdbc:postgresql://host.docker.internal:5432/northwind",
        "jdbcUser": "postgres",
        "jdbcPass": "postgres"
      }'
```

The rendered document comes back as the response body, with the right
`Content-Type` and a `Content-Disposition` filename. A bad request answers `400`
with `{"status":"error","message":"..."}`; a render that fails answers `500` in
the same shape.

`reportDir` is a path **inside the container**. The service mounts one reports
folder at `/work/report` — by default `config/reports-jasper-legacy`, or set
`JASPER_LEGACY_REPORTS` to point somewhere else before starting it. Set
`JASPER_LEGACY_PORT` if 9095 is taken.

```bash
shutJasperLegacyServer.bat       # stops it; jr.bat keeps working without it
```

## Why the CLI is a script and the service is compose

`internal/docker-compose.yml` describes both faces, but only the service is
really managed by compose. A long-running process with a port, mounts, an
environment and a restart policy is exactly what compose is for.

The CLI is not, because its whole point is that `--report-dir` and `--out` differ
on every invocation, and a compose file has to declare its mounts up front.
`docker compose run --rm render ...` works, but only for reports already under
the one folder the compose file names. `jr.bat` computes the mounts per call,
which is why it is the way in for ad-hoc rendering.

## Moving a report off JasperReports Server

Most migration work is mechanical. The table below is what actually breaks and
what each fix costs — every row marked ✅ was tested, not assumed.

| What the template reaches for | Fix | Cost | Tested |
|---|---|---|---|
| `repo:/images/logo.png`, styles, subreports | Rewrite to `$P{SUBREPORT_DIR} + "images/logo.png"` and copy the files into the report folder | find/replace | ✅ |
| `scriptletClass="com.acme.X"` | Copy their jar into `lib/` | file copy | ✅ |
| Custom data source / custom functions | Copy their jar into `lib/` | file copy | ✅ |
| Corporate font extension jar | Copy it into `lib/` | file copy | ✅ |
| `fontName="DejaVu Sans"` | Nothing — it is in the image | — | ✅ |
| Barcodes, charts, crosstabs, subreports | Nothing — all in the image | — | ✅ |
| `$P{REPORT_CONTEXT}` | Nothing — a standard library parameter, not a Server one | — | ✅ |
| `language="xPath"` / `csv` / `xlsx` | Executers are in the image | — | — |
| `repo:/datasources/...`, input controls, Domains | Not paths — recreate as DataPallas connections and report parameters | configuration | — |
| `language="hql"` / `"jpa"` | Needs Hibernate plus your mapped entity classes in `lib/` | hard | — |
| `language="mdx"` | Needs Mondrian plus a cube schema | hard | — |

### The `repo:` rewrite

JasperReports Server resolved `repo:` against its own repository, which does not
exist here. For file-shaped resources the fix is a path rewrite plus a copy:

```diff
- <imageExpression><![CDATA["repo:/images/company_logo.png"]]></imageExpression>
+ <imageExpression><![CDATA[$P{SUBREPORT_DIR} + "images/company_logo.png"]]></imageExpression>
```

Then copy the Server repository tree into the report folder so
`images/company_logo.png` sits beside the `.jrxml`. `SUBREPORT_DIR` is set to
the report folder automatically on every run, so the same template works on any
machine.

### Subreports must be compiled

A subreport referenced as a `.jrxml` fails — JasperReports loads subreports from
its repository as compiled `.jasper` files. This is original JasperReports
behaviour, not something this image changes, and Jaspersoft Studio compiles them
for you. If you only have the source, compile it once and keep the `.jasper`
beside the parent report.

## What is in this folder

Everything you need is at the top level. `internal/` holds the build — the
`Dockerfile`, the `pom.xml` naming every jar, the runner source and the compose
file. Read it if you want to know exactly what is in the image; you never have
to touch it to use the tool.

```
README.md                         this file
jr.bat  jr.sh                     analyze reports, or render one
startJasperLegacyServer.bat/.sh   start the REST service
shutJasperLegacyServer.bat/.sh    stop it
lib/                              drop your own jars here
internal/                         Dockerfile, pom.xml, sources, compose, analyzer
```

`jr.bat analyze` is the only subcommand that needs no Docker.

## What this is not

**`jr.bat` is not the way to render at volume.** Each CLI run starts a container
and a JVM, roughly 2–4 seconds. That is fine for rendering one report and for
proving a template works, and far too slow for splitting one template into a
thousand personalised documents. Bursting and scheduling go through the REST
service instead, which is why DataPallas asks you to start it.

**Classic templates stay classic.** Nothing here converts a template to the
JasperReports 7 format, and the two formats never mix: a report in
`config/reports-jasper-legacy/` is always rendered by this engine, a report in
`config/reports-jasper/` always by the embedded one.

So you have two routes, and both are legitimate. Keep your classic templates and
run them here indefinitely, or convert the ones worth keeping to JRXML 7
(Jaspersoft Studio opens classic files and saves the new format) and move them
into `config/reports-jasper/`, where they need no container at all.
