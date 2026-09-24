package com.flowkraft.iam.limits;

import java.util.List;

/**
 * The database connection ids an admin may put in a group's limits.
 *
 * <p>An interface, and not {@code ReportsService} itself, so that the IAM side depends on the one
 * question it actually asks — "which database connections exist?" — rather than on the reporting
 * layer. It also keeps the group tests free of a {@code config/connections} folder on disk.
 */
public interface DatabaseConnectionCatalog {

	/** Database connections only. Email, SMS and the rest are not something a group can limit. */
	List<String> databaseConnectionIds();
}
