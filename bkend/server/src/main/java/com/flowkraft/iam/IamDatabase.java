package com.flowkraft.iam;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

import javax.sql.DataSource;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.flowkraft.common.AppPaths;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

/**
 * Owns the IAM store: a SQLite file at {@code config/_internal/iam.db}.
 *
 * <h2>Why SQLite and not JPA</h2>
 * DataPallas has no application database — all state is XML and Groovy on disk. Introducing JPA,
 * Flyway and a schema-migration story for five small tables would be the largest dependency change in
 * the project for the smallest part of this feature. {@code sqlite-jdbc} and HikariCP are already on
 * the classpath, so this adds <b>zero new dependencies</b>, and the schema is created idempotently at
 * boot with a {@code schema_version} row to hang future migrations off.
 *
 * <h2>Concurrency</h2>
 * SQLite serialises writers. WAL journalling lets readers proceed during a write, and the pool is kept
 * small deliberately — IAM traffic is a login here and a role check there, not a workload.
 */
@Component
public class IamDatabase {

	private static final Logger log = LoggerFactory.getLogger(IamDatabase.class);

	static final int SCHEMA_VERSION = 1;

	private static final String DB_FILENAME = "iam.db";

	private HikariDataSource dataSource;

	@PostConstruct
	public void init() throws Exception {
		Path dbPath = resolveDbPath();
		Files.createDirectories(dbPath.getParent());

		HikariConfig config = new HikariConfig();
		config.setJdbcUrl("jdbc:sqlite:" + dbPath.toString().replace("\\", "/"));
		config.setPoolName("iam-pool");
		// IAM is a login and a handful of role lookups per request — a large pool would only add
		// contention on a database that serialises writers anyway.
		config.setMaximumPoolSize(4);
		config.setConnectionTimeout(10_000);

		dataSource = new HikariDataSource(config);

		createSchema();

		log.info("IAM store ready at {}", dbPath);
	}

	@PreDestroy
	public void close() {
		if (dataSource != null && !dataSource.isClosed())
			dataSource.close();
	}

	public DataSource getDataSource() {
		return dataSource;
	}

	public Connection getConnection() throws SQLException {
		return dataSource.getConnection();
	}

	/**
	 * The IAM store lives beside the other internal state so it is backed up, copied and packaged by
	 * everything that already knows about {@code config/_internal} — including the master key it sits
	 * next to.
	 */
	Path resolveDbPath() throws IOException {
		String portableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		if (StringUtils.isBlank(portableDir))
			portableDir = System.getProperty("user.dir");
		return Paths.get(portableDir, "config", "_internal", DB_FILENAME).toAbsolutePath().normalize();
	}

	/**
	 * Idempotent — every statement is {@code IF NOT EXISTS}, so a restart against an existing store is
	 * a no-op and a fresh install gets a complete schema.
	 */
	private void createSchema() throws SQLException {
		try (Connection conn = getConnection(); Statement st = conn.createStatement()) {

			st.execute("PRAGMA journal_mode=WAL");
			st.execute("PRAGMA foreign_keys=ON");

			st.execute("""
					CREATE TABLE IF NOT EXISTS schema_version (
					    version     INTEGER NOT NULL,
					    applied_at  TEXT    NOT NULL
					)""");

			st.execute("""
					CREATE TABLE IF NOT EXISTS tenant (
					    id            INTEGER PRIMARY KEY AUTOINCREMENT,
					    code          TEXT    NOT NULL UNIQUE,
					    display_name  TEXT    NOT NULL,
					    home_dir      TEXT    NOT NULL,
					    customer_ref  TEXT,
					    status        TEXT    NOT NULL DEFAULT 'ACTIVE',
					    created_at    TEXT    NOT NULL
					)""");

			st.execute("""
					CREATE TABLE IF NOT EXISTS app_user (
					    id             INTEGER PRIMARY KEY AUTOINCREMENT,
					    username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
					    email          TEXT,
					    password_hash  TEXT,
					    status         TEXT    NOT NULL DEFAULT 'ACTIVE',
					    platform_admin INTEGER NOT NULL DEFAULT 0,
					    created_at     TEXT    NOT NULL
					)""");

			// A user may belong to several tenants with a different role in each, which is what makes
			// "switch department" possible without duplicating the person.
			st.execute("""
					CREATE TABLE IF NOT EXISTS membership (
					    user_id    INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
					    tenant_id  INTEGER NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
					    role       TEXT    NOT NULL,
					    PRIMARY KEY (user_id, tenant_id)
					)""");

			// Machine callers: the AI Hub proxy, and any embedding app that needs a credential it can
			// actually carry. Only the hash is stored — a lost token is reissued, never recovered.
			st.execute("""
					CREATE TABLE IF NOT EXISTS api_token (
					    id          INTEGER PRIMARY KEY AUTOINCREMENT,
					    tenant_id   INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
					    user_id     INTEGER          REFERENCES app_user(id) ON DELETE SET NULL,
					    token_hash  TEXT    NOT NULL UNIQUE,
					    label       TEXT,
					    scopes      TEXT,
					    expires_at  TEXT,
					    revoked     INTEGER NOT NULL DEFAULT 0,
					    created_at  TEXT    NOT NULL
					)""");

			// Published dashboards are shared by emailed link and embedded in third-party pages, where
			// no session or CSRF token can travel. A share token is that link's credential.
			st.execute("""
					CREATE TABLE IF NOT EXISTS share_token (
					    id             INTEGER PRIMARY KEY AUTOINCREMENT,
					    tenant_id      INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
					    resource_type  TEXT    NOT NULL,
					    resource_id    TEXT    NOT NULL,
					    token_hash     TEXT    NOT NULL UNIQUE,
					    expires_at     TEXT,
					    created_at     TEXT    NOT NULL
					)""");

			st.execute("CREATE INDEX IF NOT EXISTS idx_membership_user ON membership(user_id)");
			st.execute("CREATE INDEX IF NOT EXISTS idx_share_resource ON share_token(resource_type, resource_id)");

			stampSchemaVersion(conn);
		}
	}

	private void stampSchemaVersion(Connection conn) throws SQLException {
		try (Statement st = conn.createStatement()) {
			var rs = st.executeQuery("SELECT COUNT(*) FROM schema_version");
			rs.next();
			if (rs.getInt(1) == 0)
				st.execute("INSERT INTO schema_version (version, applied_at) VALUES (" + SCHEMA_VERSION
						+ ", datetime('now'))");
		}
	}
}
