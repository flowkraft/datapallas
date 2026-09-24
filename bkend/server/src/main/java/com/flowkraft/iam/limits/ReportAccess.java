package com.flowkraft.iam.limits;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.flowkraft.embed.TokenRequest;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.dashboards.DashboardGrants;
import com.flowkraft.iam.reports.ReportGrantAccess;

import jakarta.servlet.http.HttpServletRequest;

/**
 * May this caller run this report at all? Both layers, asked in one place.
 *
 * <p>Layer 1 — the connection a report declares — is what this class is mostly about and is
 * described below. Layer 2 — the reports an administrator granted to somebody's groups — is asked
 * first, through {@code ReportGrantAccess}, so that every door that already calls this one gets it
 * without a second call site to forget. Layer 2 only ever narrows: a granted report whose connection
 * the caller may not use is still refused here.
 *
 * <p>A group's connection limits used to stop an author writing a query against a connection they
 * may not use, and stopped nothing at the moment a report somebody else wrote was run. That was the
 * hole: the limit was on authoring, and running is how data actually leaves. So a report whose
 * datasource needs connection C is neither listed to, nor runnable by, anybody whose groups do not
 * allow C — whatever their role.
 *
 * <h2>Where it is asked</h2>
 * At dispatch, in the server, where the caller's {@link Authentication} still exists. Jobs run
 * in-process on job-executor threads and {@code SecurityContextHolder} is thread-local, so the
 * engine could not ask this question even if it wanted to — and being refused before a job record, a
 * log file or a partial output exists is the better answer anyway.
 *
 * <h2>Who is not refused</h2>
 * <ul>
 *   <li>anybody unlimited — no groups setting limits, an administrator, the installation key;</li>
 *   <li>a token request: an embed or share token carries no user, was verified against exactly one
 *       report, and is already tighter than any group rule;</li>
 *   <li>a dashboard an administrator granted to this person's groups. Granting it <em>is</em> the
 *       decision that they may see what it reads, so layer 2 admits it and layer 1 does not take it
 *       back (the owner's decision 1 carve-out, 2026-09-24). This is the one direction in which a
 *       grant widens a limit, and it is deliberate.</li>
 * </ul>
 */
@Component
public class ReportAccess {

	private final LimitsService limits;

	private final ReportConnectionCatalog catalog;

	private final IamRepository repository;

	private final DashboardGrants grants;

	private final ReportGrantAccess reportGrants;

	@Autowired
	public ReportAccess(LimitsService limits, ReportConnectionCatalog catalog, IamRepository repository,
			DashboardGrants grants, ReportGrantAccess reportGrants) {
		this.limits = limits;
		this.catalog = catalog;
		this.repository = repository;
		this.grants = grants;
		this.reportGrants = reportGrants;
	}

	// ============================================================
	// the doors
	// ============================================================

	/**
	 * The job doors: {@code POST /api/jobs} for a report id, which every job type resolves to a
	 * settings file before the engine is started.
	 *
	 * @throws ReportNotRunnableException 403 naming the connection this caller lacks
	 */
	public void assertReportRunnable(String reportId) {
		assertRunnable(reportId, catalog.connectionsOfReport(reportId));
	}

	/**
	 * The same, for the doors that hold a settings file and no report id: a {@code burst} submitted
	 * without one (the engine runs {@code config/burst/settings.xml}) and a resumed job, whose
	 * settings file comes out of its {@code .progress} file.
	 */
	public void assertSettingsFileRunnable(String reportId, String settingsFilePath) {
		assertRunnable(StringUtils.defaultIfBlank(reportId, nameOf(settingsFilePath)),
				catalog.connectionsOfSettingsFile(settingsFilePath));
	}

	/**
	 * The data doors — a report's config, its data, a pivot of it. The same rule for a signed-in
	 * limited caller, because reading C's data through a pivot is still reading C's data; token
	 * requests keep today's behaviour.
	 */
	public void assertReportReadable(String reportId, HttpServletRequest request) {

		if (TokenRequest.isTokenRequest(request))
			return;

		assertReportRunnable(reportId);
	}

	// ============================================================
	// the listing side
	// ============================================================

	/** May this caller run a report declaring these connections? The question the list asks. */
	public boolean allowsDeclaredConnections(List<String> connectionCodes) {

		LimitSettings applied = limits.currentLimits();
		if (applied == null)
			return true;

		if (connectionCodes == null)
			return false;

		return connectionCodes.stream().filter(StringUtils::isNotBlank).allMatch(applied::allowsConnection);
	}

	/** Is this caller limited at all? Lets a list skip the work entirely for everybody else. */
	public boolean isLimited() {
		return limits.currentLimits() != null;
	}

	/**
	 * Layer 2 for a list: the report ids the caller's groups restrict them to, or {@code null} when
	 * they may see every report. Asked once per list rather than once per row.
	 */
	public Set<String> reportIdsAllowedByGrants() {
		return reportGrants.restrictedToOrNull();
	}

	/**
	 * Is this report a dashboard granted to the caller's groups — the decision-1 carve-out?
	 *
	 * <p>It is asked of both layers: a dashboard an administrator ticked for somebody's groups opens
	 * for them whether or not report grants narrow what else they may run.
	 */
	public boolean isGrantedDashboard(String reportId) {
		return isGrantedDashboard(SecurityContextHolder.getContext().getAuthentication(), reportId);
	}

	// ============================================================
	// the rule
	// ============================================================

	private void assertRunnable(String reportId, Optional<List<String>> declared) {

		// The carve-out first, because it answers both layers: an administrator ticked this dashboard
		// for this person's groups, which is the decision that they may open it and whatever it reads.
		if (isGrantedDashboard(reportId))
			return;

		// Layer 2, before layer 1 and not inside it: report grants apply to every person an
		// administrator administers, including one whose groups set no connection limits at all. The
		// refusals are therefore two different sentences — "not one of your reports" and "needs a
		// connection you do not have" — and the person is told the first thing that is true of them.
		reportGrants.assertGranted(reportId);

		LimitSettings applied = limits.currentLimits();
		if (applied == null)
			return;

		List<String> connectionCodes = declared.orElseThrow(() -> ReportNotRunnableException.unreadable(reportId));

		for (String connectionCode : connectionCodes)
			if (StringUtils.isNotBlank(connectionCode) && !applied.allowsConnection(connectionCode))
				throw new ReportNotRunnableException(reportId, connectionCode, applied.connectionsOrEmpty());
	}

	private boolean isGrantedDashboard(Authentication authentication, String reportId) {

		if (authentication == null || StringUtils.isBlank(reportId))
			return false;

		if (!grants.isPublishedDashboard(reportId))
			return false;

		return repository.findUserByUsername(authentication.getName())
				.map(user -> grants.grantedIdsOf(user.id()).contains(reportId)).orElse(false);
	}

	/** A settings file with no report id still has a name worth putting in the refusal. */
	private String nameOf(String settingsFilePath) {

		if (StringUtils.isBlank(settingsFilePath))
			return StringUtils.EMPTY;

		String unix = settingsFilePath.replace("\\", "/");
		int lastSlash = unix.lastIndexOf('/');
		if (lastSlash <= 0)
			return unix;

		String folder = unix.substring(0, lastSlash);
		return folder.substring(folder.lastIndexOf('/') + 1);
	}
}
