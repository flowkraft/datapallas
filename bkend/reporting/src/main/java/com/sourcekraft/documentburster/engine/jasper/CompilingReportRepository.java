package com.sourcekraft.documentburster.engine.jasper;

import java.io.File;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import net.sf.jasperreports.engine.JRRuntimeException;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.repo.ReportResource;
import net.sf.jasperreports.repo.RepositoryContext;
import net.sf.jasperreports.repo.RepositoryService;
import net.sf.jasperreports.repo.Resource;

/**
 * Serves a sub-report that exists only as .jrxml, by compiling it.
 *
 * JasperReports loads sub-reports from its repository as compiled .jasper. A
 * report pack that arrives with sources but no compiled files — or whose main
 * template refers to "sub.jrxml" rather than "sub.jasper" — fails at fill time
 * with a StreamCorruptedException, because the engine tries to deserialize XML.
 * Both shapes are common in the wild and neither is the customer's mistake.
 *
 * The rule is deliberately narrow: intervene only where the engine would
 * otherwise fail. A compiled .jasper that is on disk is left entirely alone and
 * loads exactly as before.
 *
 * Nothing is written anywhere — the compiled report is held in memory, keyed by
 * source path and timestamp, so a wrapper report rendering a thousand documents
 * compiles each sub-report once and editing a source picks the change up.
 *
 * The JasperReports 6 container under tools/jasper-legacy carries its own copy
 * of this class: the repository SPI is identical between the two versions, but
 * the libraries are not, so the code cannot be shared.
 */
public class CompilingReportRepository implements RepositoryService {

	private static final class Compiled {
		final JasperReport report;
		final long sourceLastModified;

		Compiled(JasperReport report, long sourceLastModified) {
			this.report = report;
			this.sourceLastModified = sourceLastModified;
		}
	}

	private final Map<String, Compiled> cache = new ConcurrentHashMap<>();

	@Override
	public Resource getResource(String location) {
		return null;
	}

	@Override
	public void saveResource(String location, Resource resource) {
		// Read-only: this repository exists to serve sub-reports, not to store them.
	}

	@Override
	public <K extends Resource> K getResource(String location, Class<K> resourceType) {
		return resolve(location, resourceType);
	}

	@Override
	public <K extends Resource> K getResource(RepositoryContext context, String location, Class<K> resourceType) {
		return resolve(location, resourceType);
	}

	@SuppressWarnings("unchecked")
	private <K extends Resource> K resolve(String location, Class<K> resourceType) {
		if (resourceType == null || !ReportResource.class.isAssignableFrom(resourceType)) {
			return null;
		}

		File source = uncompiledSourceFor(location);
		if (source == null) {
			return null;
		}

		ReportResource resource = new ReportResource();
		resource.setReport(compile(source));
		return (K) resource;
	}

	/**
	 * The .jrxml to compile, or null when there is nothing to do — either the
	 * requested file is already there, or no source exists and the caller should
	 * get the engine's own "not found".
	 */
	private File uncompiledSourceFor(String location) {
		if (location == null || location.isEmpty()) {
			return null;
		}

		File requested = new File(location);
		if (!requested.isAbsolute()) {
			// A repository-relative name this class knows nothing about.
			return null;
		}

		String name = requested.getName();

		// A .jasper that is on disk loads the normal way — say nothing.
		// A .jrxml NEVER loads the normal way, whether or not the file is there:
		// the engine would deserialize XML and fail. Existing is not the same as
		// loadable, which is what made the first version of this guard wrong.
		if (name.toLowerCase().endsWith(".jasper") && requested.isFile()) {
			return null;
		}

		File folder = requested.getParentFile();
		if (folder == null) {
			return null;
		}

		int dot = name.lastIndexOf('.');
		String baseName = dot > 0 ? name.substring(0, dot) : name;

		File source = new File(folder, baseName + ".jrxml");
		return source.isFile() ? source : null;
	}

	private JasperReport compile(File source) {
		String key = source.getAbsolutePath();
		long lastModified = source.lastModified();

		Compiled cached = cache.get(key);
		if (cached != null && cached.sourceLastModified == lastModified) {
			return cached.report;
		}

		try {
			JasperReport report = JasperCompileManager.compileReport(source.getAbsolutePath());
			cache.put(key, new Compiled(report, lastModified));
			return report;
		} catch (Exception e) {
			// Name the file: "compilation failed" is useless in a pack of forty.
			throw new JRRuntimeException(
					"Could not compile the sub-report " + source.getName() + ": " + e.getMessage(), e);
		}
	}
}
