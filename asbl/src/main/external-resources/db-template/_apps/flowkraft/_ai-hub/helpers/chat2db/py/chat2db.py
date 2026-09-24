"""
Chat2DB - Natural Language to SQL Workflow

Core engine for Chat2DB: natural language → SQL → results → visualization.
Served via FastAPI (see api.py). UI is rendered by the Next.js frontend.

This module uses Athena (the data & analytics oracle) exclusively.
"""

import os
import re
import io
import base64
import hashlib
import threading
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Union, Tuple
from datetime import datetime

import pandas as pd
import sqlparse

from rb_connections import DataPallasConnections, DatabaseConnection
from letta_chat2db import LettaChat2DB, LettaResponse


@dataclass
class QueryResult:
    """Result of a Chat2DB query or conversational response."""
    question: str
    sql: str
    df: pd.DataFrame
    explanation: Optional[str] = None
    execution_time_ms: float = 0.0
    row_count: int = 0
    error: Optional[str] = None
    # For conversational responses (chit-chat, guidance) where no SQL is generated
    text_response: Optional[str] = None
    # Visualization: Athena's suggested Python code + rendered base64 PNG
    viz_code: Optional[str] = None
    viz_image: Optional[str] = None  # base64-encoded PNG
    # Diagram and HTML content for inline preview
    plantuml_code: Optional[str] = None
    html_content: Optional[str] = None
    # Ordered content segments preserving Athena's rendering order
    content_segments: Optional[list] = None
    # Athena's raw response (full markdown, unprocessed) for copy-to-clipboard
    raw_content: Optional[str] = None


@dataclass
class OpenDatabase:
    """One database, open for everybody who asks about it.

    Keyed by connection code: a question always runs against the database it names, and two people
    asking about the same database share one JDBC connection, which is harmless because Chat2DB only
    reads. `config` outlives the connection: an idle connection is closed, and reopened from `config`
    the next time its code is asked about.
    """
    config: DatabaseConnection
    fingerprint: str
    connection: Optional[Any] = None
    schema: Optional[str] = None
    last_used: float = field(default_factory=time.monotonic)
    # One statement at a time per connection: JDBC connections are not safe to share across threads.
    lock: threading.RLock = field(default_factory=threading.RLock)


