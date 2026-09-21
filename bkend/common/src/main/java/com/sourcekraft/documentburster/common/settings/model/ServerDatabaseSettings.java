package com.sourcekraft.documentburster.common.settings.model;

import com.sourcekraft.documentburster.common.db.ContainerAddresses;
import com.sourcekraft.documentburster.utils.DumpToString;

public class ServerDatabaseSettings extends DumpToString {
	private static final long serialVersionUID = 1L;

	public String type;
	public String host;
	public String port;
	public String database;
	public String userid;
	public String userpassword;
	public boolean usessl;
	public String defaultquery;

	public String driver; // JDBC driver class
	public String url;    // Complete JDBC URL

	/**
	 * How long to wait for a ClickHouse that is not answering. The driver's own default is a two minute
	 * connect wait, tried four times: a machine that refuses the connection says so at once, but one
	 * behind a firewall that drops the packets - a company network, a CI host, a laptop VPN - leaves the
	 * report, and whoever is waiting for it, hanging for nearly nine minutes before "ClickHouse
	 * unavailable" can even be shown. Ten seconds, tried twice, says the same thing in twenty. Only the
	 * wait to be let in is shortened; a query that is running keeps as long as it needs.
	 */
	public static final String CLICKHOUSE_CONNECT_OPTIONS = "?connection_timeout=10000&retry=1";

	public void ensureDriverAndUrl() {
		if (this.type == null) return;
		String t = this.type.toLowerCase();

		// A database saved as localhost is on the machine the user saved it from. Inside the shipped Docker
		// server localhost is this container, so the same connection is re-addressed to where that service
		// actually is - by container name on the shared network, or through the host gateway (plan §4 F2n).
		// Outside a container this returns host and port unchanged, so desktop and a host-JVM Server keep
		// building exactly the URL they always did. The saved settings are not modified: only the URL built
		// from them, and a URL that was saved with the host inside it (below).
		String[] reachable = ContainerAddresses.resolve(this.host, this.port);
		String host = reachable[0];
		String port = reachable[1];

		switch (t) {
			case "sqlite":
				if (isBlank(this.driver)) this.driver = "org.sqlite.JDBC";
				// database holds the file path for sqlite
				if (isBlank(this.url))    this.url    = "jdbc:sqlite:" + this.database;
				break;

			case "duckdb":
				if (isBlank(this.driver)) this.driver = "org.duckdb.DuckDBDriver";
				// database holds the file path for duckdb (like sqlite)
				if (isBlank(this.url))    this.url    = "jdbc:duckdb:" + this.database;
				break;

			case "mysql":
				if (isBlank(this.driver)) this.driver = "com.mysql.cj.jdbc.Driver";
				if (isBlank(this.url)) {
					String ssl = this.usessl ? "true" : "false";
					this.url = "jdbc:mysql://" + host + ":" + port + "/" + database
					        + "?useSSL=" + ssl + "&allowPublicKeyRetrieval=true&serverTimezone=UTC";
				}
				break;

			case "mariadb":
				if (isBlank(this.driver)) this.driver = "org.mariadb.jdbc.Driver";
				if (isBlank(this.url))    this.url    = "jdbc:mariadb://" + host + ":" + port + "/" + database;
				break;

			case "postgresql":
			case "postgres":
				if (isBlank(this.driver)) this.driver = "org.postgresql.Driver";
				if (isBlank(this.url))    this.url    = "jdbc:postgresql://" + host + ":" + port + "/" + database;
				break;

			case "sqlserver":
				if (isBlank(this.driver)) this.driver = "com.microsoft.sqlserver.jdbc.SQLServerDriver";
				if (isBlank(this.url))    this.url    = "jdbc:sqlserver://" + host + ":" + port + ";databaseName=" + database + ";encrypt=false";
				break;

			case "oracle":
				if (isBlank(this.driver)) this.driver = "oracle.jdbc.driver.OracleDriver";
				if (isBlank(this.url))    this.url    = "jdbc:oracle:thin:@" + host + ":" + port + "/" + database;
				break;

			case "ibmdb2":
			case "db2":
				if (isBlank(this.driver)) this.driver = "com.ibm.db2.jcc.DB2Driver";
				if (isBlank(this.url))    this.url    = "jdbc:db2://" + host + ":" + port + "/" + database;
				break;

			case "clickhouse":
				if (isBlank(this.driver)) this.driver = "com.clickhouse.jdbc.ClickHouseDriver";
				if (isBlank(this.url))    this.url    = "jdbc:clickhouse://" + host + ":" + port + "/" + database
						+ CLICKHOUSE_CONNECT_OPTIONS;
				break;

			case "supabase":
				if (isBlank(this.driver)) this.driver = "org.postgresql.Driver";
				if (isBlank(this.url))    this.url    = "jdbc:postgresql://" + host + ":" + port + "/" + database + "?currentSchema=public";
				break;

			case "timescaledb":
				if (isBlank(this.driver)) this.driver = "org.postgresql.Driver";
				if (isBlank(this.url))    this.url    = "jdbc:postgresql://" + host + ":" + port + "/" + database;
				break;
		}
		this.url = urlReachableFromHere(this.url, this.host, this.port, host, port);
	}

	/**
	 * A URL that was saved (or typed) with the address inside it - "jdbc:mariadb://localhost:3307/northwind"
	 * - is rewritten to the same address this method's caller resolved. Only an exact "<saved host>:<saved
	 * port>" is replaced, so a URL pointing somewhere else is left alone, and outside a container the
	 * resolved address is the saved one, which makes this a no-op.
	 */
	static String urlReachableFromHere(String url, String savedHost, String savedPort, String host, String port) {
		if (isBlank(url) || savedHost == null || savedPort == null)
			return url;
		String saved = savedHost.trim() + ":" + savedPort.trim();
		String now = host + ":" + port;
		return saved.equals(now) ? url : url.replace(saved, now);
	}

	private static boolean isBlank(String s) { return s == null || s.isEmpty(); }
}