package com.flowkraft.cubes;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The questions a cube was written to answer — its {@code hints.json}, as a widget offers them.
 *
 * <p>A hint is a question, the sentence that says which fields answer it, and the selection itself.
 * Some hints carry variants: the same question asked again with one field swapped, added or
 * dropped. On the page each of them is a <b>Show Me</b> of its own, because each is a different
 * answer, so this class flattens the file into one list of asks — the hint first, then its
 * variants, in the file's order.
 *
 * <p>An ask's {@code id} is what the page's markup is built from ({@code #hint-{id}},
 * {@code #btnShowMe-{id}}), and its {@code check} is what
 * {@code frend/reporting/e2e/_resources/cube-checks/{cubeId}.checks.json} calls the same ask. The
 * two differ in one character: a check names a variant {@code hint/variant} and an element id
 * cannot usefully hold a slash, so an ask's id writes it {@code hint--variant}. Both travel, so
 * neither the page nor a test has to guess the other.
 *
 * <p>One file may hold the hints of several cubes — {@code customer-billing} holds Customer
 * Invoices and Customer Payments — and then each hint's query names its cube in {@code cubeName}.
 * A widget shows only its own cube's hints, and {@code cubeName} is taken back out of the query
 * before the ask leaves here: a live cube answers about the cube its dashboard declares, so the
 * name would be refused by {@code /query} if it were sent back.
 *
 * <p>A hint may ask its question of a period, by presetting the viewer's own filters in its
 * query's {@code filters} — a {@code between} on the cube's date dimension is what Show Me over a
 * quarter is. The days in those filters are written relative to the data's today
 * ({@code {dataToday}}, R7), never as fixed days, so a hint keeps meaning the same period after
 * the demo data is re-seeded. They are resolved here, once, on the way out.
 *
 * <p>Nothing here is vendor-specific, and nothing here runs SQL.
 */
public final class CubeHints {

	private static final ObjectMapper JSON = new ObjectMapper();

	/** The key a hint's query names its cube by, in a file that holds several. */
	private static final String CUBE_NAME = "cubeName";

	private CubeHints() {
	}

	/**
	 * The asks of one cube, in the file's order, or an empty list when the cube has no hints file.
	 *
	 * @param hintsFile the {@code hints.json} of the cube's file — shared by every cube in it
	 * @param cubeName  the cube's name inside that file, or null/empty for the file's own cube
	 */
	public static List<Map<String, Object>> of(File hintsFile, String cubeName) throws IOException {
		return of(hintsFile, cubeName, () -> null);
	}

	/**
	 * The same asks, with every {@code {dataToday…}} in a hint's parameter answers resolved against
	 * the day the data itself calls today (R7).
	 *
	 * @param dataToday where that day comes from — asked only when a hint actually names it, because
	 *                  reading it costs a query
	 */
	public static List<Map<String, Object>> of(File hintsFile, String cubeName,
			Supplier<LocalDate> dataToday) throws IOException {

		List<Map<String, Object>> asks = new ArrayList<>();
		if (hintsFile == null || !hintsFile.isFile())
			return asks;

		List<Map<String, Object>> hints = JSON.readValue(Files.readString(hintsFile.toPath()),
				new TypeReference<ArrayList<Map<String, Object>>>() {
				});

		String wanted = text(cubeName);
		for (Map<String, Object> hint : hints) {
			Map<String, Object> query = mapOf(hint.get("query"));
			if (!wanted.equals(text(query.get(CUBE_NAME))))
				continue;

			String id = text(hint.get("id"));
			query = dated(query, dataToday);
			String question = text(hint.get("question"));
			asks.add(ask(id, id, question, text(hint.get("text")), query));

			for (Object variant : listOf(hint.get("variants"))) {
				Map<String, Object> asked = mapOf(variant);
				String variantId = text(asked.get("id"));
				// A variant asks the hint's question again, so it is the hint's question that is
				// written above it; its own sentence says what changed.
				asks.add(ask(id + "--" + variantId, id + "/" + variantId, question,
						text(asked.get("text")), dated(mapOf(asked.get("query")), dataToday)));
			}
		}
		return asks;
	}

	/**
	 * The query with the days in its preset filters turned into real days. A relative day is text
	 * like {@code {dataToday: startOf quarter}}; anything else is left exactly as the file wrote
	 * it, and a query whose filters hold none comes back as it went in, the same object.
	 */
	private static Map<String, Object> dated(Map<String, Object> query, Supplier<LocalDate> dataToday) {

		List<?> filters = listOf(query.get("filters"));
		if (filters.isEmpty())
			return query;

		List<Map<String, Object>> resolved = new ArrayList<>();
		boolean changed = false;
		for (Object one : filters) {
			Map<String, Object> filter = mapOf(one);
			List<?> values = listOf(filter.get("values"));
			List<Object> days = new ArrayList<>();
			boolean here = false;
			for (Object value : values) {
				if (value instanceof CharSequence && CubeDates.mentions(value.toString())) {
					value = CubeDates.resolve(value.toString(), dataToday.get());
					here = true;
				}
				days.add(value);
			}
			if (here)
				filter.put("values", days);
			changed = changed || here;
			resolved.add(filter);
		}
		if (!changed)
			return query;

		Map<String, Object> dated = new LinkedHashMap<>(query);
		dated.put("filters", resolved);
		return dated;
	}

	private static Map<String, Object> ask(String id, String check, String question, String text,
			Map<String, Object> query) {

		Map<String, Object> asked = new LinkedHashMap<>(query);
		asked.remove(CUBE_NAME);

		Map<String, Object> ask = new LinkedHashMap<>();
		ask.put("id", id);
		ask.put("check", check);
		ask.put("question", question);
		ask.put("text", text);
		ask.put("query", asked);
		return ask;
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> mapOf(Object value) {
		return value instanceof Map ? new LinkedHashMap<>((Map<String, Object>) value) : new LinkedHashMap<>();
	}

	private static List<?> listOf(Object value) {
		return value instanceof List ? (List<?>) value : List.of();
	}

	private static String text(Object value) {
		return Objects.toString(value, "").trim();
	}
}
