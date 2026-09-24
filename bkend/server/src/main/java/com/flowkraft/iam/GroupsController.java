package com.flowkraft.iam;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.iam.dashboards.DashboardGrants;
import com.flowkraft.iam.dtos.GroupDto;
import com.flowkraft.iam.limits.LimitSettings;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;
import com.flowkraft.iam.reports.ReportGrants;

/**
 * Group administration — {@code ADMIN} only, the same rule and the same shape as
 * {@link UsersController}, which is the screen these endpoints sit next to.
 *
 * <p>A separate controller rather than more methods on that one: groups are their own tab, their own
 * service and their own four failures, and the users file is already long.
 */
@RestController
@RequestMapping(value = "/api/iam/groups", produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('ADMIN')")
public class GroupsController {

	@Autowired
	private LimitsService limitsService;

	@Autowired
	private IamService iamService;

	@Autowired
	private DashboardGrants dashboardGrants;

	@Autowired
	private ReportGrants reportGrants;

	@GetMapping
	public List<GroupDto> listGroups(@RequestParam(required = false) String tenantCode) {
		return limitsService.groupsInTenant(resolveTenantCode(tenantCode)).stream().map(this::toDto).toList();
	}

	@PostMapping
	public ResponseEntity<?> createGroup(@RequestBody Map<String, Object> body) {
		try {
			// Checked before the group exists, for the same reason createUser checks its group ids first:
			// a body naming a dashboard that is not one must create nothing at all.
			List<String> dashboards = dashboardGrants.validated(dashboardsIn(body));
			String defaultDashboard = dashboardGrants.validatedDefault(dashboards, defaultDashboardIn(body));
			List<String> reports = reportGrants.validated(reportsIn(body));

			UserGroup created = limitsService.createGroup(resolveTenantCode(tenantCodeIn(body)), nameIn(body),
					settingsIn(body));

			dashboardGrants.setGroupDashboards(created.id(), dashboards, defaultDashboard);
			reportGrants.setGroupReports(created.id(), reports);

			return ResponseEntity.status(HttpStatus.CREATED).body(toDto(reload(created)));

		} catch (LimitsService.GroupNameTakenException e) {
			return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));

		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	@PutMapping("/{groupId}")
	public ResponseEntity<?> updateGroup(@PathVariable long groupId, @RequestBody Map<String, Object> body) {
		try {
			List<String> dashboards = dashboardGrants.validated(dashboardsIn(body));
			String defaultDashboard = dashboardGrants.validatedDefault(dashboards, defaultDashboardIn(body));
			List<String> reports = reportGrants.validated(reportsIn(body));

			UserGroup updated = limitsService.updateGroup(groupId, nameIn(body), settingsIn(body));
			dashboardGrants.setGroupDashboards(groupId, dashboards, defaultDashboard);
			reportGrants.setGroupReports(groupId, reports);

			return ResponseEntity.ok(toDto(reload(updated)));

		} catch (LimitsService.UnknownGroupException e) {
			return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));

		} catch (LimitsService.GroupNameTakenException e) {
			return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));

		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	@DeleteMapping("/{groupId}")
	public ResponseEntity<?> deleteGroup(@PathVariable long groupId) {
		try {
			limitsService.deleteGroup(groupId);
			return ResponseEntity.noContent().build();

		} catch (LimitsService.UnknownGroupException e) {
			return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));

		} catch (LimitsService.GroupHasMembersException e) {
			// 409 rather than a cascade: deleting a group would otherwise quietly change what its
			// members may do.
			return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
		}
	}

	// ============================================================
	// helpers
	// ============================================================

	private GroupDto toDto(UserGroup group) {
		return new GroupDto(group.id(), group.name(), LimitSettings.parse(group.settingsJson()),
				limitsService.membersOf(group.id()), reportGrants.reportsOfGroup(group.id()),
				dashboardGrants.dashboardsOfGroup(group.id()), group.defaultDashboard());
	}

	/** The default dashboard is a column, so the row has to be read again after it is written. */
	private UserGroup reload(UserGroup group) {
		return limitsService.findGroup(group.id()).orElse(group);
	}

	/**
	 * The dialog sends the whole set of ticked boxes, so a body without the key means "none" — the same
	 * meaning an empty list has. That matters for the Part B screens, which knew nothing about
	 * dashboards: they send no key, and a group they save keeps no grant it never showed.
	 */
	private List<String> dashboardsIn(Map<String, Object> body) {

		Object raw = body.get("dashboards");
		if (raw == null)
			return List.of();

		if (!(raw instanceof List<?> values))
			throw new IllegalArgumentException("dashboards must be a list of report ids");

		List<String> reportIds = new java.util.ArrayList<>();
		for (Object value : values)
			reportIds.add(value == null ? null : value.toString());

		return reportIds;
	}

	/**
	 * The reports the dialog ticked. A body without the key means "none named", the same as an empty
	 * list — and for reports that means the group narrows nobody, which is what every screen that
	 * predates report grants must keep doing when it saves a group.
	 */
	private List<String> reportsIn(Map<String, Object> body) {

		Object raw = body.get("reports");
		if (raw == null)
			return List.of();

		if (!(raw instanceof List<?> values))
			throw new IllegalArgumentException("reports must be a list of report ids");

		List<String> reportIds = new java.util.ArrayList<>();
		for (Object value : values)
			reportIds.add(value == null ? null : value.toString());

		return reportIds;
	}

	private String defaultDashboardIn(Map<String, Object> body) {
		Object defaultDashboard = body.get("defaultDashboard");
		return defaultDashboard == null ? null : defaultDashboard.toString();
	}

	private String nameIn(Map<String, Object> body) {
		Object name = body.get("name");
		return name == null ? null : name.toString();
	}

	private String tenantCodeIn(Map<String, Object> body) {
		Object tenantCode = body.get("tenantCode");
		return tenantCode == null ? null : tenantCode.toString();
	}

	/**
	 * The body carries the settings as an object, and it is turned into {@link LimitSettings} here —
	 * which is where an unknown key becomes a 400 rather than a field that saves and is never read.
	 */
	private LimitSettings settingsIn(Map<String, Object> body) {
		return LimitSettings.parseObject(body.get("settings"));
	}

	/** Default to the caller's own tenant — all a single-tenant deployment ever needs. */
	private String resolveTenantCode(String requested) {
		if (requested != null && !requested.isBlank())
			return requested;

		String username = SecurityContextHolder.getContext().getAuthentication().getName();

		return iamService.findUser(username).map(u -> iamService.membershipsOf(u.id()).keySet().stream().findFirst()
				.orElse(Tenant.DEFAULT_CODE)).orElse(Tenant.DEFAULT_CODE);
	}
}
