package com.sourcekraft.documentburster.unit.documentation.auth;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.StringWriter;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import com.sourcekraft.documentburster.utils.DocumentBursterFreemarkerInitializer;
import com.sourcekraft.documentburster.utils.PathOutsidePortableDirException;
import com.sourcekraft.documentburster.utils.Utils;

import freemarker.template.Template;
import freemarker.template.TemplateException;

/**
 * Executable documentation of the DataPallas trust boundary.
 *
 * <h2>What the boundary is</h2>
 * DataPallas runs Groovy exit points, Groovy report scripts, FreeMarker templates and
 * JasperReports expressions — all authored by users. None of those can be sandboxed at the
 * language level, and the product would be useless without them. So the boundary is not the
 * language: it is <b>PORTABLE_EXECUTABLE_DIR</b>, the installation directory. One installation
 * holds the configuration, the encrypted connection secrets and the scripts of exactly one
 * tenant, and nothing outside it is reachable through the REST API.
 *
 * <h2>What this test covers</h2>
 * The two boundary controls that live in {@code bkend/common} and therefore have no Spring
 * dependency:
 * <ol>
 *   <li>{@link Utils#resolveWithinPortableDir(String)} — every path arriving from an HTTP
 *       parameter is confined to the installation directory;</li>
 *   <li>the FreeMarker class resolver — a user-authored template renders data, it does not
 *       execute code.</li>
 * </ol>
 *
 * <h2>What this test deliberately does NOT cover</h2>
 * Authentication and role checks are Spring Security concerns and live in
 * {@code bkend/server}; this module has zero Spring dependencies, so endpoint-level
 * authorization is tested in {@code bkend/server/src/test/.../iam/} and end-to-end in
 * {@code frend/reporting/e2e/specs/features/auth-authrorization.spec.ts}.
 */
public class AuthAuthorizationTest {

	/** Temp root standing in for a real installation directory. */
	private static final String TEST_ROOT = "./target/test-output/auth-authorization-test";

	private String previousPortableDir;
	private File root;

	@Before
	public void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile();
		if (root.exists())
			FileUtils.deleteDirectory(root);

		FileUtils.forceMkdir(new File(root, "config/connections"));
		FileUtils.forceMkdir(new File(root, "config/reports/some-report"));
		FileUtils.forceMkdir(new File(root, "logs"));
		FileUtils.write(new File(root, "config/_internal/.master-key"), "not-a-real-key", "UTF-8");

