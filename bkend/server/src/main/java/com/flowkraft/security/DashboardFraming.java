package com.flowkraft.security;

import org.springframework.security.web.header.HeaderWriter;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Who may put a DataPallas page in an iframe.
 *
 * <p>Spring Security sends {@code X-Frame-Options: DENY} on everything by default, which is what a
 * reporting tool wants: a dashboard of somebody's own numbers has no business being framed by a
 * page they did not open. That stays true of every response here but one.
 *
 * <p>The exception is the Cube Stories page (design part 8). It is a published sample dashboard
 * shown on datapallas.com inside an iframe, through an ordinary share link, so the docs page can
 * show the cube component working on the real backend. For that one path {@code X-Frame-Options}
 * is not sent at all — it has no origin list, so it could only say DENY or SAMEORIGIN, neither of
 * which lets the site frame the page — and a {@code frame-ancestors} policy names the two origins
 * that may: DataPallas itself, and the site.
 *
 * <p>This is one writer rather than two, so there is exactly one place that decides which of the
 * two headers a response carries and no way for a path to end up with both or with neither.
 * Spring's own frame-options writer is switched off in {@code SecurityConfig} for the same reason.
 * The path and the two origins are constants: nothing here is configurable, because a deployment
 * that could widen its own {@code frame-ancestors} is a deployment that can be talked into it.
 */
public final class DashboardFraming implements HeaderWriter {

	/** The one page that may be framed: the Cube Stories sample dashboard. */
	static final String FRAMED_PATH = "/dashboard/g-cube-stories";

	/** Who may frame it: DataPallas itself, and the two spellings of the site. */
	static final String FRAME_ANCESTORS = "frame-ancestors 'self' https://datapallas.com "
			+ "https://www.datapallas.com";

	static final String CONTENT_SECURITY_POLICY = "Content-Security-Policy";

	static final String FRAME_OPTIONS = "X-Frame-Options";

	static final String DENY = "DENY";

	@Override
	public void writeHeaders(HttpServletRequest request, HttpServletResponse response) {
		if (framesAllowed(request))
			response.setHeader(CONTENT_SECURITY_POLICY, FRAME_ANCESTORS);
		else
			response.setHeader(FRAME_OPTIONS, DENY);
	}

	/**
	 * Whether this request is for the one framed page. The comparison is on the whole path, so
	 * {@code /dashboard/g-cube-stories-copy} and {@code /api/reports/g-cube-stories/data} are not
	 * it; a trailing slash is, because a browser following a link may add one.
	 */
	static boolean framesAllowed(HttpServletRequest request) {

		String path = pathOf(request);
		if (path.endsWith("/") && path.length() > 1)
			path = path.substring(0, path.length() - 1);
		return FRAMED_PATH.equals(path);
	}

	/** The path as this application knows it, with whatever it is deployed under taken off. */
	private static String pathOf(HttpServletRequest request) {

		String path = request != null ? request.getRequestURI() : null;
		if (path == null)
			return "";
		String contextPath = request.getContextPath();
		if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath))
			path = path.substring(contextPath.length());
		return path;
	}
}
