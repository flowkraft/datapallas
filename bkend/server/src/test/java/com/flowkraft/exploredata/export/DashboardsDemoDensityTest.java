package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.flowkraft.exploredata.export.DashboardDemos.Demo;

/**
 * How crowded every chart of the 25 demos is, held to what its checks measured.
 *
 * <p>A demo is only a demo if its charts have something in them: section 6.2 of the plan sets a
 * smallest size per kind of bucket - a line's every point, each series of a split line, a pivot's
 * every row - and each demo's {@code checks.json} carries a {@code density} block that measured its
 * own buckets on the frozen rows, with the query it measured them with.
 *
 * <p>This test re-asks every one of those queries and holds the data to the number the checks
 * froze, so a seed change that empties a chart cannot pass unnoticed; then it holds each measurement
 * to section 6.2's threshold, except where the checks say in the file itself that this bucket falls
 * short ({@code shortfall}). Those are named here, one line each, so the set of thin charts in the
 * product can only shrink.
 */
class DashboardsDemoDensityTest {

	/** The buckets section 6.2's threshold is not met for, as the checks themselves say. */
	private static final List<String> THE_THIN_ONES = List.of(
			"dd-sales-channels / defaults / chart-channel-share-per-month (month x channel): 18 of 20",
			"dd-sales-channels / include-returns-on / chart-channel-share-per-month (month x channel): 18 of 20",
			"dd-customer-growth / defaults / chart-new-customers-per-month-by-channel "
					+ "(month x channel, partner and email folded into Other): 3 of 20",
			"dd-customer-growth / segment-enterprise / chart-new-customers-per-month-by-channel "
					+ "(month): 1 of 20",
			"dd-customer-growth / channel-referral / chart-new-customers-per-month-by-channel "
					+ "(month): 8 of 20",
			"dd-cohort-retention / defaults / pivot-cohorts (signup cohort): 86 of 100",
			"dd-cohort-retention / customer-type-business / pivot-cohorts (signup cohort): 51 of 100",
			"dd-cohort-retention / customer-type-consumer / pivot-cohorts (signup cohort): 66 of 100",
			"dd-web-funnel / defaults / chart-mobile-checkout-per-month "
					+ "(month, mobile sessions reaching checkout): 39 of 50",
			"dd-web-funnel / defaults / chart-sessions-per-week-by-device (week x device): 32 of 50",
			"dd-support-operations / defaults / chart-created-vs-resolved-per-week (week): 84 of 100");

	/**
	 * The buckets that are not a tile's. A demo's data has a few promises made about it in words -
	 * that one product sells every month of its story, that the customer the page opens on has orders,
	 * invoices and tickets to show, that the country select has enough countries to compare - and the
	 * checks measure those the same way they measure a chart's. They are named here because nothing
	 * else can tie them to a widget, so a typo in a widget key cannot hide among them.
	 */
	private static final List<String> THE_DATA_GUARANTEES = List.of(
			"dd-product-performance / defaults / named-guarantee-aerodesk-orders-a-month",
			"dd-product-performance / defaults / named-guarantee-aerodesk-orders-a-month-before",
			"dd-customer-360 / defaults / named-guarantee-helix-orders",
			"dd-customer-360 / defaults / named-guarantee-helix-invoices",
			"dd-customer-360 / defaults / named-guarantee-helix-tickets",
			"dd-receivables-aging / defaults / named-guarantee-overdue-customers",
			"dd-inventory / defaults / named-guarantee-below-reorder",
			"dd-segment-vs-all / defaults / filter-country-options");

	/**
	 * The two demos with no bucket of their own. Section 6.2 rules on the shapes it names - a line's
	 * points, a split line's series, a pivot's rows, a heatmap's cells - and not on every shape a page
	 * can hold: DD17's payroll bars and DD23's column profile are sized by the data's own shape (eight
	 * departments, a table's columns), so A-data's TODO 3 wrote no threshold for them rather than
	 * inventing one. They are named here so a demo that loses its density block cannot join them
	 * quietly.
	 */
	private static final List<String> THE_UNRULED = List.of("dd-payroll", "dd-table-profile");

