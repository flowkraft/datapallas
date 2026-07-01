"""
DataPallas Database Connection Parser

Parses DataPallas's XML database connection files and provides 
JDBC connectivity using JayDeBeApi.

Supports all databases that DataPallas supports:
- PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, IBM DB2
- SQLite, DuckDB, ClickHouse
"""

import os
import glob
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from pathlib import Path

import jaydebeapi


@dataclass
class DatabaseConnection:
    """Represents a DataPallas database connection configuration."""
    code: str
    name: str
    db_type: str
    host: Optional[str] = None
    port: Optional[str] = None
    database: Optional[str] = None
    userid: Optional[str] = None
    userpassword: Optional[str] = None
    usessl: bool = False
    default_query: Optional[str] = None
    driver: Optional[str] = None
    url: Optional[str] = None
    default_connection: bool = False
    file_path: Optional[str] = None

    def __post_init__(self):
        """Auto-compute driver and JDBC URL if not provided."""
        self._ensure_driver_and_url()

    def _ensure_driver_and_url(self):
        """
        Mirrors DataPallas's ServerDatabaseSettings.ensureDriverAndUrl() logic.
        Auto-generates JDBC driver class and URL based on database type.
        """
        if not self.db_type:
            return
        
        t = self.db_type.lower()
        
        driver_map = {
            'sqlite': ('org.sqlite.JDBC', lambda s: f"jdbc:sqlite:{s.database}"),
            'duckdb': ('org.duckdb.DuckDBDriver', lambda s: f"jdbc:duckdb:{s.database or ''}"),
            'mysql': ('com.mysql.cj.jdbc.Driver', 
                     lambda s: f"jdbc:mysql://{s.host}:{s.port}/{s.database}?useSSL={'true' if s.usessl else 'false'}&allowPublicKeyRetrieval=true&serverTimezone=UTC"),
            'mariadb': ('org.mariadb.jdbc.Driver',
                       lambda s: f"jdbc:mariadb://{s.host}:{s.port}/{s.database}"),
            'postgresql': ('org.postgresql.Driver',
                          lambda s: f"jdbc:postgresql://{s.host}:{s.port}/{s.database}"),
            'postgres': ('org.postgresql.Driver',
                        lambda s: f"jdbc:postgresql://{s.host}:{s.port}/{s.database}"),
            'sqlserver': ('com.microsoft.sqlserver.jdbc.SQLServerDriver',
                         lambda s: f"jdbc:sqlserver://{s.host}:{s.port};databaseName={s.database};encrypt=false"),
            'oracle': ('oracle.jdbc.driver.OracleDriver',
                      lambda s: f"jdbc:oracle:thin:@{s.host}:{s.port}/{s.database}"),
            'ibmdb2': ('com.ibm.db2.jcc.DB2Driver',
                      lambda s: f"jdbc:db2://{s.host}:{s.port}/{s.database}"),
            'db2': ('com.ibm.db2.jcc.DB2Driver',
                   lambda s: f"jdbc:db2://{s.host}:{s.port}/{s.database}"),
            'clickhouse': ('com.clickhouse.jdbc.ClickHouseDriver',
                          lambda s: f"jdbc:clickhouse://{s.host}:{s.port}/{s.database}"),
            'supabase': ('org.postgresql.Driver',
                        lambda s: f"jdbc:postgresql://{s.host}:{s.port}/{s.database}?currentSchema=public"),
        }
        
        if t in driver_map:
            default_driver, url_builder = driver_map[t]
            if not self.driver:
                self.driver = default_driver
            if not self.url:
                self.url = url_builder(self)

# Known JDBC driver JAR filename prefixes (version-agnostic).
# Only these JARs need to be on the JVM classpath for database connectivity.
# This avoids loading hundreds of unrelated JARs (~270) which slows the
# first connection by up to a minute.
_JDBC_JAR_PREFIXES = (
    'sqlite-jdbc',
    'duckdb_jdbc',
    'mysql-connector',
    'mariadb-java-client',
    'postgresql',
    'mssql-jdbc',
    'ojdbc',
    'jcc-',
    'clickhouse-jdbc',
    'clickhouse-client',
    'clickhouse-data',
    'clickhouse-http-client',
)


