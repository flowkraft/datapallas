package com.sourcekraft.documentburster.unit.northwind;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.BeforeClass;
import org.junit.Test;

import com.sourcekraft.documentburster._helpers.NorthwindTestUtils;

/**
 * NORTHWIND IS FROZEN (decided 2026-09-17). This test fails if NorthwindDataGenerator's output changes.
 *
 * WHY: the DataZeus academy's Learn SQL Series 1 is PUBLISHED on this data — its figures are on screen,
 * in articles and in koans (Data Modeling Series 1, Python and Java & Groovy use it too). The starter
 * packs regenerate Northwind from this generator on first start, so any change here silently changes
 * what learners see next to a published video.
 *
 * THE REFERENCE is the academy's shipped file (kraft-src-company-biz,
 * .../_datazeus/datasets/northwind/northwind.duckdb): the golden lines below were computed from it with
 * the same canonical form this test uses (every non-BLOB column, names sorted case-insensitively; values
 * canonical — NULL as <NULL>, numbers with trailing zeros stripped, timestamps as yyyy-MM-dd HH:mm:ss,
 * dates as yyyy-MM-dd; rows as tab-joined strings, sorted; SHA-256 of the rows joined by newlines).
 *
 * IF THIS FAILS: do not update the golden lines to make it pass. A course needing different data gets a
 * NEW dataset (see the academy's datasets/README.md, "Rules for changing a relational dataset", and
 * kraft-src-company-biz/.docs/plan-academy-datasets.md). Update the lines only for a change the owner
 * has decided to publish, together with every lesson it affects.
 */
public class NorthwindFrozenTest {

	/** table | row count | non-BLOB columns, sorted | SHA-256 of the canonical rows */
	private static final String[] GOLDEN = {
			"Categories|8|CategoryID,CategoryName,Description|386beec363350784a5bbae91068f245726a9dd1571d6baa26b1ece0eaa044a34",
			"CustomerCustomerDemo|0|CustomerID,CustomerTypeID|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			"CustomerDemographics|0|CustomerDesc,CustomerTypeID|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			"Customers|25|Address,City,CompanyName,ContactName,ContactTitle,Country,CustomerID,Email,Fax,Phone,PostalCode,Region|5eae34761fec14f1c8876de9027daa47824a54055159572675e3a6484da82e4b",
			"EmployeeTerritories|0|EmployeeID,TerritoryID|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			"Employees|3|Address,BirthDate,City,Country,Email,EmployeeID,Extension,FirstName,HireDate,HomePhone,LastName,Mobile,Notes,PhotoPath,PostalCode,Region,ReportsTo,Title,TitleOfCourtesy|579dfd0bf8961b91a5bff6eb70abeff800c3d0e2489c3293e9913fcd1d207d6a",
			"Order Details|193|Discount,OrderID,ProductID,Quantity,UnitPrice|213a78f1975aaf6d0d8bb3581fc88c523b6f1ecf1fd70153dff1917908c2d2f3",
			"Orders|79|CustomerID,EmployeeID,Freight,OrderDate,OrderID,RequiredDate,ShipAddress,ShipCity,ShipCountry,ShipName,ShippedDate,ShipPostalCode,ShipRegion,ShipVia|704bdfcf09fea7d73fb1b6aec90e3c81bd10322a5753dbf853d25b56806d35ae",
			"Products|20|CategoryID,Discontinued,ProductID,ProductName,QuantityPerUnit,ReorderLevel,SupplierID,UnitPrice,UnitsInStock,UnitsOnOrder|e807986d726795ab005a6b907e8afd37d4e235fbe371cb59bc82d094041e6b77",
			"Region|0|RegionDescription,RegionID|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			"Shippers|3|CompanyName,Phone,ShipperID|205389c42f34754982b5d95d1305495d1d88e3b77c09b22fa5f831bbaa5dfaf0",
			"Suppliers|6|Address,City,CompanyName,ContactName,ContactTitle,Country,Email,Fax,HomePage,Phone,PostalCode,Region,SupplierID|adb344a1388bfd72f6cd11d5b05ea0b31b365b6dd009bef52fe70b08afb1ac51",
			"Territories|0|RegionID,TerritoryDescription,TerritoryID|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", };

