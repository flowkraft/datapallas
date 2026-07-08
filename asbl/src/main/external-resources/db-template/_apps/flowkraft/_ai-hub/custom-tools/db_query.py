import os
import re
import json
import csv
import io
import urllib.request
import urllib.error


def db_query(connection_code: str, sql: str, format: str = "table", max_rows: int = 50) -> str:
    """
    Execute a READ-ONLY SQL query against the database currently connected in Chat2DB.

    IMPORTANT: this tool does NOT open the database itself. It sends the SQL to the
    Chat2DB engine — a separate service that owns the JDBC drivers and the live
    connection — which runs it and returns the rows. This is deliberate: the only way
    to read data is through the engine, never by touching the database directly. This
    image has no database drivers, so there is no other path.

    Args:
        connection_code (str): DataPallas connection code (informational; the query runs
                               against whatever database is currently connected in Chat2DB).
        sql (str): A SELECT query. Destructive statements are blocked (READ-ONLY).
        format (str): Output format - "table" (default), "json", or "csv".
        max_rows (int): Maximum rows to return (default: 50).

    Returns:
        str: Query results formatted as a table, JSON, or CSV.

    Examples:
        >>> db_query("rbt-sample-northwind-sqlite-4f2", "SELECT * FROM Customers LIMIT 5")
        >>> db_query("", "SELECT COUNT(*) FROM Orders", format="json")
    """
    print(f"db_query called: connection={connection_code}, sql={sql[:100]}...")

    # ── READ-ONLY guard: block anything that could modify data ──
    dangerous_patterns = [
        r'\bDELETE\b', r'\bDROP\b', r'\bTRUNCATE\b', r'\bUPDATE\b',
        r'\bALTER\b', r'\bINSERT\b', r'\bCREATE\b', r'\bGRANT\b',
        r'\bREVOKE\b', r'\bEXEC\b', r'\bEXECUTE\b',
    ]
    for pattern in dangerous_patterns:
        if re.search(pattern, sql, re.IGNORECASE):
            raise Exception(
                f"BLOCKED: Destructive SQL detected ({pattern.strip()}). "
                "This tool is READ-ONLY. Only SELECT queries are allowed."
            )

    # ── Execute through the Chat2DB engine over HTTP (it holds the JDBC drivers +
    #    the live connection). This letta image intentionally has no DB drivers. ──
    base_url = os.environ.get('CHAT2DB_URL', 'http://flowkraft-ai-hub-chat2db:8888').rstrip('/')
    req = urllib.request.Request(
        base_url + '/api/sql',
        data=json.dumps({'query': sql}).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode('utf-8'))
            detail = body.get('detail', str(body))
        except Exception:
            detail = str(e)
        if e.code == 400:
            raise Exception(
                "No database is connected in Chat2DB. Connect a database first, then retry. "
                f"({detail})"
            )
        raise Exception(f"Query failed (HTTP {e.code}): {detail}")
    except Exception as e:
        raise Exception(f"Could not reach the Chat2DB engine at {base_url}: {e}")

    data = payload.get('data') or []
    columns = list(data[0].keys()) if data else []
    rows = [[row.get(c) for c in columns] for row in data]

    if not columns:
        return "Query executed successfully (no results returned)."

    # ── Format output ──
    truncated = len(rows) > max_rows
    rows = rows[:max_rows]

    if format == 'json':
        result = json.dumps([dict(zip(columns, r)) for r in rows], indent=2, default=str)
        if truncated:
            result += f"\n\n[Showing {max_rows} of more rows. Use max_rows to see more.]"
        return result

    if format == 'csv':
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(columns)
        writer.writerows(rows)
        result = buf.getvalue()
        if truncated:
            result += f"\n[Showing {max_rows} of more rows.]"
        return result

    # Default: table format
    try:
        from tabulate import tabulate
        result = tabulate(rows, headers=columns, tablefmt='simple')
    except ImportError:
        header = ' | '.join(str(c) for c in columns)
        sep = '-+-'.join('-' * max(len(str(c)), 5) for c in columns)
        lines = [header, sep]
        for row in rows:
            lines.append(' | '.join(str(v) for v in row))
        result = '\n'.join(lines)

    if truncated:
        result += f"\n\n[Showing {max_rows} of more rows. Use max_rows to see more.]"

    row_info = f"{len(rows)}{'+ (truncated)' if truncated else ''} row(s)"
    return f"{result}\n\n{row_info}"
