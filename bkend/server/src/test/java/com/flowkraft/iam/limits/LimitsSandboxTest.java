package com.flowkraft.iam.limits;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The DSL sandbox for an author whose groups say {@code scripts: false}.
 *
 * <p>The line this draws is "a DSL, not a program": the widget DSLs an author writes every day
 * must keep compiling, and the ways out of the process must not. The DSL samples below are the
 * real shapes — a chart, a pivot, a cube, a parameters spec — so a change that tightened the
 * sandbox until ordinary authoring broke would fail here.
 */
public class LimitsSandboxTest {

	private LimitsService limitsService;
	private LimitsSandbox sandbox;

	@BeforeEach
	public void setUp() {
		limitsService = mock(LimitsService.class);
		when(limitsService.allowsScripts()).thenReturn(false);
		sandbox = new LimitsSandbox(limitsService);
	}

	// ============================================================
	// what must keep working
	// ============================================================

	@Test
	@DisplayName("A chart DSL compiles")
	public void aChartDslIsAllowed() {
		assertDoesNotThrow(() -> sandbox.check("chart {\n" //
				+ "  type 'bar'\n" //
				+ "  title 'Sales by region'\n" //
				+ "  series 'amount', label: 'Amount'\n" //
				+ "  category 'region'\n" //
				+ "}"));
	}

	@Test
	@DisplayName("A pivot DSL with numbers, closures and string work compiles")
	public void aPivotDslIsAllowed() {
		assertDoesNotThrow(() -> sandbox.check("pivot {\n" //
				+ "  rows 'region', 'country'\n" //
				+ "  columns 'year'\n" //
				+ "  measure 'amount', aggregate: 'sum', format: { it.toString().toUpperCase() }\n" //
				+ "  limit 10 * 5\n" //
				+ "}"));
	}

	@Test
	@DisplayName("A parameters spec with a default and a list compiles")
	public void aParametersSpecIsAllowed() {
		assertDoesNotThrow(() -> sandbox.check("parameters {\n" //
				+ "  text 'region', label: 'Region', defaultValue: 'EU'\n" //
				+ "  list 'year', values: [2024, 2025, 2026]\n" //
				+ "}"));
	}

	@Test
	@DisplayName("A cube DSL compiles")
	public void aCubeDslIsAllowed() {
		assertDoesNotThrow(() -> sandbox.check("cube {\n" //
				+ "  table 'orders'\n" //
				+ "  dimension 'region'\n" //
				+ "  measure 'amount', sql: 'sum(amount)'\n" //
				+ "}"));
	}

	@Test
	@DisplayName("Nothing to check is nothing to refuse")
	public void blankIsAllowed() {
		assertDoesNotThrow(() -> sandbox.check(null));
		assertDoesNotThrow(() -> sandbox.check("   "));
	}

	@Test
	@DisplayName("A broken DSL is not a refusal: the normal parser reports it, with its line number")
	public void aBrokenDslIsLeftToTheNormalParser() {
		assertDoesNotThrow(() -> sandbox.check("chart { type 'bar'"));
	}

	// ============================================================
	// what must not
	// ============================================================

	@Test
	@DisplayName("Running a command is refused")
	public void runtimeIsRefused() {
		assertThrows(ScriptsNotAllowedException.class,
				() -> sandbox.check("chart { type Runtime.getRuntime().exec('id').text }"));
	}

	@Test
	@DisplayName("Reading a file is refused")
	public void newFileIsRefused() {
		assertThrows(ScriptsNotAllowedException.class,
				() -> sandbox.check("chart { title new java.io.File('config/_internal/api-key.txt').text }"));
	}

	@Test
	@DisplayName("An import is refused, whatever it imports")
	public void anImportIsRefused() {
		assertThrows(ScriptsNotAllowedException.class,
				() -> sandbox.check("import java.io.File\nchart { title 'x' }"));
	}

	@Test
	@DisplayName("Reading a system property is refused")
	public void systemIsRefused() {
		assertThrows(ScriptsNotAllowedException.class,
				() -> sandbox.check("chart { title System.getProperty('user.home') }"));
	}

	@Test
	@DisplayName("Reflection is refused")
	public void reflectionIsRefused() {
		assertThrows(ScriptsNotAllowedException.class,
				() -> sandbox.check("chart { title Class.forName('java.lang.Runtime').toString() }"));
	}

	@Test
	@DisplayName("A script that declares a package is refused")
	public void aPackageDeclarationIsRefused() {
		assertThrows(ScriptsNotAllowedException.class, () -> sandbox.check("package com.example\nchart { }"));
	}

	@Test
	@DisplayName("The refusal says what it is about")
	public void theRefusalIsReadable() {

		ScriptsNotAllowedException refused = assertThrows(ScriptsNotAllowedException.class,
				() -> sandbox.check("chart { title System.getProperty('user.home') }"));

		org.junit.jupiter.api.Assertions.assertTrue(refused.getReason().startsWith("You are not allowed to"),
				refused.getReason());
	}

	// ============================================================
	// everybody else
	// ============================================================

	@Test
	@DisplayName("An author who may run scripts is not sandboxed at all")
	public void anUnlimitedAuthorIsNeverSandboxed() {

		when(limitsService.allowsScripts()).thenReturn(true);

		assertDoesNotThrow(() -> sandbox.check("chart { type Runtime.getRuntime().exec('id').text }"));
	}
}
