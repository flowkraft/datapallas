package com.flowkraft.iam.reports;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.reports.ReportCatalog.CatalogReport;

/**
 * Which reports a group grants, and therefore which ones a person may see and run — layer 2.
 *
 * <h2>The rule, and why it is the opposite of the dashboards one</h2>
 * A person whose groups name no report at all may see every report; as soon as any one of their
 * groups names reports, they get the union of what their groups name, and a group naming none
 * contributes nothing (the owner's decision 7, 2026-09-24).
 *
 * <p>{@code DashboardGrants} starts from the other end — a viewer sees no dashboard until an admin
 * ticks one — and it can afford to, because a dashboard viewer is a role that did not exist before
 * grants did. Reports cannot: defaulting to none would stop every existing installation's operators
 * working the moment they upgraded, since nobody has ticked anything yet. What makes "all" safe is
 * layer 1, which is always on and is not a grant anybody has to remember to make.
 *
 * <h2>Judged across all of a person's groups, never per group</h2>
 * Per group, "grants nothing means all" would let a single unrestricted group hand everything back
 * and the feature would undo itself: somebody in "Sales team" (grants {@code sales-monthly}) and in
 * "All staff" (grants nothing) must end up with {@code sales-monthly}, not with everything. The
 * union of their groups' rows is exactly that rule — empty means "no group named anything", which is
 * the only case that means "all" — so there is nothing per-group to get wrong here.
 *
 * <h2>Layer 2 never widens layer 1</h2>
 * Nothing in this class allows anything: it only ever narrows a list or refuses an id. A granted
 * report whose connection the caller may not use stays refused by layer 1, which runs after this.
 *
 * <h2>Deleted reports</h2>
 * Grants are report ids in a database and reports are folders on disk, so the two can disagree. The
 * group dialog is shown what is stored, missing ones included, so an admin can untick them; what a
 * person may open is reconciled against {@link ReportCatalog} on every read, exactly as the
 * dashboards are. A grant naming a report that no longer exists therefore grants nothing, and — this
 * is the part worth knowing — it still counts as "this group names reports", so it keeps narrowing.
 *
 * <h2>No cache</h2>
 * Read on every call, like the limits and the dashboard grants are, so a report an admin has just
 * unticked stops running at once rather than at the next restart.
 */
@Service
public class ReportGrants {

	private final IamRepository repository;

	private final ReportCatalog catalog;

	@Autowired
	public ReportGrants(IamRepository repository, ReportCatalog catalog) {
		this.repository = repository;
		this.catalog = catalog;
	}

	// ============================================================
	// the catalog
	// ============================================================

	/** Every report, sorted by name — what the group dialog offers to tick. */
	public List<CatalogReport> available() {
		return catalog.reports();
	}

	// ============================================================
	// what a group grants
	// ============================================================

	/** The report ids this group grants, as stored — including any that no longer exist. */
	public List<String> reportsOfGroup(long groupId) {
		return repository.findGroupReports(groupId);
	}

	/** Replace a group's reports. Checked first, so a bad request leaves the group as it was. */
	public void setGroupReports(long groupId, List<String> reportIds) {
		repository.setGroupReports(groupId, validated(reportIds));
	}

	/**
	 * @return the distinct ids, in the order given
	 * @throws IllegalArgumentException naming the first id that is not a report — a 400, because
	 *                                  granting a report that does not exist is a typo and never
	 *                                  something the dialog sends
	 */
	public List<String> validated(List<String> reportIds) {

		if (reportIds == null)
			return List.of();

		List<String> distinct = new ArrayList<>(new LinkedHashSet<>(reportIds));
		for (String reportId : distinct)
			if (!catalog.exists(reportId))
				throw new IllegalArgumentException("No such report: " + reportId);

		return distinct;
	}

	// ============================================================
	// what a person gets
	// ============================================================

	/** The report ids granted to this person by any of their groups, deleted ones included. */
	public List<String> grantedIdsOf(long userId) {
		return repository.findReportsOfUser(userId);
	}

	/**
	 * Is this person restricted to a list of reports at all?
	 *
	 * <p>False means no group of theirs names a single report, which is the default and means every
	 * report. It is asked before any per-report work, so the common case — an installation where
	 * nobody has granted anything — costs one query and no reconciliation.
	 */
	public boolean isRestricted(long userId) {
		return !repository.findReportsOfUser(userId).isEmpty();
	}

	/**
	 * May this person see and run this report, as far as layer 2 is concerned?
	 *
	 * <p>Layer 1 is asked separately and can still refuse. A blank id is answered "yes" here: a
	 * request with no report id names no report to grant, and it is layer 1, which resolves the
	 * settings file, that decides what such a request would actually run.
	 */
	public boolean grants(long userId, String reportId) {

		List<String> granted = repository.findReportsOfUser(userId);
		if (granted.isEmpty())
			return true;

		return reportId == null || reportId.isBlank() || granted.contains(reportId);
	}

	/**
	 * The ids this person is restricted to, or {@code null} when they may see every report.
	 *
	 * <p>{@code null} and not an empty set, because the two are opposite answers here: empty would
	 * read as "nothing", and "no rows" means "everything". Handed to a list so it asks the store once
	 * instead of once per report.
	 */
	public Set<String> restrictedToOrNull(long userId) {

		List<String> granted = repository.findReportsOfUser(userId);
		if (granted.isEmpty())
			return null;

		return new LinkedHashSet<>(granted);
	}

	/**
	 * What the Edit User dialog shows in its "Reports" line: the reports this person's groups name
	 * that still exist, by name, or {@code null} when their groups name none and they may see all.
	 */
	public List<String> effectiveReportsOf(long userId) {

		Set<String> granted = restrictedToOrNull(userId);
		if (granted == null)
			return null;

		return catalog.reports().stream().filter(report -> granted.contains(report.id())).map(CatalogReport::id)
				.toList();
	}
}
