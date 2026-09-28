package com.flowkraft.cubes;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.flowkraft.embed.TokenRequest;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.UserSettingsRepository;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.limits.LimitsService;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The one place that answers "has this viewer an account to save a cube view to, and which one"
 * (W5's table "Who the viewer is").
 *
 * <p>It reads the same three things {@code UserVariables} reads, in the same order and for the same
 * reasons — the credential first, then the session — because the answer has to agree with it: a
 * request whose {@code ${dp_user_id}} is empty is a request with no person behind it, and a person
 * with no account has nowhere on this server to keep anything.
 *
 * <p>A share link and an embed token are deliberately not given an owner. Their credential is the
 * permission; it names no person, and two people holding the same link are not two viewers this
 * server can tell apart. Their view is kept in their own browser instead, which the renderer is told
 * by {@code viewStorage: "browser"} rather than left to work out from roles.
 */
@Component
public class CubeViewers {

	private final IamRepository repository;

	@Autowired
	public CubeViewers(IamRepository repository) {
		this.repository = repository;
	}

	public CubeViewer of(HttpServletRequest request) {

		if (TokenRequest.isTokenRequest(request))
			return CubeViewer.NOBODY;

		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

		if (authentication == null || !authentication.isAuthenticated()
				|| "anonymousUser".equals(authentication.getPrincipal()))
			return CubeViewer.NOBODY;

		// The desktop. The installation key is the Electron shell asking on behalf of whoever owns
		// the machine: one person, one installation, one saved view.
		if (LimitsService.API_KEY_PRINCIPAL.equals(authentication.getName()))
			return new CubeViewer(UserSettingsRepository.MACHINE_OWNER, Tenant.DEFAULT_CODE);

		// Authenticated but not a person this store knows: another machine caller, with nothing of
		// its own to keep. Saying so is better than inventing an owner two callers could share.
		return repository.findUserByUsername(authentication.getName())
				.map(user -> new CubeViewer(UserSettingsRepository.ownerOfUser(user.id()), tenantOf(user)))
				.orElse(CubeViewer.NOBODY);
	}

	/**
	 * The tenant {@code /api/auth/me} reports for this person — the first one they belong to, as
	 * {@code UserVariables} picks it, so a view saved while looking at a dashboard is found again by
	 * the same person looking at the same dashboard.
	 */
	private String tenantOf(AppUser user) {
		return repository.findMembershipsByTenantCode(user.id()).keySet().stream().findFirst()
				.orElse(Tenant.DEFAULT_CODE);
	}
}