class Chat2DB:
    """
    Chat2DB engine — natural language to SQL with visualization.

    Uses Athena (the data & analytics oracle) for natural language to SQL.
    Served via FastAPI; the Next.js frontend handles the chat UI.

    Usage (programmatic):
        chat = Chat2DB()
        chat.connect_details("db-northwind-postgres", "Northwind", dbserver)
        result = chat.ask("What are the top 5 products by sales?", connection_code="db-northwind-postgres")
        result.df  # pandas DataFrame with results
        result.explanation  # AI-generated explanation
    """
    
    DANGEROUS_SQL_PATTERNS = [
        r'\bDELETE\b',
        r'\bDROP\b',
        r'\bTRUNCATE\b',
        r'\bUPDATE\b',
        r'\bALTER\b',
        r'\bINSERT\b',
        r'\bCREATE\b',
        r'\bGRANT\b',
        r'\bREVOKE\b',
    ]
    
    def __init__(self,
                 connection_code: Optional[str] = None,
                 connection_config: Optional[DatabaseConnection] = None,
                 block_dangerous: bool = True,
                 max_rows: int = 1000):
        """
        Initialize Chat2DB.

        Args:
            connection_code: DataPallas connection code (e.g., 'db-northwind-postgres').
            connection_config: Or provide a DatabaseConnection directly.
            block_dangerous: Block DELETE, DROP, UPDATE, etc. queries.
            max_rows: Maximum rows to return from queries.
        """
        # Load settings from environment
        self.block_dangerous = block_dangerous if block_dangerous else os.environ.get('BLOCK_DANGEROUS_SQL', 'true').lower() == 'true'
        self.max_rows = max_rows if max_rows != 1000 else int(os.environ.get('MAX_RESULT_ROWS', '1000'))
        
        # Initialize connection manager
        self._conn_manager = DataPallasConnections()

        # Open databases, one per connection code, shared by everybody (see OpenDatabase).
        self._databases: Dict[str, OpenDatabase] = {}
        self._databases_lock = threading.Lock()

        # Initialize Letta AI client (Athena)
        self._letta = LettaChat2DB()

        # Each user's last query result, for follow-up viz requests like "now chart that".
        # Per user, so one person's "chart that" never draws somebody else's rows.
        self._last_results: Dict[str, Tuple[pd.DataFrame, float]] = {}

        # Connections (and last results) unused this long are closed (dropped), or a
        # long-running server would hold every database anybody ever asked about.
        self.idle_seconds = int(os.environ.get('CHAT2DB_IDLE_MINUTES', '30')) * 60
        self._stop_sweeping = threading.Event()
        threading.Thread(target=self._sweep_idle_loop, name='chat2db-idle-sweep', daemon=True).start()

        # Connect if a config was provided. Connect-by-code is retired: the browser
        # now supplies full connection details via connect_details(), because virtual
        # "sample" connections don't exist as files to look up on disk.
        if connection_config:
            self.connect_with_config(connection_config)

    # -------------------------------------------------------------------------
    # Connection Management
    # -------------------------------------------------------------------------

    def connect_with_config(self, config: DatabaseConnection) -> OpenDatabase:
        """Open the database for config.code, or reuse the one already open for it.

        Reused only while its details are unchanged: an administrator who edits the connection
        gets a fresh connection with the new details the next time anybody connects.
        """
        fingerprint = hashlib.sha256(repr(config).encode('utf-8')).hexdigest()

        with self._databases_lock:
            key = config.code.lower()
            database = self._databases.get(key)
            if database is None or database.fingerprint != fingerprint:
                if database is not None:
                    self._close_database(database)
                database = OpenDatabase(config=config, fingerprint=fingerprint)
                self._databases[key] = database

        self._ensure_open(database)
        return database

    def connect_details(self, code: str, name, dbserver: dict) -> OpenDatabase:
        """Connect using the connection details supplied by the browser, which read
        them from the DataPallas REST API — the same source /explore-data lists from.
        (Sample connections are virtual/in-memory and never exist as files, so the
        browser-provided details are the only reliable source.)"""
        config = self._conn_manager.connection_from_dbserver(code, name, dbserver)
        return self.connect_with_config(config)

    def database(self, connection_code: Optional[str]) -> Optional[OpenDatabase]:
        """The database connected for this code, reopened if it was closed for being idle.

        None when the code was never connected here: the details to open it only ever come from
        /api/connect, which the AI Hub checks against the caller's rights first.
        """
        if not connection_code:
            return None
        with self._databases_lock:
            # Case-insensitive: Athena is handed the code lower-cased, and her SQL tool sends it back so.
            database = self._databases.get(connection_code.lower())
        if database is not None:
            self._ensure_open(database)
        return database

    def connected_codes(self) -> List[str]:
        """Codes with an open JDBC connection right now."""
        with self._databases_lock:
            return [database.config.code for database in self._databases.values() if database.connection is not None]

    def _ensure_open(self, database: OpenDatabase):
        with database.lock:
            if database.connection is None:
                connection = self._conn_manager.connect_with_config(database.config)
                self._make_read_only(connection, database.config.code)
                database.connection = connection
                # Fetch and cache schema
                database.schema = self._fetch_schema(connection, database.config)
                self._rollback(connection)
            database.last_used = time.monotonic()

    @staticmethod
    def _make_read_only(connection, connection_code: str):
        """Flag the JDBC connection read-only and take it out of autocommit, once, when it opens.

        The same second line of defence as DataPallas' SqlExecutor.queryOnReadOnly: the SQL check
        is what refuses writes, and on top of it every query runs in a read-only transaction that
        is always rolled back (see _query), so a statement that slips past the check still cannot
        change anything. These connections are Chat2DB's own, so the flags are set for good rather
        than set and restored around each query.

        Read-only goes first: several drivers refuse it once a transaction is open. A driver that
        refuses either (SQLite once open, DuckDB, which fixes read-only when opened and is opened
        read-only by rb_connections, ClickHouse) is logged and the connection is used anyway.
        """
        jconn = getattr(connection, 'jconn', None)
        if jconn is None:
            return
        try:
            jconn.setReadOnly(True)
        except Exception as e:
            print(f"Connection '{connection_code}' would not go read-only: {e}")
        try:
            jconn.setAutoCommit(False)
        except Exception as e:
            print(f"Connection '{connection_code}' would not open a transaction: {e}")

    @staticmethod
    def _rollback(connection):
        """Undo whatever the last statement did. A no-op for a driver left in autocommit."""
        jconn = getattr(connection, 'jconn', None)
        try:
            if jconn is not None and not jconn.getAutoCommit():
                jconn.rollback()
        except Exception as e:
            print(f"Rollback failed: {e}")

    def _query(self, database: OpenDatabase, sql: str) -> pd.DataFrame:
        """Run one statement and read at most max_rows rows, then roll back.

        The row cap is applied while fetching, never by rewriting the SQL: an appended LIMIT is a
        syntax error on SQL Server (TOP) and Oracle (FETCH FIRST), and was also skipped whenever the
        word "limit" appeared anywhere in the query. The trailing semicolon is dropped because
        Oracle's driver rejects it; the statement is otherwise run exactly as written.
        """
        statement = sql.strip().rstrip(';').rstrip()
        with database.lock:
            connection = database.connection
            cursor = connection.cursor()
            try:
                cursor.execute(statement)
                columns = [d[0] for d in cursor.description] if cursor.description else []
                rows = cursor.fetchmany(self.max_rows) if columns else []
            finally:
                try:
                    cursor.close()
                except Exception:
                    pass
                self._rollback(connection)
                database.last_used = time.monotonic()
        return pd.DataFrame.from_records(rows, columns=columns, coerce_float=True)

    def _close_database(self, database: OpenDatabase):
        """Close a database's JDBC connection, if open. It keeps its config, to be reopened on use."""
        with database.lock:
            if database.connection is not None:
                try:
                    database.connection.close()
                except Exception:
                    pass
                database.connection = None

    def _sweep_idle_loop(self):
        while not self._stop_sweeping.wait(60):
            try:
                self.sweep_idle()
            except Exception as e:
                print(f"⚠️ Idle sweep failed: {e}")

    def sweep_idle(self):
        """Close connections and forget last results unused for idle_seconds."""
        cutoff = time.monotonic() - self.idle_seconds

        with self._databases_lock:
            idle = [(code, database) for code, database in self._databases.items()
                    if database.connection is not None and database.last_used < cutoff]
        for code, database in idle:
            # Not while a query runs: a busy connection is skipped and looked at next time.
            if database.lock.acquire(blocking=False):
                try:
                    if database.last_used < cutoff:
                        self._close_database(database)
                        print(f"Closed idle connection '{code}'")
                finally:
                    database.lock.release()

        for user, (_, last_used) in list(self._last_results.items()):
            if last_used < cutoff:
                self._last_results.pop(user, None)

    def _last_df(self, user: str) -> Optional[pd.DataFrame]:
        entry = self._last_results.get(user)
        return entry[0] if entry else None

    def _fetch_schema(self, connection, connection_config: DatabaseConnection) -> Optional[str]:
        """
        Fetch database table names for AI context. The caller caches the result.

        Only fetches TABLE NAMES (not columns) to keep token count minimal.
        This serves as an "index" for Athena - she can look up column details
        from the full schema files on disk when needed.

        Supports: SQLite, DuckDB, PostgreSQL, MySQL, MariaDB, SQL Server,
                  Oracle, IBM Db2, ClickHouse
        """
        if not connection:
            return None

        try:
            schema_parts = []
            db_type = ''
            # Sample connections are virtual (no on-disk schema files); detect them the
            # same way Java does (Settings.java) — by the connection-code prefix.
            conn_code = (connection_config.code if connection_config else '') or ''
            is_sample = 'rbt-sample' in conn_code.lower()

            # DATABASE TYPE (vendor) is emitted unconditionally in _build_user_prompt,
            # next to CONNECTION CODE — so it reaches Athena even with Send Tables off and
            # need not be repeated here. db_type still drives the dialect branches below.
            if connection_config:
                db_type = connection_config.db_type.upper()
                if is_sample:
                    schema_parts.append("SCHEMA: sample database — table names WITH their columns are listed below,")
                    schema_parts.append("everything needed to write SQL directly. Write a ```sql block; the engine runs it.")
                else:
                    schema_parts.append("TABLE INDEX: Only table names listed (not columns) to keep context minimal.")
                    schema_parts.append("For column details, this connection's config/schema files are on disk under")
                    schema_parts.append("config/connections/<CONNECTION CODE>/ — grep them using the connection code above.")
                schema_parts.append("")

            tables = []
            cursor = connection.cursor()

            # =========================================================
            # SQLite / DuckDB
            # =========================================================
            if db_type in ('SQLITE', 'DUCKDB'):
                try:
                    if db_type == 'SQLITE':
                        cursor.execute(
                            "SELECT name FROM sqlite_master WHERE type='table' "
                            "AND name NOT LIKE 'sqlite_%' ORDER BY name"
                        )
                    else:  # DuckDB
                        cursor.execute("SELECT table_name FROM information_schema.tables "
                                       "WHERE table_schema = 'main' ORDER BY table_name")
                    tables = [row[0] for row in cursor.fetchall()]
                except Exception as e:
                    print(f"⚠️ {db_type} table list fetch failed: {e}")

            # =========================================================
            # Oracle
            # =========================================================
            elif db_type == 'ORACLE':
                try:
                    cursor.execute("""
                        SELECT DISTINCT table_name FROM ALL_TAB_COLUMNS
                        WHERE owner = USER ORDER BY table_name
                    """)
                    tables = [row[0] for row in cursor.fetchall()]
                except Exception as e:
                    print(f"⚠️ Oracle table list fetch failed: {e}")

            # =========================================================
            # IBM Db2
            # =========================================================
            elif db_type in ('IBMDB2', 'DB2'):
                try:
                    cursor.execute("""
                        SELECT DISTINCT tabname FROM SYSCAT.COLUMNS
                        WHERE tabschema = CURRENT SCHEMA ORDER BY tabname
                    """)
                    tables = [row[0] for row in cursor.fetchall()]
                except Exception as e:
                    print(f"⚠️ IBM Db2 table list fetch failed: {e}")

            # =========================================================
            # ClickHouse
            # =========================================================
            elif db_type == 'CLICKHOUSE':
                try:
                    cursor.execute("""
                        SELECT DISTINCT table FROM system.columns
                        WHERE database = currentDatabase() ORDER BY table
                    """)
                    tables = [row[0] for row in cursor.fetchall()]
                except Exception as e:
                    print(f"⚠️ ClickHouse table list fetch failed: {e}")

            # =========================================================
            # PostgreSQL, MySQL, MariaDB, SQL Server - information_schema
            # =========================================================
            if not tables:
                try:
                    if db_type == 'SQLSERVER':
                        schema_filter = "table_schema = 'dbo'"
                    elif db_type in ('MYSQL', 'MARIADB'):
                        schema_filter = "table_schema = DATABASE()"
                    else:  # PostgreSQL and others
                        schema_filter = "table_schema = 'public'"

                    cursor.execute(f"""
                        SELECT DISTINCT table_name
                        FROM information_schema.tables
                        WHERE {schema_filter} AND table_type = 'BASE TABLE'
                        ORDER BY table_name
                    """)
                    tables = [row[0] for row in cursor.fetchall()]
                except Exception as e:
                    print(f"⚠️ information_schema fetch failed: {e}")

            cursor.close()

            # Columns ONLY for sample DBs (small + no on-disk schema files to grep). Fetched
            # once here at connect and cached in OpenDatabase.schema — NOT per request. Real
            # DB-server connections stay names-only (scale) and grep on-disk files instead.
            cols_by_table = {}
            if tables and is_sample:
                try:
                    ccur = connection.cursor()
                    if db_type == 'SQLITE':
                        for t in tables:
                            try:
                                ccur.execute("SELECT name, type FROM pragma_table_info(?)", (t,))
                                cols_by_table[t] = [(r[0], r[1]) for r in ccur.fetchall()]
                            except Exception:
                                pass
                    else:
                        # information_schema covers DuckDB (and PostgreSQL/MySQL/… if ever sampled)
                        col_filter = "table_schema = 'main'" if db_type == 'DUCKDB' else "table_schema NOT IN ('information_schema', 'pg_catalog')"
                        ccur.execute(
                            "SELECT table_name, column_name, data_type FROM information_schema.columns "
                            f"WHERE {col_filter} ORDER BY table_name, ordinal_position"
                        )
                        for tn, cn, dt in ccur.fetchall():
                            cols_by_table.setdefault(tn, []).append((cn, dt))
                    ccur.close()
                except Exception as e:
                    print(f"⚠️ sample column fetch failed: {e}")

            if tables:
                schema_parts.append(f"TABLES ({len(tables)}):")
                for table in tables:
                    # Quote tables with spaces
                    display = f'"{table}"' if ' ' in table else table
                    cols = cols_by_table.get(table)
                    if cols:
                        col_str = ", ".join(f"{c} {t}" for c, t in cols)
                        schema_parts.append(f"  - {display}({col_str})")
                    else:
                        schema_parts.append(f"  - {display}")
            else:
                schema_parts.append(f"Connected to: {connection_config.name}")
                schema_parts.append("(Table list could not be fetched automatically)")

            return "\n".join(schema_parts) if schema_parts else None

        except Exception as e:
            print(f"⚠️ Could not fetch table list: {e}")
            return None
    
    # -------------------------------------------------------------------------
    # Visualization
    # -------------------------------------------------------------------------

    def _execute_viz(self, viz_code: str, df: pd.DataFrame) -> Optional[str]:
        """
        Execute Athena's visualization code and capture the result as base64 PNG.

        The code runs in a sandboxed namespace with `df` (the query result),
        `pd` (pandas), and plotting libraries pre-injected.

        Args:
            viz_code: Python code from Athena (matplotlib/plotly).
            df: The query result DataFrame.

        Returns:
            Base64-encoded PNG string, or None if execution fails.
        """
        try:
            import matplotlib
            matplotlib.use('Agg')  # Non-interactive backend
            import matplotlib.pyplot as plt

            # Close any leftover figures
            plt.close('all')

            # Build a safe namespace for exec
            namespace = {
                'df': df,
                'pd': pd,
                'plt': plt,
            }

            # Try to inject plotly if available
            try:
                import plotly.express as px
                import plotly.graph_objects as go
                namespace['px'] = px
                namespace['go'] = go
            except ImportError:
                pass

            # Try to inject seaborn if available
            try:
                import seaborn as sns
                namespace['sns'] = sns
            except ImportError:
                pass

            # Execute Athena's code
            exec(viz_code, namespace)

            # Capture the current matplotlib figure
            fig = plt.gcf()
            if fig.get_axes():
                buf = io.BytesIO()
                fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
                buf.seek(0)
                img_b64 = base64.b64encode(buf.read()).decode('utf-8')
                buf.close()
                plt.close('all')
                return img_b64

            plt.close('all')
            return None

        except Exception as e:
            print(f"⚠️ Visualization failed: {e}")
            return None

    # -------------------------------------------------------------------------
    # Query Methods
    # -------------------------------------------------------------------------

    def ask(self, question: str, send_schema: bool = True,
            connection_code: Optional[str] = None, user: str = '') -> QueryResult:
        """
        Ask a natural language question about your data.

        Args:
            question: Natural language question (e.g., "Show top 5 products by revenue")
            send_schema: If True (default), send table names as an index to help Athena.
                        She can grep the full schema on disk for column details.
                        Set False for chit-chat or non-database topics.
            connection_code: The database the question is about, connected earlier with
                        connect_details(). Empty for a DataPallas product question.
            user: Who is asking; keeps their last result apart from everybody else's.

        Returns:
            QueryResult with SQL, DataFrame, and optional explanation.

        Example:
            result = chat.ask("Which customers have the highest order totals?", connection_code="db-northwind")
            result.df  # View the data
            result.sql  # See the generated SQL
        """
        try:
            database = self._database_asked_about(connection_code)
        except Exception as e:
            return QueryResult(question=question, sql="", df=pd.DataFrame(), error=str(e))
        connected = database is not None
        # The table index only makes sense with a live connection AND Send Tables on.
        # With no connection this is a pure DataPallas product question (no schema).
        schema_to_send = database.schema if (send_schema and connected) else None
        conn_code = database.config.code.lower() if connected else None
        db_type = database.config.db_type if connected else None
        response = self._letta.generate_sql(question, schema_to_send, db_connected=connected, connection_code=conn_code, db_type=db_type)
        return self._finish(question, response, database, user)

    def _database_asked_about(self, connection_code: Optional[str]) -> Optional[OpenDatabase]:
        """The database a question names, or None for a product question (no code).

        A code that is not connected here is an error rather than a quiet product question: the
        browser believes it is connected (Chat2DB was restarted since), and answering without the
        database would look like an answer about it.
        """
        if not connection_code:
            return None
        database = self.database(connection_code)
        if database is None:
            raise LookupError(f"The connection '{connection_code}' is not open in Chat2DB "
                              "(it was restarted). Press Connect again.")
        return database

    def ask_stream(self, question: str, send_schema: bool = True,
                   connection_code: Optional[str] = None, user: str = ''):
        """Streaming counterpart of ask(). Yields event dicts:

          {"type": "delta",  "text": str}                Athena's reply, token by token
          {"type": "result", "result": QueryResult}      final structured result
          {"type": "error",  "detail": str}

        Athena's narrative streams live; the SQL is executed and the chart rendered
        only after she finishes (they are Python post-steps), then emitted in "result".
        connection_code and user as in ask().
        """
        try:
            database = self._database_asked_about(connection_code)
        except Exception as e:
            yield {"type": "error", "detail": str(e)}
            return
        connected = database is not None
        # The table index only makes sense with a live connection AND Send Tables on.
        # With no connection this is a pure DataPallas product question (no SQL).
        schema_to_send = database.schema if (send_schema and connected) else None
        conn_code = database.config.code.lower() if connected else None
        db_type = database.config.db_type if connected else None
        full = ""
        try:
            for delta in self._letta.stream_generate(question, schema_to_send, db_connected=connected, connection_code=conn_code, db_type=db_type):
                full += delta
                yield {"type": "delta", "text": delta}
        except Exception as e:
            yield {"type": "error", "detail": f"Athena stream failed: {e}"}
            return

        response = self._letta.enrich_response(full)
        try:
            result = self._finish(question, response, database, user)
        except Exception as e:
            yield {"type": "error", "detail": str(e)}
            return
        yield {"type": "result", "result": result}

    def _finish(self, question: str, response, database: Optional[OpenDatabase], user: str) -> QueryResult:
        """Post-Athena processing shared by ask() and ask_stream(): decide whether the
        reply is conversational / viz-only / a SQL query, run the SQL, render the chart.
        """
        sql = response.sql

        # No live DB connection → product-question mode: never execute SQL even if
        # Athena included a snippet. Fall through to the conversational branch below.
        if sql and database is None:
            sql = None

        # No SQL extracted - this could be:
        # 1. Conversational response ("Hello!", "How are you?")
        # 2. DataPallas guidance ("How do I burst a PDF?")
        # 3. Clarification question from Athena
        # All are valid responses - not errors!
        if not sql:
            # Athena may return viz code without SQL (e.g. follow-up "pie chart please")
            # Execute it against the stored DataFrame from this user's previous query
            last_df = self._last_df(user)
            if response.viz_code and last_df is not None and len(last_df) > 0:
                self._last_results[user] = (last_df, time.monotonic())
                viz_image = self._execute_viz(response.viz_code, last_df)
                return QueryResult(
                    question=question,
                    sql="",
                    df=last_df,
                    row_count=len(last_df),
                    viz_code=response.viz_code,
                    viz_image=viz_image,
                    # Use narrative (code blocks stripped) — don't show raw Python in UI
                    text_response=response.narrative,
                    explanation=response.narrative,
                    plantuml_code=response.plantuml_code,
                    html_content=response.html_content,
                    content_segments=response.content_segments,
                    raw_content=response.content,
                )

            # Pure conversational response (no SQL, no viz)
            return QueryResult(
                question=question,
                sql="",
                df=pd.DataFrame(),
                text_response=response.narrative,
                viz_code=response.viz_code,
                plantuml_code=response.plantuml_code,

                html_content=response.html_content,
                content_segments=response.content_segments,
                raw_content=response.content,
            )
        
        # Check for dangerous operations
        if self.block_dangerous:
            for pattern in self.DANGEROUS_SQL_PATTERNS:
                if re.search(pattern, sql, re.IGNORECASE):
                    return QueryResult(
                        question=question,
                        sql=sql,
                        df=pd.DataFrame(),
                        error=f"Blocked dangerous SQL operation: {pattern.strip()}"
                    )
        
        # Execute query
        try:
            start_time = datetime.now()
            
            # At most max_rows rows, capped while fetching (see _query) - never by appending LIMIT.
            df = self._query(database, sql)
            self._last_results[user] = (df, time.monotonic())  # Store for follow-up viz requests

            execution_time = (datetime.now() - start_time).total_seconds() * 1000
            
            result = QueryResult(
                question=question,
                sql=sql,
                df=df,
                execution_time_ms=execution_time,
                row_count=len(df),
                viz_code=response.viz_code,
                plantuml_code=response.plantuml_code,

                html_content=response.html_content,
                content_segments=response.content_segments,
                raw_content=response.content,
            )

            # Execute visualization if Athena suggested one
            if response.viz_code and len(df) > 0:
                result.viz_image = self._execute_viz(response.viz_code, df)

            # Use Athena's inline narrative (text around code blocks) as explanation
            result.explanation = response.narrative

            return result
            
        except Exception as e:
            return QueryResult(
                question=question,
                sql=sql,
                df=pd.DataFrame(),
                error=str(e)
            )
    
    def sql(self, query: str, connection_code: str) -> pd.DataFrame:
        """
        Execute raw SQL directly.

        Args:
            query: SQL query string.
            connection_code: The database to run it on, connected earlier with connect_details().

        Returns:
            pandas DataFrame with results, at most max_rows rows. Read-only and rolled
            back like every query here (see _query).
        """
        database = self.database(connection_code)
        if database is None:
            raise LookupError(f"The connection '{connection_code}' is not connected in Chat2DB. Use connect() first.")

        return self._query(database, query)

    def schema(self, connection_code: str) -> str:
        """Get the cached database schema."""
        database = self.database(connection_code)
        return (database.schema if database else None) or "Schema not available"

    def close(self):
        """Close all connections."""
        self._stop_sweeping.set()
        with self._databases_lock:
            databases = list(self._databases.values())
            self._databases.clear()
        for database in databases:
            self._close_database(database)
        self._letta.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
