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
import com.flowkraft.iam.reports.ReportGrants;
import com.flowkraft.iam.dtos.CreateUserRequestDto;
import com.flowkraft.iam.dtos.GroupRefDto;
import com.flowkraft.iam.dtos.TenantUserDto;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;

import jakarta.validation.Valid;

/**
 * User and tenant administration — {@code ADMIN} only, enforced at the method level so the rule
 * sits next to the code it protects rather than in a path pattern that can drift.
 *
 * <p>The Angular UI never shows any of this in {@code STANDALONE} mode. These endpoints still exist
 * there, and still work, because the desktop's DEFAULT admin is a {@code ADMIN} — the UI simply
 * has nothing to render for them.
 */
@RestController
@RequestMapping(value = "/api/iam", produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('ADMIN')")
public class UsersController {

	@Autowired
	private IamService iamService;

	@Autowired
	private LimitsService limitsService;

	@Autowired
	private DashboardGrants dashboardGrants;

	@Autowired
	private ReportGrants reportGrants;

	// ============================================================
	// users
	// ============================================================

	/**
	 * Every user, each with the groups they are in and the limits that actually apply to them — so the
	 * admin sees what the server will do, not what the group settings suggest it might.
	 */
	@GetMapping("/users")
	public List<TenantUserDto> listUsers(@RequestParam(required = false) String tenantCode) {
		return iamService.usersInTenant(resolveTenantCode(tenantCode)).stream().map(this::withGroups).toList();
	}

	private TenantUserDto withGroups(TenantUserDto user) {
		List<GroupRefDto> groups = limitsService.groupsOf(user.id()).stream()
				.map(group -> new GroupRefDto(group.id(), group.name())).toList();

		Role role = user.role() == null ? null : Role.parse(user.role());

		// "Opens on" only means something for a viewer: it is the one role whose whole session is the
		// dashboard it lands on.
		String opensOn = role == Role.DASHBOARD_VIEWER ? dashboardGrants.defaultDashboardOf(user.id()) : null;

		// Layer 2, the same way: what the server will actually allow, not what the group rows suggest.
		// An administrator is subject to neither layer, so they are shown neither.
		List<String> effectiveReports = role == Role.ADMIN || role == Role.PLATFORM_ADMIN ? null
				: reportGrants.effectiveReportsOf(user.id());

		return user.withGroups(groups, role == null ? null : limitsService.effectiveLimitsFor(user.id(), role),
				effectiveReports, opensOn);
	}

	/**
	 * Replace a user's groups with exactly the set sent.
	 *
	 * <p>204 and not 200: there is nothing to return that the caller does not already have, and the
	 * Groups column is refreshed from the list endpoint.
	 */
	@PutMapping("/users/{username}/groups")
	public ResponseEntity<?> setUserGroups(@PathVariable String username, @RequestBody Map<String, Object> body) {
		try {
			limitsService.setUserGroups(username, groupIdsIn(body.get("groupIds")));
			return ResponseEntity.noContent().build();

		} catch (LimitsService.UnknownUserException e) {
			return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));

		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	/**
	 * JSON numbers arrive as Integer or Long depending on their size, and the Angular client sends
	 * them either way, so the ids are read through {@link Number} rather than cast.
	 */
	private List<Long> groupIdsIn(Object raw) {
		if (raw == null)
			return List.of();
		if (!(raw instanceof List<?> values))
			throw new IllegalArgumentException("groupIds must be a list of group ids");

		List<Long> groupIds = new java.util.ArrayList<>();
		for (Object value : values) {
			if (!(value instanceof Number id))
				throw new IllegalArgumentException("No such group: " + value);
			groupIds.add(id.longValue());
		}
		return groupIds;
	}

	/**
	 * Create a user.
	 *
	 * <p>Answers 409 on a duplicate username rather than 500, so provisioning scripts and e2e setup are
	 * safe to re-run — the second run is a no-op the caller can recognise.
	 */
	@PostMapping("/users")
	public ResponseEntity<?> createUser(@Valid @RequestBody CreateUserRequestDto request) {
		try {
			// Validated first: a request naming a group that does not exist must create nothing at all,
			// rather than a user the admin then has to find and delete.
			List<Long> groupIds = limitsService.validated(request.groupIds());

			AppUser created = iamService.createUser(request.username(), request.email(), request.password(),
					parseRole(request.role()), resolveTenantCode(request.tenantCode()));

			if (!groupIds.isEmpty())
				limitsService.setUserGroups(created.username(), groupIds);

			return ResponseEntity.status(HttpStatus.CREATED).body(created);

		} catch (IamService.UsernameTakenException e) {
			return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));

		} catch (IamService.LicenseLimitException e) {
			// 402 rather than 403: the caller has the right, the license does not have the room.
			return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of("error", e.getMessage()));

		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	@PutMapping("/users/{username}/role")
	public ResponseEntity<?> setRole(@PathVariable String username, @RequestBody Map<String, String> body) {
		try {
			iamService.setRole(username, parseRole(body.get("role")), resolveTenantCode(body.get("tenantCode")));
			return ResponseEntity.ok().build();
		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	@PutMapping("/users/{username}/password")
	public ResponseEntity<?> changePassword(@PathVariable String username, @RequestBody Map<String, String> body) {
		try {
			iamService.changePassword(username, body.get("password"));
			return ResponseEntity.ok().build();
		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	@PostMapping("/users/{username}/disable")
	public ResponseEntity<?> disableUser(@PathVariable String username) {
		try {
			iamService.disableUser(username);
			return ResponseEntity.ok().build();
		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	/** The other half of disable. Without it, shutting an account was only undoable by deleting it. */
	@PostMapping("/users/{username}/enable")
	public ResponseEntity<?> enableUser(@PathVariable String username) {
		try {
			iamService.enableUser(username);
			return ResponseEntity.ok().build();
		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	@DeleteMapping("/users/{username}")
	public ResponseEntity<?> deleteUser(@PathVariable String username) {
		try {
			iamService.deleteUser(username);
			return ResponseEntity.ok().build();
		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	// ============================================================
	// tenants
	// ============================================================

	@GetMapping("/tenants")
	public List<Tenant> listTenants() {
		return iamService.allTenants();
	}

	@PostMapping("/tenants")
	public ResponseEntity<?> createTenant(@RequestBody Map<String, String> body) {
		try {
			return ResponseEntity.status(HttpStatus.CREATED).body(iamService.createTenant(body.get("code"),
					body.get("displayName"), body.get("homeDir")));

		} catch (IamService.TenantCodeTakenException e) {
			return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));

		} catch (IamService.LicenseLimitException e) {
			return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of("error", e.getMessage()));

		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	// ============================================================
	// helpers
	// ============================================================

	private Role parseRole(String raw) {
		if (raw == null)
			throw new IllegalArgumentException("Role is required");
		try {
			Role role = Role.parse(raw);
			if (role == Role.PLATFORM_ADMIN)
				throw new IllegalArgumentException("PLATFORM_ADMIN cannot be granted through this endpoint");
			return role;
		} catch (IllegalArgumentException e) {
			// Rethrow our own message, swallow the enum's less helpful one.
			if (e.getMessage() != null && e.getMessage().startsWith("PLATFORM_ADMIN"))
				throw e;
			throw new IllegalArgumentException("Unknown role: " + raw);
		}
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