	private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

	@BeforeClass
	public static void generate() throws Exception {
		NorthwindTestUtils.setupTestDatabase();
	}

	@Test
	public void northwindGeneratorOutputIsUnchanged() throws Exception {
		List<String> mismatches = new ArrayList<>();
		try (Connection conn = DriverManager.getConnection(NorthwindTestUtils.NORTHWIND_URL, NorthwindTestUtils.NORTHWIND_USER,
				NorthwindTestUtils.NORTHWIND_PASS)) {
			for (String golden : GOLDEN) {
				String table = golden.split("\\|")[0];
				String actual = describe(conn, table);
				if (!golden.equals(actual)) {
					mismatches.add("expected " + golden + "\n     got " + actual);
				}
			}
		}
		if (!mismatches.isEmpty()) {
			fail("Northwind is FROZEN and NorthwindDataGenerator's output changed (see this class's comment):\n"
					+ String.join("\n", mismatches));
		}
		assertEquals(0, mismatches.size());
	}

	private static String describe(Connection conn, String table) throws Exception {
		List<String> cols = new ArrayList<>();
		DatabaseMetaData meta = conn.getMetaData();
		Map<String, Integer> types = new LinkedHashMap<>();
		try (ResultSet rs = meta.getColumns(null, null, table, null)) {
			while (rs.next()) {
				String name = rs.getString("COLUMN_NAME");
				int type = rs.getInt("DATA_TYPE");
				if (type == java.sql.Types.BLOB || type == java.sql.Types.VARBINARY || type == java.sql.Types.BINARY
						|| type == java.sql.Types.LONGVARBINARY) {
					continue;
				}
				cols.add(name);
				types.put(name, type);
			}
		}
		if (cols.isEmpty()) {
			return table + "|<missing table>";
		}
		cols.sort(String.CASE_INSENSITIVE_ORDER);
		StringBuilder select = new StringBuilder("SELECT ");
		for (int i = 0; i < cols.size(); i++) {
			select.append(i == 0 ? "" : ", ").append('"').append(cols.get(i)).append('"');
		}
		select.append(" FROM \"").append(table).append('"');

		List<String> rows = new ArrayList<>();
		try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(select.toString())) {
			while (rs.next()) {
				StringBuilder row = new StringBuilder();
				for (int i = 1; i <= cols.size(); i++) {
					row.append(i == 1 ? "" : "\t").append(canon(rs.getObject(i)));
				}
				rows.add(row.toString());
			}
		}
		Collections.sort(rows);
		MessageDigest sha = MessageDigest.getInstance("SHA-256");
		byte[] digest = sha.digest(String.join("\n", rows).getBytes(StandardCharsets.UTF_8));
		StringBuilder hex = new StringBuilder();
		for (byte b : digest) {
			hex.append(String.format("%02x", b));
		}
		return table + "|" + rows.size() + "|" + String.join(",", cols) + "|" + hex;
	}

	private static String canon(Object v) {
		if (v == null) {
			return "<NULL>";
		}
		if (v instanceof Boolean) {
			return ((Boolean) v) ? "true" : "false";
		}
		if (v instanceof Number) {
			BigDecimal d = new BigDecimal(v.toString()).stripTrailingZeros();
			String s = d.toPlainString();
			return "-0".equals(s) ? "0" : s;
		}
		if (v instanceof java.sql.Timestamp) {
			return ((java.sql.Timestamp) v).toLocalDateTime().format(TS);
		}
		if (v instanceof java.time.LocalDateTime) {
			return ((java.time.LocalDateTime) v).format(TS);
		}
		if (v instanceof java.sql.Date) {
			return ((java.sql.Date) v).toLocalDate().toString();
		}
		if (v instanceof java.time.LocalDate) {
			return v.toString();
		}
		return v.toString();
	}
}