	@Test
	@DisplayName("Every bucket of every demo is the size its checks measured, and big enough")
	void everyBucketIsTheSizeItsChecksMeasured() throws Exception {

		Connection connection = DashboardDemos.dashDemo();
		List<String> wrong = new ArrayList<>();
		List<String> thin = new ArrayList<>();
		List<String> guarantees = new ArrayList<>();
		int buckets = 0;

		for (Demo demo : DashboardDemos.all()) {
			assertEquals(THE_UNRULED.contains(demo.id()), demo.density().isEmpty(),
					demo.id() + " has a density block where section 6.2 rules on its widgets, and none"
							+ " where it does not");
			for (Map<String, Object> entry : demo.density()) {
				buckets++;
				wrong.addAll(problems(demo, entry, connection, thin, guarantees));
			}
		}

		assertTrue(wrong.isEmpty(), "a bucket is not the size its checks measured:\n"
				+ String.join("\n", wrong));

		// The thin ones, by name. A new one has to be written into this list, which is where the
		// question "does this chart have enough in it?" gets asked of a person.
		assertEquals(THE_THIN_ONES, thin, "the buckets that fall short of section 6.2 have changed");
		assertEquals(THE_DATA_GUARANTEES, guarantees,
				"the buckets that are about a demo's data and not about one of its tiles have changed");
		assertEquals(62, buckets, "every demo's density block, as it stands today");
	}

	@Test
	@DisplayName("A bucket that has shrunk, and one that quietly falls short, both go red")
	void aBucketThatHasShrunkGoesRed() throws Exception {

		// The loop above is worth having only if it can fail, and it has two ways to: the data no
		// longer holds what the checks measured, and a chart that is too thin without saying so.
		// Both are built here from a scratch copy of one real entry.
		Connection connection = DashboardDemos.dashDemo();
		Demo demo = DashboardDemos.all().get(3);
		Map<String, Object> entry = demo.density().get(0);

		Map<String, Object> shrunk = new LinkedHashMap<>(entry);
		shrunk.put("observed", ((Number) entry.get("observed")).doubleValue() + 1);
		List<String> found = problems(demo, shrunk, connection, new ArrayList<>(), new ArrayList<>());
		assertEquals(1, found.size(), "a bucket smaller than its checks measured is reported once: "
				+ found);
		assertTrue(found.get(0).contains("the checks measured"), found.get(0));

		Map<String, Object> unmarked = new LinkedHashMap<>(entry);
		unmarked.remove("shortfall");
		List<String> thin = new ArrayList<>();
		found = problems(demo, unmarked, connection, thin, new ArrayList<>());
		assertEquals(1, found.size(), "a bucket that falls short without saying so is reported once: "
				+ found);
		assertTrue(found.get(0).contains("falls short of"), found.get(0));
		assertTrue(thin.isEmpty(), "and it is not one of the blessed ones: " + thin);
	}

	/** A measurement as the checks write it: a count without a decimal point, an average with one. */
	private static String plain(double value) {
		return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
	}

	/**
	 * Re-measures one entry on the frozen rows: what is wrong with it, and, for a bucket the checks
	 * themselves say falls short, the line that names it.
	 */
	private static List<String> problems(Demo demo, Map<String, Object> entry, Connection connection,
			List<String> thin, List<String> guarantees) throws Exception {

		List<String> found = new ArrayList<>();
		String widget = Objects.toString(entry.get("widget"), "");
		String over = Objects.toString(entry.get("over"), "");
		String bucket = Objects.toString(entry.get("bucket"), "");
		String where = demo.id() + " / " + over + " / " + widget + " (" + bucket + ")";

		// The tile it is about, and the state it was measured in, are this demo's own. A bucket that
		// is not a tile's - a promise made about the data itself - names itself instead, and is
		// collected so the set of them is held to the list above.
		if (widget.startsWith("named-guarantee-") || widget.startsWith("filter-"))
			guarantees.add(demo.id() + " / " + over + " / " + widget);
		else
			demo.widget(widget);
		if (!"defaults".equals(over))
			demo.interaction(over);

		// Both are read as they are written: a count is a whole number, and a heatmap's "per cell on
		// average" is not.
		double observed = ((Number) entry.get("observed")).doubleValue();
		double threshold = ((Number) entry.get("threshold")).doubleValue();
		String sql = Objects.toString(entry.get("sql"), "");
		assertTrue(!sql.isBlank(), where + " measured nothing");

		Double now = DashboardDemos.number(connection, sql);
		if (now == null)
			found.add(where + ": the bucket query came back empty");
		else if (Math.abs(now - observed) > 0.005)
			found.add(where + ": the checks measured " + plain(observed) + ", the rows now have "
					+ plain(now));

		if (observed < 1)
			found.add(where + ": nothing in it at all");

		if (observed < threshold) {
			String line = where + ": " + plain(observed) + " of " + plain(threshold);
			if (Boolean.TRUE.equals(entry.get("shortfall")))
				thin.add(line);
			else
				found.add(line + " falls short of section 6.2, and the checks do not say so");
		}
		return found;
	}
}
