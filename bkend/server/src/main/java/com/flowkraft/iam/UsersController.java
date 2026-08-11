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

import com.flowkraft.iam.dtos.CreateUserRequestDto;
import com.flowkraft.iam.dtos.TenantUserDto;
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

	// ============================================================
	// users
	// ============================================================

	@GetMapping("/users")
	public List<TenantUserDto> listUsers(@RequestParam(required = false) String tenantCode) {
		return iamService.usersInTenant(resolveTenantCode(tenantCode));
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
			AppUser created = iamService.createUser(request.username(), request.email(), request.password(),
					parseRole(request.role()), resolveTenantCode(request.tenantCode()));
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
