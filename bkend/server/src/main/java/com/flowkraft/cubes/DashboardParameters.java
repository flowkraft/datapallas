package com.flowkraft.cubes;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;

import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeRules;
import com.sourcekraft.documentburster.common.reportparameters.ParameterTypes;
import com.sourcekraft.documentburster.common.reportparameters.ParameterValidator;
import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;
import com.sourcekraft.documentburster.common.reportparameters.ReportParametersHelper;
import com.sourcekraft.documentburster.common.reportparameters.ValidationException;

import static com.sourcekraft.documentburster.utils.Utils.resolvePathAgainstPortableDir;

/**
 * The dashboard's parameters, as a live cube on that dashboard sees them (R1): what the dashboard
 * declares, what the viewer answered, and the values the rest of the query plumbing binds.
 *
 * <p><b>One place for parameters</b> (owner, 2026-09-28). A cube declares none. The dashboard
 * declares them where every dashboard already does — its {@code {reportId}-report-parameters-spec.groovy},
 * in the reportParameters DSL: the types, the defaults (R7 tokens included), the {@code min}/{@code max}
 * cross-references, the SQL-filled selects and All. A cube only <i>uses</i> the names, through its
 * {@code condition}s; the name is the link, exactly as it is for an SQL widget, so there is no
 * binding to set up and no second parameter parser.
 *
 * <p>This class is only where the three meet for a live cube: it fills in the defaults, resolves
 * the ones written relative to the data's today ({@link CubeDates}), checks them with the same
 * {@link ParameterValidator} every report's parameters go through <b>before</b> any SQL is
 * written, and hands back the plain text values {@code QueriesService.prepare} binds.
 *
 * <p><b>Checked before the SQL exists.</b> A {@code toDate} before its {@code fromDate} is a
 * question with no answer, and the viewer is told so by name. Were it checked after the statement
 * was written, the refusal would arrive with a statement attached that nothing had run — and, on
 * the two endpoints that hand the SQL back, would have shown it.
 *
 * <p><b>ANSI SQL only — there is no SQL in this file.</b>
 */
public final class DashboardParameters {

	/** The request key a viewer's answers arrive under, on every runtime endpoint that takes them. */
	public static final String REQUEST_KEY = "params";

	/** {@code {reportId}-report-parameters-spec.groovy}, beside the dashboard's settings. */
	public static final String SUFFIX = "-report-parameters-spec.groovy";

	private static final ParameterValidator VALIDATOR = new ParameterValidator();

	private DashboardParameters() {
	}

	/**
	 * What the dashboard declares, exactly as its spec wrote it: defaults still relative, ids in
	 * order. Empty for a dashboard that declares none — most do not, and pay nothing for this.
	 *
	 * <p>Read once per request and handed to {@link #values} and {@link #types}, so that the three
	 * endpoints of one question parse one file once.
	 */
	public static List<ReportParameter> declared(String reportId) {

		File spec = specOf(reportId);
		if (spec == null)
			return List.of();
		try {
			return ReportParametersHelper.parseGroovyParametersDslCode(Files.readString(spec.toPath()));
		} catch (Exception unreadable) {
			throw new IllegalArgumentException("The parameters of dashboard '" + reportId
					+ "' cannot be read: " + unreadable.getMessage(), unreadable);
		}
	}

	/**
	 * The same declarations, with the cube's conditions checked against them (R1): every name a
	 * condition uses is declared here or is a builtin.
	 *
	 * <p>This is the dashboard's half of the one-place rule. The cube file's own checks
	 * ({@link CubeRules}) can only see the form of a condition — a name is a name to them, and
	 * which dashboard will answer it is not written in the cube. The pairing is only knowable
	 * where a dashboard and a cube meet, which is here: when the dashboard is published (the
	 * canvas export) and every time one of its live cubes is asked something.
	 *
	 * <p>Why an error and not an empty value: a name nobody declares is silently empty, so the
	 * empty-value rule drops its whole condition and the viewer is shown more rows than the cube's
	 * author wrote it to show — a typo in a name would quietly widen the answer.
	 */
	public static List<ReportParameter> declared(String reportId, CubeOptions cube) {

		List<ReportParameter> declared = declared(reportId);
		mustDeclare(reportId, cube, declared);
		return declared;
	}

	/**
	 * Refuses each name a cube's conditions use that this dashboard neither declares nor gets from
	 * the server, naming the cube, the condition and the name.
	 *
	 * <p>One method, used on both paths — the canvas export, so a dashboard that could not answer
	 * its own cube is never written, and the runtime, so a cube file edited after the dashboard
	 * was published says what is missing instead of answering the wrong rows.
	 */
	public static void mustDeclare(String reportId, CubeOptions cube, List<ReportParameter> declared) {
		mustDeclare(reportId, cube, types(declared).keySet());
	}

