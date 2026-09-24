package com.flowkraft.iam.reports;

import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.model.AppUser;

/**
 * May this caller have this report at all — layer 2, asked by the list and by dispatch.
 *
 * <p>The same shape as {@code DashboardAccess}: one class that turns "who is asking?" into a yes, a
 * no or a 403, so that the four run doors and the data doors cannot each answer it differently.
 *
 * <h2>Who is asked about</h2>
 * Every signed-in person an administrator administers. An administrator, the installation key and an
 * unauthenticated caller — a scheduled or polled run — are not subject to grants, which is exactly
 * the set layer 1 lets through as well ({@code LimitsService.isAdministrativePrincipal}); asking the
 * same question in one place is what keeps the two layers from constraining different people.
 *
 * <p>Token requests are handled by the door before this is reached, for the reason
 * {@code DashboardAccess} states: a token was verified against one report and is tighter than any
 * grant.
 */
@Component
public class ReportGrantAccess {

	private final LimitsService limits;

	private final IamRepository repository;

	private final ReportGrants grants;

	@Autowired
	public ReportGrantAccess(LimitsService limits, IamRepository repository, ReportGrants grants) {
		this.limits = limits;
		this.repository = repository;
		this.grants = grants;
	}

	/** Is the caller of the request being served subject to report grants at all? */
	public boolean isSubjectToGrants() {
		return isSubjectToGrants(SecurityContextHolder.getContext().getAuthentication());
	}

	public boolean isSubjectToGrants(Authentication authentication) {
		return !limits.isAdministrativePrincipal(authentication);
	}

	/**
	 * @throws ReportNotGrantedException 403, when the caller's groups name reports and this is not one
	 *                                   of them. A caller whose groups name none is granted every
	 *                                   report — the default decision 7 settled.
	 */
	public void assertGranted(String reportId) {
		assertGranted(SecurityContextHolder.getContext().getAuthentication(), reportId);
	}

	public void assertGranted(Authentication authentication, String reportId) {

		if (!isSubjectToGrants(authentication))
			return;

		// A signed-in caller with no record in the store cannot be shown to have been granted
		// anything, so they are refused rather than defaulted to everything.
		boolean granted = repository.findUserByUsername(authentication.getName())
				.map(user -> grants.grants(user.id(), reportId)).orElse(false);

		if (!granted)
			throw new ReportNotGrantedException(reportId);
	}

	/**
	 * The ids the caller is restricted to, or {@code null} when they may see every report — asked once
	 * by a list, rather than once per row.
	 */
	public Set<String> restrictedToOrNull() {

		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (!isSubjectToGrants(authentication))
			return null;

		// Unknown caller, restricted to nothing: an empty set hides every report, which is the
		// fail-closed twin of the refusal above.
		//
		// Written out rather than mapped over the Optional on purpose: "no grants at all" IS null
		// here, and Optional.map would fold that null into an empty Optional — turning "may see
		// every report" into "may see none", which is the opposite answer.
		Optional<AppUser> user = repository.findUserByUsername(authentication.getName());
		if (user.isEmpty())
			return Set.of();

		return grants.restrictedToOrNull(user.get().id());
	}
}
