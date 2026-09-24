package com.flowkraft.iam.dashboards;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.dashboards.PublishedDashboardCatalog.PublishedDashboard;

/**
 * The two dashboard lists: the one an admin grants from, and the one the signed-in person may open.
 *
 * <p>They live together, and not in {@code GroupsController} or {@code UsersController}, because they
 * answer the same question from two sides and must never disagree about which reports are dashboards.
 * The paths are written out per method for the same reason — one is administration, the other is
 * every signed-in user asking about themselves.
 */
@RestController
public class DashboardsController {

	@Autowired
	private DashboardGrants grants;

	@Autowired
	private DashboardAccess dashboardAccess;

	@Autowired
	private IamRepository repository;

	/** What the group dialog offers to tick. */
	@GetMapping(value = "/api/iam/dashboards", produces = MediaType.APPLICATION_JSON_VALUE)
	@PreAuthorize("hasRole('ADMIN')")
	public List<PublishedDashboard> publishedDashboards() {
		return grants.published();
	}

	/**
	 * What the caller may open, and where they land.
	 *
	 * <p>Signed in is the only requirement: a dashboard viewer is answered with their groups' grants
	 * and their default, and everybody else with the whole catalog and no default, because no other
	 * role has ever been restricted to a list of dashboards and this is not where that would start.
	 * The AI Hub's viewer page and its dashboard switcher are both rendered from this one answer.
	 */
	@GetMapping(value = "/api/me/dashboards", produces = MediaType.APPLICATION_JSON_VALUE)
	public MyDashboardsDto myDashboards() {

		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

		if (!dashboardAccess.isDashboardViewer(authentication))
			return new MyDashboardsDto(null, grants.published());

		// A viewer with no record in the store — there is no such caller today, since a token request
		// never reaches here — is answered with nothing rather than with everything.
		return repository.findUserByUsername(authentication.getName())
				.map(user -> new MyDashboardsDto(grants.defaultDashboardOf(user.id()), grants.dashboardsOf(user.id())))
				.orElseGet(() -> new MyDashboardsDto(null, List.of()));
	}

	/**
	 * @param defaultDashboard the report id to open first, or null: an empty list, or any role that is
	 *                         not a dashboard viewer
	 */
	public record MyDashboardsDto(String defaultDashboard, List<PublishedDashboard> dashboards) {
	}
}