		previousPortableDir = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		System.setProperty("PORTABLE_EXECUTABLE_DIR", root.getAbsolutePath());
	}

	@After
	public void tearDown() throws Exception {
		if (previousPortableDir != null)
			System.setProperty("PORTABLE_EXECUTABLE_DIR", previousPortableDir);
		else
			System.clearProperty("PORTABLE_EXECUTABLE_DIR");

		if (root != null && root.exists())
			FileUtils.deleteDirectory(root);
	}

	// ============================================================
	// 1. Path confinement — the installation directory is the boundary
	// ============================================================

	/**
	 * The everyday case: the frontend sends config-relative paths and they resolve to an
	 * absolute path inside the installation.
	 */
	@Test
	public void relativePathResolvesInsideTheInstallation() {

		String resolved = Utils.resolveWithinPortableDir("config/reports/some-report/settings.xml");

		assertEquals(Paths.get(root.getAbsolutePath(), "config/reports/some-report/settings.xml").toString(),
				resolved);
	}

	/**
	 * The frontend also round-trips absolute paths it received from an earlier call
	 * (GET /api/system/fs/resolve, the file explorer, job output listings), so an absolute
	 * path that already points inside the installation has to keep working.
	 */
	@Test
	public void absolutePathInsideTheInstallationIsAccepted() {

		String inside = new File(root, "logs/info.log").getAbsolutePath();

		assertEquals(Paths.get(inside).toString(), Utils.resolveWithinPortableDir(inside));
	}

	/** Forward and backslashes are both accepted — the frontend sends whatever Windows gave it. */
	@Test
	public void windowsSeparatorsAreAccepted() {

		String resolved = Utils.resolveWithinPortableDir("config\\connections\\eml-contact.xml");

		assertEquals(Paths.get(root.getAbsolutePath(), "config/connections/eml-contact.xml").toString(), resolved);
	}

	/**
	 * The traversal case. Without confinement this reads another tenant's master key —
	 * {@code resolvePathAgainstPortableDir} normalizes but never re-checks containment,
	 * which is exactly why the HTTP layer must not use it.
	 */
	@Test
	public void relativePathClimbingOutIsRejected() {

		assertRejected("../../config/_internal/.master-key");
		assertRejected("config/../../../etc/passwd");
		assertRejected("..");
	}

	/** An absolute path elsewhere on the machine is not addressable through the API. */
	@Test
	public void absolutePathOutsideTheInstallationIsRejected() {

		assertRejected(new File(root.getParentFile(), "sibling-install/config/_internal/.master-key")
				.getAbsolutePath());
		assertRejected(SystemUtilsIsWindows() ? "C:/Windows/win.ini" : "/etc/passwd");
	}

	/** A missing or empty path is a bad request, not a silent resolve to the root. */
	@Test
	public void blankPathIsRejected() {

		assertRejected(null);
		assertRejected("");
		assertRejected("   ");
	}

	/**
	 * The installation directory itself resolves — callers legitimately ask for the root
	 * (file explorer "go to top", job output roots).
	 */
	@Test
	public void theInstallationRootItselfIsAccepted() {

		assertEquals(Paths.get(root.getAbsolutePath()).toString(),
				Utils.resolveWithinPortableDir(root.getAbsolutePath()));
	}

	// ============================================================
	// 2. FreeMarker — a user template renders data, it does not execute code
	// ============================================================

	/**
	 * {@code freemarker.template.utility.Execute} runs an OS command. A report template is
	 * user-authored content, so without a class resolver every .ftl in
	 * {@code templates/reports/**} — and every template writable through
	 * {@code PUT /api/reports/{id}/template} — is a shell.
	 */
	@Test
	public void freeMarkerTemplateCannotExecuteAnOsCommand() {

		assertTemplateRefused("${\"freemarker.template.utility.Execute\"?new()(\"whoami\")}");
	}

	/**
	 * The same door with a different handle: ObjectConstructor instantiates any class on the
	 * classpath, which reaches java.lang.ProcessBuilder just as well.
	 */
	@Test
	public void freeMarkerTemplateCannotInstantiateArbitraryClasses() {

		assertTemplateRefused("${\"freemarker.template.utility.ObjectConstructor\"?new()(\"java.io.File\", \"x\")}");
	}

	/**
	 * The control case that matters most: hardening must not cost the product anything.
	 * Ordinary variable substitution — what every shipped template actually does — still works.
	 */
	@Test
	public void ordinaryTemplateSubstitutionStillWorks() throws Exception {

		Map<String, Object> model = new HashMap<>();
		model.put("firstName", "Alfreda");
		model.put("amount", 1234.5);

		StringWriter out = new StringWriter();
		new Template("ordinary", "Dear ${firstName}, you owe ${amount}.",
				DocumentBursterFreemarkerInitializer.FREE_MARKER_CFG).process(model, out);

		assertEquals("Dear Alfreda, you owe 1,234.5.", out.toString());
	}

	// ============================================================
	// helpers
	// ============================================================

	private void assertRejected(String requestedPath) {
		try {
			String resolved = Utils.resolveWithinPortableDir(requestedPath);
			fail("Expected '" + requestedPath + "' to be rejected, but it resolved to '" + resolved + "'");
		} catch (PathOutsidePortableDirException expected) {
			// the boundary held
		}
	}

	private void assertTemplateRefused(String templateSource) {
		try {
			StringWriter out = new StringWriter();
			new Template("hostile", templateSource, DocumentBursterFreemarkerInitializer.FREE_MARKER_CFG)
					.process(new HashMap<String, Object>(), out);
			fail("Expected the template to be refused, but it rendered: '" + out + "'");
		} catch (TemplateException expected) {
			assertTrue("Expected a class-resolver refusal, got: " + expected.getMessage(),
					expected.getMessage() != null && expected.getMessage().contains("not allowed"));
		} catch (Exception e) {
			fail("Expected a TemplateException from the class resolver, got " + e);
		}
	}

	private static boolean SystemUtilsIsWindows() {
		return File.separatorChar == '\\';
	}
}
