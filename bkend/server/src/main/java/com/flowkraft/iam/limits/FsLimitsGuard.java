package com.flowkraft.iam.limits;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.sourcekraft.documentburster.utils.Utils;

/**
 * What a limited report author may reach through {@code /api/system/fs/*}.
 *
 * <h2>Why this exists at all</h2>
 * Every fs endpoint — {@code /api/system/fs/*} and the file explorer at
 * {@code /api/system/fs/explorer/*} — is REPORT_AUTHOR and confined to the installation directory — but the
 * installation directory is where a limited author's own limits are kept. Without this guard,
 * {@code PUT /fs/content} on {@code config/_internal/iam.db} rewrites every user, role and group;
 * {@code GET /fs/content} on {@code config/_internal/api-key.txt} hands out a key that carries
 * ROLE_ADMIN; and {@code POST /fs/copy} with {@code overwrite=true} puts a blocked connection's
 * file over an allowed one. So the first three rules below apply to every limited author, whatever
 * their groups say about scripts, and the fourth is the {@code scripts: false} rule.
 *
 * <h2>The rules</h2>
 * <ol>
 *   <li>nothing at all under {@code config/_internal/} — not even a read;</li>
 *   <li>nothing at all under {@code config/connections/} — not even a read. Hiding a connection
 *       from the list and then serving its file, its information schema or its ER diagram
 *       through {@code GET /fs/content} would be no rule at all, and a read is the short way
 *       round the copy this rule already refused;</li>
 *   <li>no write to a {@code reporting.xml} or to a {@code .properties} file under {@code config/}
 *       — that is how a report's connection would change without {@code PUT /datasource}. A limited
 *       author therefore cannot change the Jasper default connection file, which is intended;</li>
 *   <li>with {@code scripts: false}, nothing written, copied or moved that is server code: a
 *       {@code .groovy}, a {@code .jrxml}, or anything under a {@code scripts/} folder;</li>
 *   <li>never a {@code docker-compose*.yml} or an {@code .env} file. The databases the product
 *       ships with are started from the compose file under {@code db/}, and it names every one of
 *       them together with its port and its password — the connection files rule 2 refuses,
 *       written a second time in another language;</li>
 *   <li>a database file ({@code .db}, {@code .sqlite}, {@code .sqlite3}, {@code .duckdb}) only
 *       when a connection the caller's groups allow points at it. For SQLite and DuckDB the file
 *       <em>is</em> the connection: whoever has the file can query it at home, so "you may not use
 *       the HR connection" is only a rule if it also means "you may not take {@code db/hr/hr.db}".
 *       A file no connection names is refused too — a limited author has no business with a
 *       database nobody declared, and the catalog fails closed when it cannot be read.</li>
 * </ol>
 *
 * <p>Unlimited users keep today's exact code path: every check starts by asking whether the caller
 * is limited at all, and returns immediately when they are not.
 *
 * <p>The path rules are static and take a path in any shape the endpoints produce — relative or
 * absolute, forward or backslashes, with {@code ..} in it — because they normalize it against the
 * installation directory first, through the same resolver the endpoints use. A path that lands
 * outside the installation is not this guard's business: the endpoint refuses it before the guard
 * is reached.
 */
@Component
public class FsLimitsGuard {

	private final LimitsService limitsService;
	private final DatabaseFileCatalog databaseFiles;

	@Autowired
	public FsLimitsGuard(LimitsService limitsService, DatabaseFileCatalog databaseFiles) {
		this.limitsService = limitsService;
		this.databaseFiles = databaseFiles;
	}

	// ============================================================
	// what the endpoints call
	// ============================================================

	/** Every {@code /fs/*} call, whatever it does: read, list, find, inspect, write, copy, delete. */
	public void checkAccess(String path) {

		if (!limitsService.isLimited())
			return;

		if (isUnderConfigInternal(path))
			throw new FileAccessNotAllowedException(path);

		if (isUnderConfigConnections(path))
			throw new FileAccessNotAllowedException(path);

		if (isDatabaseCredentialsFile(path))
			throw new FileAccessNotAllowedException(path);

		if (isDatabaseFileOfAnotherConnection(path))
			throw new FileAccessNotAllowedException(path);
	}

	/**
	 * The source of a copy or a move: it leaves the file where it is, but it takes a copy of it.
	 * {@code config/connections/} is already refused by {@link #checkAccess(String)}, which every
	 * call goes through, so what is left here is the server-code rule.
	 */
	public void checkSource(String path) {

		if (!limitsService.isLimited())
			return;

		checkAccess(path);

		if (!limitsService.allowsScripts() && isServerCode(path))
			throw new ScriptsNotAllowedException("read the server code in '" + path + "'");
	}

	/** Anything that creates, changes or removes a file: write, delete, and the target of a copy or a move. */
	public void checkWrite(String path) {

		if (!limitsService.isLimited())
			return;

		checkSource(path);

		if (isReportConnectionFile(path))
			throw new FileAccessNotAllowedException(path);
	}

