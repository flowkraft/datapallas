"""
Chat2DB FastAPI Backend

Wraps the Chat2DB engine in a lightweight HTTP API.
All SQL execution and visualization rendering happens here (Python + JDBC).
The Next.js frontend calls these endpoints and renders results natively.
"""

import json
import math
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from chat2db import Chat2DB


# ---------------------------------------------------------------------------
# Lifespan: init / cleanup
# ---------------------------------------------------------------------------

chat: Optional[Chat2DB] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global chat
    chat = Chat2DB()
    yield
    if chat:
        chat.close()
        chat = None


app = FastAPI(title="Chat2DB Fast", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ConnectRequest(BaseModel):
    connection_code: str
    connection_name: Optional[str] = None
    # Full `dbserver` block from the DataPallas REST API, forwarded by the browser
    # (type, database, host, port, userid, userpassword, url, driver, ...).
    dbserver: Optional[dict] = None


class AskRequest(BaseModel):
    question: str
    send_schema: bool = True
    # The database the question is about, connected earlier through /api/connect.
    # Empty: a DataPallas product question, answered without a database.
    connection_code: Optional[str] = None


class SqlRequest(BaseModel):
    query: str
    # The database to run the query on. Optional only for older callers: they are served
    # while exactly one database is connected, since the answer is then unambiguous.
    connection_code: Optional[str] = None


# Who is asking, as the AI Hub names them (it asks DataPallas). It only keeps one person's
# last result ("now chart that") apart from another's; it grants nothing, and the AI Hub
# checks the caller's right to a connection before forwarding anything here.
USER_HEADER = "X-DataPallas-User"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize_for_json(value):
    """Make a value JSON-serializable: drop NaN/Inf floats, and coerce non-native
    scalars — JDBC Java BigInteger/BigDecimal (via JayDeBeApi, common on DuckDB
    SUM/COUNT), numpy numbers, Decimal, dates — to native Python numbers or strings
    so json.dumps never fails on a query result."""
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return None if (math.isnan(value) or math.isinf(value)) else value
    if isinstance(value, (list, dict)):
        return value
    # Non-native (Java BigInteger/BigDecimal, numpy, Decimal, datetime, bytes, ...):
    # the string form carries the numeric/text value — parse to int/float, else keep string.
    s = str(value)
    try:
        return int(s)
    except (ValueError, TypeError):
        pass
    try:
        f = float(s)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (ValueError, TypeError):
        return s


def _df_to_records(df):
    """Convert DataFrame to JSON-safe list of dicts."""
    records = df.to_dict(orient="records")
    return [
        {k: _sanitize_for_json(v) for k, v in row.items()}
        for row in records
    ]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    connections = chat.connected_codes() if chat is not None else []
    return {
        "status": "ok",
        "connected": bool(connections),
        "connections": connections,
    }


@app.post("/api/connect")
def connect(req: ConnectRequest):
    """Open a JDBC connection using the details the browser read from the DataPallas
    REST API (the same source /explore-data lists from). Connection listing lives in
    the Java backend now — there is no /api/connections here on purpose.

    One connection per connection code, shared by everybody asking about that database:
    connecting a code that is already open reuses it."""
    if not req.dbserver:
        raise HTTPException(status_code=400, detail="Missing connection details (dbserver).")
    try:
        database = chat.connect_details(req.connection_code, req.connection_name, req.dbserver)
        return {
            "connected": True,
            "connection_code": req.connection_code,
            "schema": database.schema or "Schema not available",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _result_to_dict(result):
    """Map a QueryResult to the JSON shape the frontend expects."""
    return {
        "question": result.question,
        "sql": result.sql or None,
        "data": _df_to_records(result.df) if len(result.df) > 0 else [],
        "row_count": result.row_count,
        "execution_time_ms": result.execution_time_ms,
        "explanation": result.explanation,
        "viz_image": result.viz_image,
        "text_response": result.text_response,
        "plantuml_code": result.plantuml_code,
        "html_content": result.html_content,
        "content_segments": result.content_segments,
        "error": result.error,
        "raw_content": result.raw_content,
    }


def _sse(obj: dict) -> str:
    """Serialize an event dict as one SSE `data:` frame."""
    return f"data: {json.dumps(obj)}\n\n"


@app.post("/api/ask")
def ask(req: AskRequest, x_datapallas_user: str = Header(default="")):
    # No connection guard on purpose: with no DB connected the question is a pure
    # DataPallas product question, which the engine routes to Athena accordingly.
    result = chat.ask(req.question, send_schema=req.send_schema,
                      connection_code=req.connection_code, user=x_datapallas_user)
    return _result_to_dict(result)


@app.post("/api/ask/stream")
def ask_stream(req: AskRequest, x_datapallas_user: str = Header(default="")):
    """Streaming version of /api/ask (Server-Sent Events).

    Emits {type:"delta",text} tokens as Athena types, then one
    {type:"done", ...full result...}, or {type:"error",detail}. Athena's narrative
    streams live; the table + chart are Python post-steps sent in the "done" frame.
    """
    # No connection guard on purpose: with no DB connected the question is a pure
    # DataPallas product question, which the engine routes to Athena accordingly.
    def event_stream():
        try:
            for ev in chat.ask_stream(req.question, send_schema=req.send_schema,
                                      connection_code=req.connection_code, user=x_datapallas_user):
                kind = ev.get("type")
                if kind == "delta":
                    yield _sse({"type": "delta", "text": ev.get("text", "")})
                elif kind == "result":
                    yield _sse({"type": "done", **_result_to_dict(ev["result"])})
                elif kind == "error":
                    yield _sse({"type": "error", "detail": ev.get("detail", "error")})
        except Exception as e:  # pragma: no cover - defensive
            yield _sse({"type": "error", "detail": str(e)})
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/sql")
def raw_sql(req: SqlRequest):
    code = (req.connection_code or "").strip()
    if not code:
        connected = chat.connected_codes()
        if len(connected) != 1:
            raise HTTPException(status_code=400, detail=(
                "Name the database: connection_code is required while "
                f"{len(connected)} databases are connected." if connected
                else "Not connected to a database. Call /api/connect first."))
        code = connected[0]

    try:
        df = chat.sql(req.query, code)
    except LookupError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "data": _df_to_records(df),
        "row_count": len(df),
    }
