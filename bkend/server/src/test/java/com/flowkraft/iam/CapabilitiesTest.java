package com.flowkraft.iam;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/**
 * The capability table the frontend renders from.
 *
 * <p>It is the one place a role name turns into "may this screen exist", and the AI Hub's door reads
 * {@code dashboardsOnly} from it rather than looking at roles, so a wrong flag here is a viewer who
 * lands in the authoring app or an administrator who is thrown out of it.
 *
 * <p>No store and no Spring context: this is a pure function of the role names Spring resolved, and
 * the controller's other collaborators play no part in it.
 */
class CapabilitiesTest {

	private final AuthController authController = new AuthController();

	/**
	 * A user holds their own role <em>and every weaker one</em>
	 * ({@code IamUserDetailsService.authoritiesOf}), which is what the roles below spell out — an
	 * administrator arrives here holding DASHBOARD_VIEWER too.
	 */
	@Test
	void onlyADashboardViewerIsDashboardsOnly() {

		assertTrue(capabilities(Role.DASHBOARD_VIEWER.name()).get("dashboardsOnly"));

		assertFalse(capabilities(Role.JOB_OPERATOR.name(), Role.DASHBOARD_VIEWER.name()).get("dashboardsOnly"));
		assertFalse(capabilities(Role.REPORT_AUTHOR.name(), Role.JOB_OPERATOR.name(), Role.DASHBOARD_VIEWER.name())
				.get("dashboardsOnly"));
		assertFalse(capabilities(Role.ADMIN.name(), Role.REPORT_AUTHOR.name(), Role.JOB_OPERATOR.name(),
				Role.DASHBOARD_VIEWER.name()).get("dashboardsOnly"));
		assertFalse(capabilities().get("dashboardsOnly"));
	}

	/** A viewer may render nothing else: no authoring, no configuration, not even a job run. */
	@Test
	void aDashboardViewerHasNoOtherCapability() {

		Map<String, Boolean> viewer = capabilities(Role.DASHBOARD_VIEWER.name());

		viewer.forEach((capability, allowed) -> {
			if (!"dashboardsOnly".equals(capability))
				assertFalse(allowed, capability + " must be false for a dashboard viewer");
		});
	}

	/** The roles above it are untouched by the new one — an operator still runs jobs and nothing more. */
	@Test
	void theRolesAboveItAreUnchanged() {

		Map<String, Boolean> operator = capabilities(Role.JOB_OPERATOR.name(), Role.DASHBOARD_VIEWER.name());
		assertTrue(operator.get("runJobs"));
		assertFalse(operator.get("editReports"));
		assertFalse(operator.get("manageUsers"));

		Map<String, Boolean> author = capabilities(Role.REPORT_AUTHOR.name(), Role.JOB_OPERATOR.name(),
				Role.DASHBOARD_VIEWER.name());
		assertTrue(author.get("editReports"));
		assertTrue(author.get("runJobs"));
		assertFalse(author.get("manageUsers"));

		Map<String, Boolean> admin = capabilities(Role.ADMIN.name(), Role.REPORT_AUTHOR.name(),
				Role.JOB_OPERATOR.name(), Role.DASHBOARD_VIEWER.name());
		assertTrue(admin.get("manageUsers"));
		assertTrue(admin.get("revealSecrets"));
	}

	/** Every flag the table produces is a Boolean, so a screen can never read null and render it. */
	@Test
	void everyCapabilityIsAnswered() {

		Map<String, Boolean> viewer = capabilities(Role.DASHBOARD_VIEWER.name());

		assertEquals(capabilities().keySet(), viewer.keySet());
		viewer.values().forEach(org.junit.jupiter.api.Assertions::assertNotNull);
	}

	private Map<String, Boolean> capabilities(String... roles) {
		return authController.capabilitiesOf(List.of(roles));
	}
}
