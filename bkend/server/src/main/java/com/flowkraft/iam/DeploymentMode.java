package com.flowkraft.iam;

import java.io.File;

import org.apache.commons.lang3.StringUtils;

import com.flowkraft.common.AppPaths;

/**
 * Which shape this process is running as — detected from the installation, not declared by a caller.
 *
 * <p>Same jar, same Angular bundle, three behaviours. These name the <em>topology</em>, not a user
 * count: {@link #STANDALONE} is the desktop shape, and a Server install with one account is still
 * {@link #GATEWAY}. See {@link #resolve()} for how the shape is decided and {@link #isDataPallasServer()} for
 * what the distinction actually governs.
 */
public enum DeploymentMode {

	/**
	 * The default, and what Electron always runs. One tenant, one auto-created admin, the loopback
	 * caller authenticated automatically. No login screen and no auth UI — a desktop user must never
	 * be able to tell that authentication exists.
	 */
	STANDALONE,

	/**
	 * One container serving one tenant behind a gateway. Has no login of its own; it trusts the
	 * short-lived token the gateway mints and must not be reachable from outside the internal network.
	 */
	TENANT,

	/**
	 * The multi-tenant front door: owns login, the IAM store, and routing to tenant containers.
	 */
	GATEWAY;

	private static final String RB_ROLE = "RB_ROLE";

	/**
	 * Which edition is installed here, decided by what is on disk rather than by what a caller claims.
	 *
	 * <ol>
	 *   <li>An explicit {@code -DRB_ROLE=...} / {@code RB_ROLE} env value wins. Setting it requires the
	 *       ability to change how the JVM is launched, which already means machine access.</li>
	 *   <li>Otherwise the installation directory is probed: {@code startServer.bat} /
	 *       {@code startServer.sh} ships in the Server package and never in the desktop one.</li>
	 *   <li>Otherwise the desktop shape.</li>
	 * </ol>
	 *
	 * <h2>Why the filesystem and not an environment variable</h2>
	 * An env var has to be set identically by the .bat, the Windows service wrapper and the Dockerfile,
	 * and a value that is missing or mistyped in any one of them fails <em>open</em> — a Server edition
	 * would silently run with no enforcement. The packaging difference cannot drift that way: the
	 * Server zip contains {@code startServer.bat}, the desktop zip does not, and the Docker image
	 * inherits it because the image is built from {@code db-server-template}.
	 *
	 * <p>This is the same test {@link com.sourcekraft.documentburster.utils.Utils#getProduct()} has
	 * always used to name the product, resolved against the installation directory instead of the
	 * working directory.
	 *
	 * <p>It is <b>not</b> tamper-proof against a local attacker: deleting {@code startServer.bat} flips
	 * a server back to the desktop shape. But that needs write access to the installation, and anyone with
	 * that can already edit the exit-point scripts and read {@code .master-key} — no check at this
	 * layer survives that. What it does buy is a signal that cannot be flipped remotely, cannot be lost
	 * to a launch-script typo, and whose accidental failure direction (a stray {@code startServer.bat})
	 * makes an install <em>more</em> restrictive, not less.
	 */
	public static DeploymentMode resolve() {

		String configured = System.getProperty(RB_ROLE);
		if (StringUtils.isBlank(configured))
			configured = System.getenv(RB_ROLE);

		if (StringUtils.isNotBlank(configured)) {
			for (DeploymentMode mode : values())
				if (mode.name().equalsIgnoreCase(configured.trim()))
					return mode;
			// A typo must not leave the app dead, so fall through to detection rather than failing.
		}

		return isServerEdition() ? GATEWAY : STANDALONE;
	}

	/**
	 * The Server package ships launcher scripts that the desktop package does not.
	 *
	 * <p>Resolved to {@link #GATEWAY} rather than {@link #TENANT} because a Server install owns its own
	 * login and IAM store; TENANT means "trusts a gateway's token and has no login of its own", which is
	 * only true for the per-tenant containers introduced in Phase 3. For Phase 1 the distinction that
	 * matters is {@link #isDataPallasServer()}, and both server roles answer it the same way.
	 */
	private static boolean isServerEdition() {
		String installDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		if (StringUtils.isBlank(installDir))
			installDir = System.getProperty("user.dir");

		return new File(installDir, "startServer.bat").exists() || new File(installDir, "startServer.sh").exists();
	}

	/**
	 * Is this DataPallas Server — the edition that must enforce authentication?
	 *
	 * <p>Named after the product edition rather than after a user count, because a user count answers
	 * the wrong question: a Server install with exactly one account is still DataPallas Server and must
	 * still ask that one person to sign in. The negation is DataPallas Desktop
	 * ({@code DataPallas.exe}, or a developer running the backend directly), where the app
	 * auto-provisions an administrator, authenticates the local caller, skips CSRF, and renders no
	 * authentication UI at all.
	 *
	 * <p>This is the same distinction {@link com.sourcekraft.documentburster.utils.Utils#getProduct()}
	 * has always drawn between "DocumentBurster" and "DocumentBurster Server".
	 */
	public boolean isDataPallasServer() {
		return this != STANDALONE;
	}

	/** Lowercase name, which is what {@code GET /api/auth/me} reports to the frontend. */
	public String wireName() {
		return name().toLowerCase();
	}
}