	/**
	 * The same check where the declarations are still the canvas's own list of names: the export,
	 * which writes the spec from that list a few lines later.
	 */
	public static void mustDeclare(String reportId, CubeOptions cube, Collection<String> declaredNames) {

		List<CubeRules.ConditionUse> uses = CubeRules.parameterUses(cube);
		if (uses.isEmpty())
			return;

		Set<String> known = new LinkedHashSet<>(declaredNames);
		for (CubeRules.ConditionUse use : uses) {
			for (String name : use.parameters()) {
				if (known.contains(name))
					continue;
				throw new IllegalArgumentException("Dashboard '" + reportId + "': its live cube has "
						+ use.where() + ", which uses '" + name + "'. This dashboard "
						+ "does not declare a parameter of that name" + (known.isEmpty()
								? " — it declares none at all."
								: ". It declares: " + String.join(", ", known) + ".")
						+ " A cube only uses names: declare '" + name + "' in " + reportId + SUFFIX
						+ ", or, if it is meant to be the server's own value, spell it as a builtin.");
			}
		}
	}

	/**
	 * What the dashboard declares, as the viewer is shown it: every default already a day, so the
	 * picker opens on the date the dashboard meant and the first {@code /query} asks the question
	 * the card's text says it asks.
	 */
	public static List<ReportParameter> shown(List<ReportParameter> declared, Supplier<LocalDate> dataToday) {

		Supplier<LocalDate> once = once(dataToday);
		for (ReportParameter parameter : declared) {
			if (CubeDates.mentions(parameter.defaultValue))
				parameter.defaultValue = CubeDates.resolve(parameter.defaultValue, today(once));
		}
		return declared;
	}

	/**
	 * Of everything the dashboard declares, the parameters this one card is about: the names its
	 * cube's own conditions use, and the names the page binds to one of its members (R8).
	 *
	 * <p>A dashboard declares its parameters once, for the whole page, and a page may carry many
	 * cards. Drawing every declaration above every card would ask a viewer for a customer on a
	 * card that has no customer in it. The other way round matters too: a name a card is filtered
	 * by is the card's business even when its cube never mentions it, because that filter is what
	 * the card's chip says it is.
	 *
	 * <p>The order is the dashboard's, so a form reads in the order the page was written.
	 */
	public static List<ReportParameter> askedBy(List<ReportParameter> declared, CubeOptions cube,
			Collection<String> boundNames) {

		Set<String> wanted = new LinkedHashSet<>(boundNames == null ? List.of() : boundNames);
		for (CubeRules.ConditionUse use : CubeRules.parameterUses(cube))
			wanted.addAll(use.parameters());

		List<ReportParameter> asked = new ArrayList<>();
		for (ReportParameter parameter : declared) {
			if (parameter.id != null && wanted.contains(parameter.id))
				asked.add(parameter);
		}
		return asked;
	}

	/** Each parameter's declared type, by id — what binds a date as a date rather than as its text. */
	public static Map<String, String> types(List<ReportParameter> declared) {

		Map<String, String> types = new LinkedHashMap<>();
		for (ReportParameter parameter : declared) {
			if (parameter.id != null && parameter.type != null)
				types.put(parameter.id, parameter.type);
		}
		return types;
	}

	/**
	 * The value of every parameter the dashboard declares: what the request answered, or the
	 * dashboard's own default, relative dates resolved and the lot checked.
	 *
	 * <p>A parameter with no value is in the map as an empty value, which is not the same as being
	 * missing: {@code SqlParameterLines} reads it as "no value" and takes the whole condition that
	 * names it out of the WHERE, which is what All means, and what a cleared date means.
	 *
	 * @param declared  the dashboard's declarations, from {@link #declared(String)}
	 * @param request   the runtime request; its {@code params} map holds the viewer's answers
	 * @param dataToday where the data's today comes from, asked only if a value names it (R7)
	 * @throws IllegalArgumentException when a value is not of its declared type, breaks a
	 *                                  constraint, or names a parameter this dashboard does not have
	 */
	public static Map<String, Object> values(List<ReportParameter> declared, Map<String, Object> request,
			Supplier<LocalDate> dataToday) {

		if (declared == null || declared.isEmpty())
			return Map.of();

		Map<String, Object> answered = answered(request);
		refuseUndeclared(declared, answered);

		Map<String, Object> values = new LinkedHashMap<>();
		Map<String, Object> checked = new LinkedHashMap<>();
		Supplier<LocalDate> once = once(dataToday);

		for (ReportParameter parameter : declared) {
			String id = parameter.id;
			if (id == null || id.trim().isEmpty())
				continue;

			String text = answered.containsKey(id)
					? Objects.toString(answered.get(id), "")
					: Objects.toString(parameter.defaultValue, "");
			if (CubeDates.mentions(text))
				text = CubeDates.resolve(text, today(once));

			// The declared type, of the text as it came: it refuses '31/07/2026' by name, and it is
			// the value the constraints are checked against, a day against a day.
			Object typed = ParameterTypes.typed(id, parameter.type, text);
			try {
				VALIDATOR.validate(parameter, typed, checked);
			} catch (ValidationException refused) {
				// The validator's own message, which names the parameter and the bound it broke.
				throw new IllegalArgumentException(refused.getMessage(), refused);
			}

			checked.put(id, typed);
			values.put(id, text);
		}

		return values;
	}

