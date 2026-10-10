package com.flowkraft.analytics.services;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.flowkraft.analytics.engine.dto.PivotRequest;
import com.flowkraft.analytics.engine.duckdb.DuckDBPivotProcessor;

/**
 * A published pivot of a dashboard's script data copies the rows the script returned into a DuckDB
 * table and pivots that. The table's columns have to keep the rows' types: a DECIMAL column (an
 * order's total) comes back from JDBC as BigDecimal, and a column made text of it cannot be summed
 * ("No function matches ... sum(VARCHAR)"), which is what the reader of a published pivot got when
 * they chose Sum and a value field.
 */
public class ScriptDataPivotTypesTest {

	private static LinkedHashMap<String, Object> order(String status, String channel, BigDecimal total) {
		LinkedHashMap<String, Object> row = new LinkedHashMap<>();
		row.put("status", status);
		row.put("channel", channel);
		row.put("total_amount", total);
		return row;
	}

	@Test
	public void aDecimalColumnOfScriptDataIsSummedByThePivot() throws Exception {
		List<LinkedHashMap<String, Object>> data = new ArrayList<>();
		// The first row has no total: the column's type is read from its first value, not its first row.
		data.add(order("completed", "web", null));
		data.add(order("completed", "web", new BigDecimal("120.50")));
		data.add(order("completed", "web", new BigDecimal("79.25")));
		data.add(order("completed", "mobile_app", new BigDecimal("10.10")));
		data.add(order("cancelled", "web", new BigDecimal("5.00")));

		DuckDBAnalyticsService service = new DuckDBAnalyticsService(null);
		try (Connection conn = DriverManager.getConnection("jdbc:duckdb:")) {
			service.createTableFromData(conn, "e2e_orders", data, Arrays.asList("status", "channel", "total_amount"));

			PivotRequest request = new PivotRequest();
			request.setTableName("e2e_orders");
			request.setRows(Arrays.asList("status"));
			request.setCols(Arrays.asList("channel"));
			request.setVals(Arrays.asList("total_amount"));
			request.setAggregatorName("Sum");
			String sql = new DuckDBPivotProcessor().generateSQL(request);

			Map<String, Double> cells = new HashMap<>();
			try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(sql)) {
				while (rs.next()) {
					Object value = rs.getObject("total_amount");
					cells.put(rs.getString("status") + "::" + rs.getString("channel"),
							value == null ? null : ((Number) value).doubleValue());
				}
			}

			assertEquals(199.75, cells.get("completed::web"), 0.001, "120.50 + 79.25, the null left out");
			assertEquals(10.10, cells.get("completed::mobile_app"), 0.001);
			assertEquals(5.00, cells.get("cancelled::web"), 0.001);
			assertEquals(3, cells.size(), "one cell per status and channel that has orders");
		}
	}
}
