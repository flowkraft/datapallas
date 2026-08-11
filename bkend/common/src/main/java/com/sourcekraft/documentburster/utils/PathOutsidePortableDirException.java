package com.sourcekraft.documentburster.utils;

/**
 * Thrown when a caller-supplied path resolves outside PORTABLE_EXECUTABLE_DIR.
 *
 * <p>Every path that arrives over HTTP goes through
 * {@link Utils#resolveWithinPortableDir(String)}, which confines it to the
 * installation directory. The installation directory is the trust boundary: it
 * holds the configuration, the connection secrets and the report scripts of
 * exactly one DataPallas instance, and nothing outside it is addressable
 * through the REST API.
 */
public class PathOutsidePortableDirException extends RuntimeException {

	private static final long serialVersionUID = 1L;

	public PathOutsidePortableDirException(String message) {
		super(message);
	}
}
