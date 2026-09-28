package com.flowkraft.iam;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.sql.DataSource;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

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

	static final int SCHEMA_VERSION = 2;

	private static final String DB_FILENAME = "iam.db";

	private HikariDataSource dataSource;

	@PostConstruct
	public void init() throws Exception {
		Path dbPath = resolveDbPath();
		Files.createDirectories(dbPath.getParent());

		HikariConfig config = new HikariConfig();
		config.setDataSource(sqliteDataSource(dbPath));
		config.setPoolName("iam-pool");
		// IAM is a login and a handful of role lookups per request — a large pool would only add
		// contention on a database that serialises writers anyway.
		config.setMaximumPoolSize(4);
		config.setConnectionTimeout(10_000);
		// An open connection is an open file handle on the installation folder, and DataPallas is a
		// portable application people copy, zip, back up and upgrade in place. Letting the pool drain
		// to nothing means the store is locked only while somebody is actually signing in.
		config.setMinimumIdle(0);
		config.setIdleTimeout(30_000);

		dataSource = new HikariDataSource(config);

		createSchema();

		log.info("IAM store ready at {}", dbPath);
	}

	/**
	 * SQLite settings belong to a <em>connection</em>, not to the database file, so they are declared
	 * here — where the driver applies them to every connection the pool opens — rather than executed
	 * once against whichever connection happened to create the schema.
	 *
	 * <ul>
	 *   <li>{@code foreign_keys} is off by default in SQLite. Without it on every connection, the
	 *       {@code ON DELETE CASCADE} clauses in the schema are decorative and deleting a user leaves
	 *       their memberships behind.</li>
	 *   <li>{@code busy_timeout} decides how long a second writer waits before giving up with
	 *       SQLITE_BUSY — which reaches the user as a failed login or a failed user edit. Stated here
	 *       rather than inherited from whatever the driver happens to default to, because HikariCP's
	 *       connection timeout does not cover it: that one governs waiting for a pool slot, not waiting
	 *       for the database lock.</li>
	 *   <li>{@code journal_mode=WAL} lets readers proceed during a write.</li>
	 * </ul>
	 */
	private SQLiteDataSource sqliteDataSource(Path dbPath) {
		SQLiteConfig sqlite = new SQLiteConfig();
		sqlite.enforceForeignKeys(true);
		sqlite.setBusyTimeout(5_000);
		sqlite.setJournalMode(SQLiteConfig.JournalMode.WAL);

		SQLiteDataSource ds = new SQLiteDataSource(sqlite);
		ds.setUrl("jdbc:sqlite:" + dbPath.toString().replace("\\", "/"));
		return ds;
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
					    locked_params  TEXT,
					    expires_at     TEXT,
					    created_at     TEXT    NOT NULL
					)""");

			// Groups say which things a person can reach. A group carries the limits an admin sets for
			// the report authors in it, as JSON, so a new kind of limit later is one more key rather than a
			// schema change. Named user_group because "group" is an SQL keyword, and a person's place in a
			// tenant is already called a membership.
			st.execute("""
					CREATE TABLE IF NOT EXISTS user_group (
					    id            INTEGER PRIMARY KEY AUTOINCREMENT,
					    tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
					    name          TEXT    NOT NULL COLLATE NOCASE,
					    settings_json TEXT    NOT NULL DEFAULT '{}',
					    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
					    UNIQUE (tenant_id, name)
					)""");

			st.execute("""
					CREATE TABLE IF NOT EXISTS user_group_member (
					    group_id INTEGER NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
					    user_id  INTEGER NOT NULL REFERENCES app_user(id)   ON DELETE CASCADE,
					    PRIMARY KEY (group_id, user_id)
					)""");

			// Which dashboards a group's viewers may open. Rows only ever add access, so a viewer in no
			// granting group sees nothing, and a report id that no longer exists is simply ignored on read
			// — there is no foreign key to reports because reports live in files, not in this database.
			st.execute("""
					CREATE TABLE IF NOT EXISTS user_group_dashboard (
					    group_id  INTEGER NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
					    report_id TEXT    NOT NULL,
					    PRIMARY KEY (group_id, report_id)
					)""");

			// Which reports a group's members may see and run — layer 2. Rows narrow rather than add:
			// a member no group of whose names a single report may see every report, and as soon as any
			// of their groups names one they get the union of what their groups name (the owner's
			// decision 7). The opposite starting point from user_group_dashboard above, deliberately,
			// and for the reason written out in ReportGrants. No foreign key to reports for the same
			// reason as there: reports live in files, not in this database.
			st.execute("""
					CREATE TABLE IF NOT EXISTS user_group_report (
					    group_id  INTEGER NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
					    report_id TEXT    NOT NULL,
					    PRIMARY KEY (group_id, report_id)
					)""");

			// The dashboard a group's viewers land on. Nullable because most groups have no opinion, and
			// added when missing so a group table created by an earlier build of this release upgrades in
			// place, the same way locked_params does below.
			addColumnIfMissing(conn, "user_group", "default_dashboard", "TEXT");

			// Locked parameters arrived after the first share links did. Adding the column when it is
			// missing keeps every link an installation already handed out working — one that predates
			// locks simply has no value there, which reads as "locks nothing", exactly what it did.
			addColumnIfMissing(conn, "share_token", "locked_params", "TEXT");

			// Who the recipient of a link is, for the widgets that filter with ${dp_attr_<name>}. Added
			// when missing on the same terms as locked_params: a link handed out before the attribute
			// bag existed carries none, which reads as "says nothing about the viewer".
			addColumnIfMissing(conn, "share_token", "attributes", "TEXT");

			// Where a person is and what they read in. A dashboard filtered on ${dp_today} has to mean
			// the caller's today, and a Tokyo viewer's today is not a Lisbon viewer's today, so the zone
			// is a property of the person rather than of the server the report happens to run on. Both
			// are nullable: the tenant answers for a person who never said, and the server for a tenant
			// that never said. Added when missing, like the columns above, so an installation that
			// predates the builtin variables upgrades in place.
			addColumnIfMissing(conn, "app_user", "timezone", "TEXT");
			addColumnIfMissing(conn, "app_user", "locale", "TEXT");
			addColumnIfMissing(conn, "tenant", "timezone", "TEXT");
			addColumnIfMissing(conn, "tenant", "locale", "TEXT");

			// The name a group answers to inside an access filter. See Slugs for why SQL cannot name a
			// group by its display name. Groups created before this column exists are given one from
			// their name, once, so an access filter written today works against a store set up last year.
			addColumnIfMissing(conn, "user_group", "slug", "TEXT");
			backfillGroupSlugs(conn);

			st.execute("CREATE INDEX IF NOT EXISTS idx_membership_user ON membership(user_id)");
			st.execute("CREATE INDEX IF NOT EXISTS idx_share_resource ON share_token(resource_type, resource_id)");
			st.execute("CREATE INDEX IF NOT EXISTS idx_user_group_member_user ON user_group_member(user_id)");
			st.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_group_slug ON user_group(tenant_id, slug)");
			st.execute("CREATE INDEX IF NOT EXISTS idx_user_group_dashboard_group ON user_group_dashboard(group_id)");
			st.execute("CREATE INDEX IF NOT EXISTS idx_user_group_report_group ON user_group_report(group_id)");

			stampSchemaVersion(conn);
		}
	}

	/**
	 * SQLite has no {@code ADD COLUMN IF NOT EXISTS}, and running the {@code ALTER} regardless would
	 * fail the boot of every installation that already has the column. Asking the table first is the
	 * idempotent form, and keeps new columns in the same "created at boot" story as new tables.
	 */
	private void addColumnIfMissing(Connection conn, String table, String column, String definition)
			throws SQLException {

		try (Statement st = conn.createStatement();
				ResultSet rs = st.executeQuery("PRAGMA table_info(" + table + ")")) {
			while (rs.next())
				if (column.equalsIgnoreCase(rs.getString("name")))
					return;
		}

		try (Statement st = conn.createStatement()) {
			st.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
			log.info("Added the {}.{} column to the IAM store", table, column);
		}
	}

	/**
	 * Gives every group that has no slug yet the one its name produces, keeping them unique inside the
	 * tenant. Runs on each boot but touches nothing once done, because a group written by
	 * {@link com.flowkraft.iam.limits.LimitsService} always arrives with a slug.
	 */
	private void backfillGroupSlugs(Connection conn) throws SQLException {

		record Pending(long id, long tenantId, String name) {
		}

		List<Pending> pending = new ArrayList<>();
		Map<Long, Set<String>> takenPerTenant = new HashMap<>();

		try (Statement st = conn.createStatement();
				ResultSet rs = st.executeQuery("SELECT id, tenant_id, name, slug FROM user_group")) {

			while (rs.next()) {
				long tenantId = rs.getLong("tenant_id");
				String slug = rs.getString("slug");

				if (slug == null || slug.isBlank())
					pending.add(new Pending(rs.getLong("id"), tenantId, rs.getString("name")));
				else
					takenPerTenant.computeIfAbsent(tenantId, key -> new HashSet<>()).add(slug);
			}
		}

		if (pending.isEmpty())
			return;

		try (PreparedStatement ps = conn.prepareStatement("UPDATE user_group SET slug = ? WHERE id = ?")) {
			for (Pending group : pending) {

				Set<String> taken = takenPerTenant.computeIfAbsent(group.tenantId(), key -> new HashSet<>());
				String slug = Slugs.unique(Slugs.of(group.name()), taken);
				taken.add(slug);

				ps.setString(1, slug);
				ps.setLong(2, group.id());
				ps.executeUpdate();
			}
		}

		log.info("Gave {} existing group(s) a slug in the IAM store", pending.size());
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
