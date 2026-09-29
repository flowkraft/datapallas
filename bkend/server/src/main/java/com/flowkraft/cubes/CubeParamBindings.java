package com.flowkraft.cubes;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.flowkraft.embed.UserVariables;
import com.flowkraft.reporting.dsl.cube.CubeRules;

/**
 * What a dashboard's parameters mean to a live cube widget — the binding of the live cube (R8).
 *
 * <p>A dashboard has one filter bar at the top, and every tile on it answers the value the viewer
 * picked there. A frozen tile does it through its script, where the exported SQL carries
 * {@code ${country}} on a line of its own (TODO 21). A live cube has no script: its SQL is written
 * fresh for every question the viewer ticks, so the link between the dashboard's {@code country}
 * and the cube's {@code Country} is written down once, by the author, and kept in the widget's own
 * entry:
 *
 * <pre>
 *   "cube1": { "cubeId": "shop", ...,
 *              "paramBindings": [ { "param": "country", "member": "Country", "operator": "in" } ] }
 * </pre>
 *
 * <p><b>The entry, never the request.</b> The bindings are read from the file beside the report,
 * exactly like the cube id and the connection ({@link CubeWidgets}), and a {@code paramBindings}
 * key in a request body is not one of the runtime's query keys and is dropped with the rest. A
 * viewer may answer a dashboard's parameters; they may not decide what those answers filter.
 *
 * <p><b>All is not a filter.</b> A parameter answered with {@code *} — what every {@code All}
 * choice of a dashboard travels as — or with nothing at all adds no filter, so the widget answers
 * every row the cube already lets this viewer see. It never widens anything: the filters built
 * here are ANDed with the viewer's own, with the cube's {@code condition}s and with its
 * {@code access_filter}, which is the precedence table of
 * {@code 05-access-filter-and-builtin-variables.md}.
 *
 * <p><b>A binding may follow the server instead of the filter bar (R9).</b> Where the parameter
 * is a reserved {@code dp_} name, nobody answers it: the value is whoever is looking, and it comes
 * from {@link UserVariables}. Such a binding is written the same way -
 * {@code { "param": "dp_user_email", "member": "OwnerEmail", "operator": "equals" }} - and turns
 * into a filter whose value is the {@code ${dp_user_email}} the generator writes into the SQL
 * untouched, so a frozen tile carries it to {@code ScriptAssembler} and a live cube to
 * {@link CubeVariableBinding}: one rule about what a builtin is worth, in one place, for both
 * modes. It is never dropped and never read as All - a viewer who is nobody in particular binds
 * an empty value, which matches no row, and a dashboard whose owner filter quietly disappeared
 * would show every owner's rows instead.
 *
 * <p>Nothing here runs SQL, and nothing here is vendor-specific: the result is an ordinary cube
 * filter, and {@link CubeSqlGenerator} binds its values as {@code :cf…} like any other.
 */
public final class CubeParamBindings {

	/** What every {@code All} of a dashboard filter bar travels as (R1). */
	public static final String ALL = "*";

	/**
	 * True when this parameter is the server's to answer and not the viewer's (R9): a reserved
	 * {@code dp_} name, the builtins and the embedding application's own attributes alike.
	 */
	public static boolean isServerSet(String param) {
		return UserVariables.isBuiltinName(param);
	}

	/** {@code ${dp_user_email}}: the name as a generated statement carries it on to its binder. */
	public static String reference(String param) {
		return "${" + Objects.toString(param, "").trim() + "}";
	}

	private CubeParamBindings() {
	}

	/**
	 * One binding: a dashboard parameter, a member of this widget's cube, and the comparison
	 * between them.
	 *
	 * @param param    the dashboard parameter's id, as its spec declares it
	 * @param paramTo  the second parameter, for {@code between}, which binds one per end (F8);
	 *                 null for every other operator
	 * @param member   the dimension or the measure of the cube the value filters on — a measure
	 *                 binding is a HAVING, which the generator already writes
	 * @param operator the comparison, as the canvas chip names it ({@code greater_or_equal}); it is
	 *                 mapped to the cube's own name here and nowhere else
	 */
	public record Binding(String param, String paramTo, String member, String operator) {
	}

	/**
	 * The cube query's name for each name the canvas chip uses — the Java half of
	 * {@code CUBE_QUERY_OPERATORS} in {@code filter-operators.ts}, kept in step by
	 * {@code CubeConditionTest}.
	 *
	 * <p>Two sets of names for the same comparisons: the chip says {@code not_equals} and
	 * {@code greater_or_equal}, a cube query says {@code notEquals} and {@code gte}. The page maps
	 * them for what it sends; the server maps them for what the entry was written with, and a
	 * binding is read on the server long after the page that wrote it has gone.
	 */
	public static final Map<String, String> QUERY_OPERATORS = queryOperators();

