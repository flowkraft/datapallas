package com.flowkraft.iam;

/**
 * What a user may do inside one tenant.
 *
 * <p><b>Read this before treating REPORT_AUTHOR as a limited role.</b> DataPallas runs Groovy, FreeMarker
 * and JasperReports authored by users, and none of those can be sandboxed — a script can open any
 * file the JVM can and can stop the process. Jobs also run in-process. So {@link #REPORT_AUTHOR} and
 * {@link #ADMIN} are both <em>trusted operator</em> roles: anyone holding either is
 * effectively root inside their tenant. The boundary that actually contains them is the tenant's own
 * process and installation directory, not this enum.
 *
 * <p>{@link #JOB_OPERATOR} is the one genuinely constrained role, because it can author no code and reach
 * no secret.
 *
 * <h2>Where each role stops</h2>
 * <ul>
 *   <li>{@code ADMIN} — everything.</li>
 *   <li>{@code REPORT_AUTHOR} — everything except connections and users. Authoring a cube, an
 *       exploration or a dashboard is this role; owning the credential it reads through is not.</li>
 *   <li>{@code JOB_OPERATOR} — the Processing screens only. Runs jobs, reads output and logs, opens the
 *       samples. No configuration, no reports, no connections, no users, no apps or starter packs.</li>
 * </ul>
 *
 * <p>There is deliberately no read-only role below {@code JOB_OPERATOR}. One existed
 * ({@code REPORT_VIEWER}) and was removed: everything it could reach — a dashboard, a report, an output
 * file — is produced by a run, so anyone who needed the read also needed to be an operator, and the
 * extra rung bought nothing but a fourth row in the picker. {@link #parse} still accepts the old name.
 */
public enum Role {

	// DECLARATION ORDER IS THE HIERARCHY — do not reorder, and do not insert a constant in the middle
	// without meaning to change who can do what.
	//
	// includes() compares ordinal(), so each role below is weaker than the one above it and a user is
	// granted their own role plus every weaker one. Moving a line here silently rearranges the whole
	// permission lattice: nothing fails to compile, and every @PreAuthorize in the codebase quietly
	// starts admitting a different set of people. roleHierarchyRunsFromStrongestToWeakest() in
	// IamServiceTest is what makes that mistake fail loudly instead.


	/**
	 * Manages tenants, users and memberships. Belongs to whoever runs the platform — in SaaS that is
	 * us, never the customer. Not a tenant role, so it never appears in a membership row.
	 */
	PLATFORM_ADMIN,

	/**
	 * Everything inside one tenant: connections and their secrets, users, Docker apps, scripts,
	 * templates, the LLM key.
	 */
	ADMIN,

	/**
	 * Creates and edits reports, dashboards, cubes and explorations, authors Groovy/FreeMarker/JRXML,
	 * and runs jobs. Cannot manage users or reveal stored credentials — but see the class note: code
	 * authoring is tenant-root in practice.
	 */
	REPORT_AUTHOR,

	/**
	 * Runs jobs and reads all output and logs in the tenant. Cannot edit configuration or scripts, and
	 * cannot see anything outside the Processing screens.
	 */
	JOB_OPERATOR;

	/** Spring Security authority name — {@code ROLE_} prefix, as {@code hasRole()} expects. */
	public String authority() {
		return "ROLE_" + name();
	}

	/**
	 * Reads a role by name, accepting the names these roles used to have.
	 *
	 * <p>The names live in the IAM store, so renaming the constants alone would orphan every existing
	 * membership row — including the administrator's, which is the one that locks an upgrader out of
	 * their own server with no way back in. Translating on read costs one map lookup and means an
	 * installation upgraded from 16.5.0-or-earlier keeps working untouched, whether or not anyone ever
	 * rewrites the rows.
	 *
	 * <p>{@code VIEWER} and {@code REPORT_VIEWER} name a role that no longer exists, and they resolve to
	 * {@link #JOB_OPERATOR} — the weakest one that does. That grants those users slightly more than they
	 * held before, which is the safe direction to be wrong in here: the alternative is a membership row
	 * that no longer parses, and a user who cannot sign in to a server they used yesterday.
	 */
	public static Role parse(String name) {

		String raw = name == null ? "" : name.trim().toUpperCase();

		switch (raw) {
		case "TENANT_ADMIN":
			return ADMIN;
		case "AUTHOR":
			return REPORT_AUTHOR;
		case "OPERATOR":
			return JOB_OPERATOR;
		case "VIEWER":
		case "REPORT_VIEWER":
			return JOB_OPERATOR;
		default:
			return valueOf(raw);
		}
	}

	/**
	 * True when this role includes everything {@code other} can do.
	 *
	 * <p>The tenant roles form a straight line — ADMIN ⊃ REPORT_AUTHOR ⊃ JOB_OPERATOR — so a
	 * user is granted their own role plus every weaker one. That keeps {@code @PreAuthorize} readable:
	 * an endpoint asks for the <em>weakest</em> role that may use it and stronger roles pass
	 * automatically.
	 */
	public boolean includes(Role other) {
		if (this == PLATFORM_ADMIN)
			return true;
		if (other == PLATFORM_ADMIN)
			return false;
		return ordinal() <= other.ordinal();
	}
}
