# Your notebooks

Anything you create in JupyterLab lands here, on your own machine, and survives restarting or
rebuilding the container.

## Reaching your data

The Northwind databases DataPallas ships are reachable from a notebook. Two ways, and the
Python for Data track uses both:

**DuckDB — no server, reads files directly.**

```python
%pip install duckdb
import duckdb
duckdb.sql("SELECT * FROM read_csv_auto('orders.csv') LIMIT 5").df()
```

**PostgreSQL — the same Northwind you query in CloudBeaver.**

```python
%pip install psycopg[binary] sqlalchemy
```

From inside the container, `localhost` is the container itself — use `host.docker.internal`
for a database running on your machine, or the compose service name if it is another app.

## Why `%pip install` and not a custom image

The image ships pandas, numpy, matplotlib and scipy — enough for the whole of Series 1.
Everything else (duckdb, polars, psycopg) is one cell away, and installing from a notebook is
what you would actually do at work. Baking a custom image would mean a build step between you
and your first cell, which is the thing this setup exists to avoid.

Installs do not survive a container rebuild. That is not a bug worth fixing here — Series 3 ·
00 (`venv, pip & uv`) is the episode about making an environment reproducible, and doing it
by hand first is what makes that episode land.