	private static Map<String, String> queryOperators() {
		Map<String, String> byChipName = new LinkedHashMap<>();
		byChipName.put("equals", "equals");
		byChipName.put("not_equals", "notEquals");
		byChipName.put("greater_than", "gt");
		byChipName.put("greater_or_equal", "gte");
		byChipName.put("less_than", "lt");
		byChipName.put("less_or_equal", "lte");
		byChipName.put("in", "in");
		byChipName.put("not_in", "notIn");
		byChipName.put("between", "between");
		byChipName.put("contains", "contains");
		byChipName.put("is_null", "notSet");
		byChipName.put("is_not_null", "set");
		return Map.copyOf(byChipName);
	}

	/**
	 * The operators a binding may ask for: the ones that compare against a value somebody answers.
	 *
	 * <p>{@code contains} is not among them because a LIKE needs its {@code %} around the value,
	 * which a bound parameter cannot carry, and the two NULL checks are not because nobody answers
	 * a filter bar with "is null" — they are written on the filter itself, not bound to it. This is
	 * {@code PARAM_BINDABLE_OPS} of {@code filter-operators.ts}, on this side.
	 */
	public static final List<String> BINDABLE = List.of("equals", "not_equals", "greater_than",
			"greater_or_equal", "less_than", "less_or_equal", "in", "not_in", "between");

	/** The same nine, as a cube query spells them: what an entry written in cube names may say. */
	public static final List<String> BINDABLE_QUERY = BINDABLE.stream().map(QUERY_OPERATORS::get)
			.toList();

	/** The cube's own name for a chip operator, or the name itself when a cube already spells it so. */
	public static String queryOperator(String operator) {

		String chip = Objects.toString(operator, "").trim();
		String query = QUERY_OPERATORS.get(chip);
		if (query != null)
			return query;
		if (CubeRules.QUERY_OPERATORS.contains(chip))
			return chip;
		throw new IllegalArgumentException("A parameter binding asks for '" + chip
				+ "', which is not an operator. It may be one of: " + String.join(", ", BINDABLE) + ".");
	}

	/**
	 * The comparisons a member of this type can be bound to, as a cube query names them.
	 *
	 * <p>The same narrowing the canvas chip does with {@code NUMBER_OPS}, {@code STRING_OPS},
	 * {@code DATE_OPS} and {@code BOOLEAN_OPS}, on this side: a measure and a number take all nine,
	 * a date takes the comparisons and the range but not a list, a yes/no takes only {@code =}, and
	 * text takes the two equalities and the two lists — {@code >} on a country is not a question,
	 * and PostgreSQL refuses it outright.
	 *
	 * <p>A dimension with no declared type is a string ({@code CubeRules.DIMENSION_TYPES}), and a
	 * {@code geo} is a string too as far as a comparison goes.
	 *
	 * @param measure true for a measure, whose values are numbers whatever its own type says —
	 *                {@code count}, {@code sum} and the rest are all read as numbers
	 */
	public static List<String> bindableFor(String type, boolean measure) {

		String declared = Objects.toString(type, "").trim().toLowerCase(java.util.Locale.ROOT);
		if (measure || "number".equals(declared))
			return BINDABLE_QUERY;
		if ("time".equals(declared))
			return List.of("equals", "notEquals", "gt", "gte", "lt", "lte", "between");
		if ("boolean".equals(declared))
			return List.of("equals");
		return List.of("equals", "notEquals", "in", "notIn");
	}

	/**
	 * The bindings a widget entry declares, in the order it lists them; empty when it declares
	 * none, which is every dashboard published before this key existed.
	 *
	 * @throws IllegalArgumentException when an entry names no parameter or no member, or asks for
	 *                                  an operator that cannot be bound — a dashboard whose filter
	 *                                  bar silently drove nothing would look exactly like one that
	 *                                  worked
	 */
	@SuppressWarnings("unchecked")
	public static List<Binding> of(Object declared) {

		List<Binding> bindings = new ArrayList<>();
		if (!(declared instanceof List))
			return bindings;

		for (Object each : (List<Object>) declared) {
			if (!(each instanceof Map))
				continue;
			Map<String, Object> entry = (Map<String, Object>) each;

			String param = text(entry.get("param"));
			String member = text(entry.get("member"));
			String operator = text(entry.get("operator"));
			if (operator == null)
				operator = "in";

			if (param == null)
				throw new IllegalArgumentException(
						"A parameter binding on '" + member + "' names no dashboard parameter.");
			if (member == null)
				throw new IllegalArgumentException(
						"The parameter binding of '" + param + "' names no member of the cube to filter on.");
			if (!BINDABLE.contains(operator) && !BINDABLE_QUERY.contains(operator))
				throw new IllegalArgumentException("The parameter binding of '" + param + "' asks for '"
						+ operator + "', which is not an operator a value can be bound to. It may be one of: "
						+ String.join(", ", BINDABLE) + ".");

			String paramTo = text(entry.get("paramTo"));
			if ("between".equals(operator) && paramTo == null)
				throw new IllegalArgumentException("The parameter binding of '" + param + "' on '" + member
						+ "' asks for 'between', which needs a second parameter for its other end "
						+ "(\"paramTo\").");

			bindings.add(new Binding(param, paramTo, member, queryOperator(operator)));
		}
		return bindings;
	}

