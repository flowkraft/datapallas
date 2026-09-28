package com.flowkraft.cubes;

/**
 * Who is looking at a dashboard's live cube, for the one purpose of deciding where their own view
 * is kept (W5).
 *
 * <p>Not a permission and not an identity: what a viewer may read is decided before this, by the
 * report's door and by the widget file's lock, and who they are for the {@code ${dp_…}} variables is
 * {@code UserVariables}'s answer. This says only whether there is an account to save a view to, and
 * which one.
 *
 * @param owner      {@code user:<app_user.id>}, {@code machine:api-key}, or null for a viewer with
 *                   no account at all — a share link or an embed token, whose view lives in their
 *                   own browser and nowhere else
 * @param tenantCode the tenant this request runs in, so the same dashboard in two tenants does not
 *                   share one saved view; empty when there is none
 */
public record CubeViewer(String owner, String tenantCode) {

	/** A share link, an embed token, or nobody signed in: there is no account to save to. */
	public static final CubeViewer NOBODY = new CubeViewer(null, "");

	/** Whether this viewer's view can be kept on the server rather than in their browser. */
	public boolean hasAccount() {
		return owner != null && !owner.isBlank();
	}
}