	/** Both ends of a copy or a move, in the order the operation would touch them. */
	public void checkCopyOrMove(String fromPath, String toPath) {
		checkSource(fromPath);
		checkWrite(toPath);
	}

	// ============================================================
	// the path rules, as pure functions
	// ============================================================

	public static boolean isUnderConfigInternal(String path) {
		return startsWithFolder(installationRelative(path), "config/_internal");
	}

	public static boolean isUnderConfigConnections(String path) {
		return startsWithFolder(installationRelative(path), "config/connections");
	}

	/** A {@code reporting.xml} anywhere, or a {@code .properties} file under {@code config/}. */
	public static boolean isReportConnectionFile(String path) {

		String relative = installationRelative(path);
		String name = fileName(relative);

		if ("reporting.xml".equalsIgnoreCase(name))
			return true;

		return startsWithFolder(relative, "config") && StringUtils.endsWithIgnoreCase(name, ".properties");
	}

	/** Server code: Groovy, a Jasper template (its expressions compile to code), or anything under {@code scripts/}. */
	public static boolean isServerCode(String path) {

		String relative = installationRelative(path);

		return StringUtils.endsWithIgnoreCase(relative, ".groovy")
				|| StringUtils.endsWithIgnoreCase(relative, ".jrxml")
				|| hasFolder(relative, "scripts");
	}

	/** A {@code docker-compose*.yml} or an {@code .env} file: the database credentials, in bulk. */
	public static boolean isDatabaseCredentialsFile(String path) {

		String relative = installationRelative(path);

		if (relative.isEmpty())
			return false;

		String name = fileName(relative).toLowerCase(Locale.ROOT);

		boolean compose = name.startsWith("docker-compose") && (name.endsWith(".yml") || name.endsWith(".yaml"));

		return compose || name.equals(".env") || name.startsWith(".env.") || name.endsWith(".env");
	}

	/**
	 * A database file that no connection this caller may use points at — including a database file
	 * no connection points at at all.
	 *
	 * <p>Not static, because the answer depends on who is asking and on what the connections say;
	 * a path that is not a database file at all is not this rule's business and comes back false.
	 */
	public boolean isDatabaseFileOfAnotherConnection(String path) {

		String relative = installationRelative(path);

		if (!isDatabaseFile(relative))
			return false;

		for (DatabaseFileCatalog.DatabaseFile candidate : databaseFiles.databaseFiles())
			if (isSamePath(relative, candidate.path()) && limitsService.allowsConnection(candidate.connectionCode()))
				return false;

		return true;
	}

	/** The extensions a single-file database uses. */
	static boolean isDatabaseFile(String path) {
		return StringUtils.endsWithIgnoreCase(path, ".db") || StringUtils.endsWithIgnoreCase(path, ".sqlite")
				|| StringUtils.endsWithIgnoreCase(path, ".sqlite3") || StringUtils.endsWithIgnoreCase(path, ".duckdb");
	}

	/**
	 * The two paths are the same file inside the installation. The connection file stores its
	 * database wherever it likes — absolute, relative, backslashed — so both ends are normalized
	 * the same way before they are compared.
	 */
	private static boolean isSamePath(String installationRelativePath, String otherPath) {

		String other = installationRelative(otherPath);

		return !other.isEmpty() && other.equalsIgnoreCase(installationRelativePath);
	}

	/**
	 * The path as it sits inside the installation directory, with forward slashes and no {@code ..}
	 * left in it. Empty when it is not inside the installation at all.
	 */
	static String installationRelative(String path) {

		if (StringUtils.isBlank(path))
			return "";

		// resolveWithinPortableDir(".") is the installation directory itself, asked for through the
		// one resolver that knows where it is — rather than a second copy of that lookup here.
		Path base = Paths.get(Utils.resolveWithinPortableDir("."));
		Path candidate = Paths.get(path.replace("\\", "/"));
		Path resolved = (candidate.isAbsolute() ? candidate : base.resolve(candidate)).normalize();

		if (!resolved.startsWith(base))
			return "";

		return base.relativize(resolved).toString().replace("\\", "/");
	}

	/**
	 * Case-insensitive, because Windows and macOS are: {@code config/_INTERNAL/iam.db} is the same
	 * file as {@code config/_internal/iam.db} there, and a rule that missed it would be no rule.
	 */
	private static boolean startsWithFolder(String relative, String folder) {
		return relative.equalsIgnoreCase(folder) || StringUtils.startsWithIgnoreCase(relative, folder + "/");
	}

	private static boolean hasFolder(String relative, String folder) {
		for (String segment : relative.split("/"))
			if (segment.equalsIgnoreCase(folder))
				return true;
		return false;
	}

	private static String fileName(String relative) {
		int lastSlash = relative.lastIndexOf('/');
		return lastSlash < 0 ? relative : relative.substring(lastSlash + 1);
	}
}
