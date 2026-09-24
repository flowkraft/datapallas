package com.flowkraft.iam.limits;

import java.util.List;

/**
 * Where the database connections keep their data, for the connections that keep it in a file.
 *
 * <p>SQLite and DuckDB connections are a file on disk, inside the installation, under {@code db/} —
 * which is exactly the folder the file explorer opens on. So "you may not use the HR connection"
 * is only a rule if it also means "you may not download {@code db/hr/hr.db}": the file is the
 * connection, and anyone who has it can query it at home. {@link FsLimitsGuard} asks this catalog
 * which file belongs to which connection, and then asks {@link LimitsService} about the connection.
 *
 * <p>An interface, and not {@code ReportsService} itself, for the same reason as
 * {@link DatabaseConnectionCatalog}: the IAM side depends on the one question it asks, and the
 * guard's tests stay free of a {@code config/connections} folder on disk.
 */
@FunctionalInterface
public interface DatabaseFileCatalog {

	/** Every file-based database connection: its code, and the file it points at. */
	List<DatabaseFile> databaseFiles();

	/**
	 * @param connectionCode the connection's code, as a group's limits name it
	 * @param path           the database file, in whatever shape the connection file stores it
	 */
	record DatabaseFile(String connectionCode, String path) {
	}
}