class DataPallasConnections:
    """
    Manages DataPallas database connections.

    Reads connection configurations from DataPallas's config/connections folder
    and provides JDBC connectivity.
    """

    def __init__(self,
                 jdbc_drivers_path: Optional[str] = None):
        """
        Initialize the connection manager.

        Args:
            jdbc_drivers_path: Path to JDBC driver JARs.
                             Defaults to JDBC_DRIVERS_PATH env var.
        """
        self.jdbc_drivers_path = jdbc_drivers_path or os.environ.get(
            'JDBC_DRIVERS_PATH', '/datapallas/lib'
        )
        self._connections: Dict[str, DatabaseConnection] = {}
        self._active_connection: Optional[jaydebeapi.Connection] = None
        self._all_jars: Optional[List[str]] = None
        
    def _get_all_jdbc_jars(self) -> List[str]:
        """
        Collect JDBC driver JARs from the lib directory.

        JPype starts a single JVM per Python process. JARs passed to
        jaydebeapi.connect() after the JVM is already running are NOT
        added to the classpath (known JPype issue #914). To support
        switching between database types (e.g. SQLite -> DuckDB), we
        must pass ALL driver JARs on the very first connect() call so
        every driver class is available for the lifetime of the JVM.

        Only JARs matching known JDBC driver filename prefixes are
        loaded. This reduces ~270 JARs to ~12, cutting initial
        connection time from ~60s to a few seconds.
        """
        if self._all_jars is not None:
            return self._all_jars

        search_path = os.path.join(self.jdbc_drivers_path, '**', '*.jar')
        all_jars = glob.glob(search_path, recursive=True)

        self._all_jars = [
            jar for jar in all_jars
            if os.path.basename(jar).lower().startswith(_JDBC_JAR_PREFIXES)
        ]

        if self._all_jars:
            print(f"📦 Found {len(self._all_jars)} JDBC driver JAR(s) in {self.jdbc_drivers_path} (filtered from {len(all_jars)} total)")
        else:
            print(f"⚠️ No JDBC JARs found in {self.jdbc_drivers_path}")

        return self._all_jars

    def _remap_db_path(self, db_value: str) -> str:
        """Remap a Windows host DB-file path (from the Java API) to the container's
        /datapallas/db mount, for file-based engines (SQLite, DuckDB)."""
        if not db_value or os.path.exists(db_value):
            return db_value
        db_mount = os.environ.get('DATAPALLAS_DB_PATH', '/datapallas/db')
        normalized = db_value.replace('\\', '/')
        idx = normalized.rfind('/db/')
        if idx >= 0:
            candidate = os.path.join(db_mount, normalized[idx + len('/db/'):])
            if os.path.exists(candidate):
                return candidate
        return db_value

    def _remap_host(self, host_value):
        """Remap a 'localhost' DB host to host.docker.internal so the container can
        reach a network database running on the host OS. (Network engines only — this
        is the DB host, unrelated to the DataPallas API URL.)"""
        if host_value and str(host_value).lower() in ('localhost', '127.0.0.1'):
            if os.path.exists('/.dockerenv'):
                return 'host.docker.internal'
        return host_value

    def connection_from_dbserver(self, code: str, name: Optional[str], dbserver: dict) -> DatabaseConnection:
        """Build a DatabaseConnection from the `dbserver` block the DataPallas Java
        REST API returns (passed through by the browser — the SAME source /explore-data
        lists from). File paths are remapped to the container mount; driver and JDBC URL
        are auto-derived from db_type + the remapped path/host in __post_init__."""
        db_type = (dbserver.get('type') or '').strip()
        database = dbserver.get('database')
        if database and db_type.lower() in ('sqlite', 'duckdb'):
            database = self._remap_db_path(database)
        port = dbserver.get('port')
        return DatabaseConnection(
            code=code,
            name=name or code,
            db_type=db_type,
            host=self._remap_host(dbserver.get('host')),
            port=str(port) if port is not None else None,
            database=database,
            userid=dbserver.get('userid'),
            userpassword=dbserver.get('userpassword'),
            usessl=bool(dbserver.get('usessl')),
            default_query=dbserver.get('defaultquery'),
            driver=None,  # derived in __post_init__ from the remapped path/host
            url=None,
        )

    def connect_with_config(self, conn_config: DatabaseConnection) -> jaydebeapi.Connection:
        """
        Create a JDBC connection using a DatabaseConnection config.

        Args:
            conn_config: DatabaseConnection object with connection details.

        Returns:
            A JayDeBeApi Connection object.
        """
        if not conn_config.driver:
            raise ValueError(f"No JDBC driver specified for {conn_config.code}")
        if not conn_config.url:
            raise ValueError(f"No JDBC URL specified for {conn_config.code}")

        # Collect ALL JDBC JARs so every driver is available regardless
        # of which database type is connected first (JPype issue #914).
        all_jars = self._get_all_jdbc_jars()

        # Build connection properties.
        # DuckDB needs duckdb.read_only=true because the Docker volume is
        # mounted :ro — without it DuckDB fails trying to create WAL/lock files.
        # jaydebeapi.connect() accepts either a list [user, pass] or a dict.
        db_type = (conn_config.db_type or '').lower()
        if db_type == 'duckdb':
            connect_args = {'duckdb.read_only': 'true'}
            if conn_config.userid:
                connect_args['user'] = conn_config.userid
            if conn_config.userpassword:
                connect_args['password'] = conn_config.userpassword
        else:
            creds = []
            if conn_config.userid:
                creds.append(conn_config.userid)
            if conn_config.userpassword:
                creds.append(conn_config.userpassword)
            connect_args = creds if creds else None

        print(f"🔌 Connecting to {conn_config.name} ({conn_config.db_type})")
        print(f"   Driver: {conn_config.driver}")
        print(f"   URL: {conn_config.url}")
        print(f"   JARs on classpath: {len(all_jars)}")

        # Create connection — pass all JARs so the JVM classpath includes
        # every driver from the first startup onward.
        connection = jaydebeapi.connect(
            conn_config.driver,
            conn_config.url,
            connect_args,
            all_jars if all_jars else None
        )
        
        self._active_connection = connection
        print(f"✅ Connected successfully!")
        return connection
    
    def close(self):
        """Close the active connection."""
        if self._active_connection:
            self._active_connection.close()
            self._active_connection = None
            print("🔌 Connection closed.")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