	/**
	 * The filters these bindings are, for the values the viewer answered the dashboard with.
	 *
	 * <p>A parameter with no value, or answered {@code *}, adds no filter at all — that is what All
	 * means. A value the entry binds nothing to is not here either: the dashboard's parameters are
	 * the viewer's to answer, and which of them this widget follows is the author's to decide.
	 */
	public static List<Map<String, Object>> filtersFor(List<Binding> bindings,
			Map<String, Object> values) {

		List<Map<String, Object>> filters = new ArrayList<>();
		if (bindings == null || bindings.isEmpty())
			return filters;

		Map<String, Object> answered = values != null ? values : Map.of();
		for (Binding binding : bindings) {

			List<Object> asked = valuesOf(binding, answered);
			if (asked.isEmpty())
				continue;

			Map<String, Object> filter = new LinkedHashMap<>();
			filter.put("member", binding.member());
			filter.put("operator", binding.operator());
			filter.put("values", asked);
			filters.add(filter);
		}
		return filters;
	}

	/**
	 * What one binding compares against: nothing when the viewer picked All, the two ends of a
	 * {@code between}, the items of a list, or the one value every other operator takes.
	 */
	private static List<Object> valuesOf(Binding binding, Map<String, Object> answered) {

		if ("between".equals(binding.operator())) {
			Object from = endValue(binding.param(), answered);
			Object to = endValue(binding.paramTo(), answered);
			if (from == null && to == null)
				return List.of();
			// One end left empty is a half-open range, which the generator writes as the one
			// comparison it is - a viewer who filled in only "from" asked for everything after it.
			List<Object> ends = new ArrayList<>();
			ends.add(from);
			ends.add(to);
			return ends;
		}

		Object value = endValue(binding.param(), answered);
		if (value == null)
			return List.of();

		if ("in".equals(binding.operator()) || "notIn".equals(binding.operator())) {
			// A multi-select travels as one text, the items separated by commas - the same shape
			// `addInList` splits in a published script, so the frozen tile and the live cube read
			// the viewer's answer the same way.
			List<Object> items = new ArrayList<>();
			if (value instanceof List) {
				for (Object item : (List<?>) value) {
					Object one = answeredValue(item);
					if (one != null)
						items.add(one);
				}
				return items;
			}
			for (String item : value.toString().split(",")) {
				String one = item.trim();
				if (!one.isEmpty() && !ALL.equals(one))
					items.add(one);
			}
			return items;
		}

		return List.of(value);
	}

	/**
	 * What one end of a binding compares against: the name itself when the server answers it
	 * (R9), and otherwise the value the viewer did.
	 *
	 * <p>The name is returned rather than the value behind it because nobody is asking here -
	 * {@code filtersFor} is given a dashboard's answers and no caller at all - and because the
	 * name is what both modes need: the export writes it into the published SQL, and the live
	 * cube's {@link CubeVariableBinding} binds it a moment before the statement runs. Neither
	 * {@code *} nor an empty answer can reach it, so a server-set binding is always a filter.
	 */
	private static Object endValue(String param, Map<String, Object> answered) {

		if (isServerSet(param))
			return reference(param);
		return answeredValue(answered.get(param));
	}

	/** The value as it was answered, or null for "nothing" and for All. */
	private static Object answeredValue(Object value) {

		if (value == null)
			return null;
		if (value instanceof List)
			return ((List<?>) value).isEmpty() ? null : value;
		String text = value.toString().trim();
		if (text.isEmpty() || ALL.equals(text))
			return null;
		return value instanceof String ? text : value;
	}

	private static String text(Object value) {
		if (value == null)
			return null;
		String text = value.toString().trim();
		return text.isEmpty() ? null : text;
	}
}
