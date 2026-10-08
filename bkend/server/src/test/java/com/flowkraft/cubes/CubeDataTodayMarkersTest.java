package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * The shipped DuckDB holds both demos, each with its own day. A dashboard is read against its own
 * rows' day, so it asks for {@code dash_demo.as_of} first (file 9, DD02: its end date came out as
 * the cubes' day, a week after its data ends).
 */
class CubeDataTodayMarkersTest {

	@Test
	void aDashboardAsksItsOwnMarkerFirstAndTheCubesAskTheirs() {
		assertEquals("SELECT data_today, shift_days FROM dash_demo.as_of",
				CubeDataToday.DASHBOARDS_FIRST.get(0));
		assertEquals("SELECT data_today, shift_days FROM cube_demo.demo_info",
				CubeDataToday.DASHBOARDS_FIRST.get(1));
		assertEquals("SELECT data_today, shift_days FROM cube_demo.demo_info", CubeDataToday.MARKERS.get(0));
	}
}