	/**
	 * The same values, and an empty one for every dashboard parameter this cube's conditions name
	 * that the dashboard does not declare.
	 *
	 * <p>Two callers need that: the author's own editor, where there is no dashboard at all, and a
	 * dashboard whose spec has not (yet) got the name. Empty is what the viewer leaving the box
	 * empty means, so the condition naming it is dropped as a whole and the query still runs — far
	 * better than a {@code ${name}} nobody binds reaching the database. On a dashboard the missing
	 * declaration is reported as an error in its own right (R1, the dashboard-side check); this is
	 * only what the statement does meanwhile.
	 */
	public static Map<String, Object> values(List<ReportParameter> declared, CubeOptions cube,
			Map<String, Object> request, Supplier<LocalDate> dataToday) {

		Map<String, Object> values = new LinkedHashMap<>(values(declared, request, dataToday));
		for (String name : CubeRules.parameterNames(cube))
			values.putIfAbsent(name, "");
		mustHaveValuesInSourceSql(cube, values, declared);
		return values;
	}

	/**
	 * A dashboard parameter used inside the cube's own source SQL must have a value (R1, 18a).
	 *
	 * <p>Everywhere else an empty value means "no filter", and the whole condition naming it is
	 * taken out. A source SELECT is not a filter: it is what the cube reads. Taking a line out of
	 * it can change the shape of the statement, the rows it returns or both, so there is no
	 * "as if it were not there" to fall back on and the viewer is told which answer is missing
	 * instead.
	 *
	 * <p>Only where there is a dashboard. A cube open in its own editor has none: nothing declares
	 * and nobody answers, and what the author is shown there is deliberately the export form, with
	 * every {@code ${name}} still standing.
	 */
	private static void mustHaveValuesInSourceSql(CubeOptions cube, Map<String, Object> values,
			List<ReportParameter> declared) {

		if (declared == null || declared.isEmpty())
			return;

		for (String name : CubeRules.sourceSqlNames(cube)) {
			if (!Objects.toString(values.get(name), "").trim().isEmpty())
				continue;
			throw new IllegalArgumentException("'" + name + "' has no value, and this cube reads from "
					+ "SQL that uses it. A parameter with no value takes the condition naming it out of "
					+ "the query, but the cube's own SELECT cannot be taken out: answer '" + name
					+ "', or give it a default in the dashboard's " + SUFFIX.substring(1) + ".");
		}
	}

	/** The viewer's answers, or none. */
	@SuppressWarnings("unchecked")
	private static Map<String, Object> answered(Map<String, Object> request) {
		Object params = request == null ? null : request.get(REQUEST_KEY);
		return params instanceof Map ? (Map<String, Object>) params : Map.of();
	}

	/**
	 * A name the dashboard does not declare is a mistake, not a value: it would be dropped silently
	 * and the viewer would read an answer to a question they had not asked.
	 */
	private static void refuseUndeclared(List<ReportParameter> parameters, Map<String, Object> answered) {

		if (answered.isEmpty())
			return;

		List<String> declared = new ArrayList<>();
		for (ReportParameter parameter : parameters)
			declared.add(parameter.id);

		for (String asked : answered.keySet()) {
			if (declared.contains(asked))
				continue;
			throw new IllegalArgumentException("This dashboard has no parameter '" + asked
					+ "'. It asks for: " + (declared.isEmpty() ? "nothing" : String.join(", ", declared))
					+ ".");
		}
	}

	/**
	 * The spec file, wherever this dashboard is: {@code config/reports}, then the two samples
	 * folders, in the order the rest of the server reads a report in. Null when there is none.
	 */
	static File specOf(String reportId) {

		String id = CubeWidgets.safeId(reportId);
		for (String folder : List.of("config/reports", "config/samples", "config/samples/_frend")) {
			Path path = Paths.get(resolvePathAgainstPortableDir(folder + "/" + id + "/" + id + SUFFIX));
			if (Files.exists(path))
				return path.toFile();
		}
		return null;
	}

	/**
	 * The same supplier, asked at most once: two parameters written relative to the data's today
	 * are one query against {@code demo_info}, not two.
	 */
	private static Supplier<LocalDate> once(Supplier<LocalDate> dataToday) {

		if (dataToday == null)
			return null;

		LocalDate[] read = new LocalDate[1];
		return () -> {
			if (read[0] == null)
				read[0] = dataToday.get();
			return read[0];
		};
	}

	/** The data's today, read once and only when something is written relative to it. */
	private static LocalDate today(Supplier<LocalDate> dataToday) {

		if (dataToday == null)
			throw new IllegalArgumentException("A value of this dashboard is written relative to the "
					+ "data's today ({dataToday:…}), and nothing here can read cube_demo.demo_info to "
					+ "resolve it.");

		return dataToday.get();
	}
}
