package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Where a cube's files are: in a folder of its own, or in a domain folder next to other cubes,
 * alone in its DSL file or under a name in a file it shares.
 */
class CubeFilesTest {

	@TempDir
	Path dir;

	@Test
	void aCubeFolderHoldsOneCubeNamedByTheFolder() throws Exception {
		write("northwind-sales/cube.xml", xml("Northwind Sales", ""));
		write("northwind-sales/northwind-sales-cube-config.groovy", "cube { }");

		CubeFiles cube = CubeFiles.find(dir.toFile(), "northwind-sales");

		assertEquals("northwind-sales", cube.getId());
		assertEquals(file("northwind-sales/cube.xml"), cube.getMetadataFile());
		assertEquals(file("northwind-sales/northwind-sales-cube-config.groovy"), cube.getDslFile());
		assertEquals(file("northwind-sales/hints.json"), cube.getHintsFile());
		assertNull(cube.getCubeName(), "The file's unnamed cube");
	}

	@Test
	void aDomainFolderHoldsSeveralCubesEachWithItsOwnFiles() throws Exception {
		write("transport-logistics/freight-shipments-cube.xml", xml("Freight Shipments", ""));
		write("transport-logistics/freight-shipments-cube-config.groovy", "cube { }");
		write("transport-logistics/depot-network-cube.xml", xml("Depot Network", ""));
		write("transport-logistics/depot-network-cube-config.groovy", "cube { }");

		CubeFiles depots = CubeFiles.find(dir.toFile(), "depot-network");

		assertEquals(file("transport-logistics/depot-network-cube.xml"), depots.getMetadataFile());
		assertEquals(file("transport-logistics/depot-network-cube-config.groovy"), depots.getDslFile());
		assertEquals(file("transport-logistics/depot-network-hints.json"), depots.getHintsFile());
		assertNull(depots.getCubeName());
		assertEquals(List.of("depot-network", "freight-shipments"), idsOf(CubeFiles.scan(dir.toFile())));
	}

	@Test
	void twoNamedCubesShareOneSetOfFilesAndAreStillTwoCubes() throws Exception {
		write("erp-finance/customer-billing-cube.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<cubes>\n"
				+ "    <cube>\n        <cubeName>customer-invoices</cubeName>\n        <name>Customer Invoices</name>\n"
				+ "        <connectionId>rbt-sample-northwind-duckdb-4f2</connectionId>\n    </cube>\n"
				+ "    <cube>\n        <cubeName>customer-payments</cubeName>\n        <name>Customer Payments</name>\n"
				+ "        <connectionId>rbt-sample-northwind-duckdb-4f2</connectionId>\n    </cube>\n</cubes>\n");
		write("erp-finance/customer-billing-cube-config.groovy",
				"cube('customer-invoices') { }\ncube('customer-payments') { }");
		write("erp-finance/invoice-balances-cube.xml", xml("Invoice Balances", ""));
		write("erp-finance/invoice-balances-cube-config.groovy", "cube { }");

		CubeFiles invoices = CubeFiles.find(dir.toFile(), "customer-invoices");
		CubeFiles payments = CubeFiles.find(dir.toFile(), "customer-payments");

		assertEquals(file("erp-finance/customer-billing-cube.xml"), invoices.getMetadataFile());
		assertEquals(file("erp-finance/customer-billing-cube-config.groovy"), invoices.getDslFile());
		assertEquals(file("erp-finance/customer-billing-hints.json"), invoices.getHintsFile());
		assertEquals(invoices.getMetadataFile(), payments.getMetadataFile(), "One metadata file");
		assertEquals(invoices.getDslFile(), payments.getDslFile(), "One DSL file");
		assertEquals(invoices.getHintsFile(), payments.getHintsFile(), "One hints file");
		assertEquals("customer-invoices", invoices.getCubeName());
		assertEquals("customer-payments", payments.getCubeName());
		assertEquals("Customer Invoices", invoices.metadata("name", null), "Each cube its own metadata");
		assertEquals("Customer Payments", payments.metadata("name", null));
		assertNull(CubeFiles.find(dir.toFile(), "invoice-balances").getCubeName(), "Unnamed, beside them");
		assertNull(CubeFiles.find(dir.toFile(), "customer-billing"), "The file is not a cube");
		assertEquals(List.of("customer-invoices", "customer-payments", "invoice-balances"),
				idsOf(CubeFiles.scan(dir.toFile())));
	}

	@Test
	void anIdClaimedTwiceIsOneCubeAndAnUnknownIdIsNone() throws Exception {
		write("a-domain/online-sales-cube.xml", xml("Online Sales", ""));
		write("b-domain/online-sales-cube.xml", xml("Online Sales, again", ""));

		assertEquals(List.of("online-sales"), idsOf(CubeFiles.scan(dir.toFile())));
		assertEquals(file("a-domain/online-sales-cube.xml"),
				CubeFiles.find(dir.toFile(), "online-sales").getMetadataFile());
		assertNull(CubeFiles.find(dir.toFile(), "no-such-cube"));
		assertNull(CubeFiles.find(dir.toFile(), ""));
	}

	private static List<String> idsOf(List<CubeFiles> cubes) {
		List<String> ids = new ArrayList<>();
		for (CubeFiles cube : cubes) ids.add(cube.getId());
		return ids;
	}

	private static String xml(String name, String more) {
		return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<cube>\n    <name>" + name + "</name>\n"
				+ "    <connectionId>rbt-sample-northwind-duckdb-4f2</connectionId>\n" + more + "</cube>\n";
	}

	private File file(String relative) {
		return dir.resolve(relative).toFile();
	}

	private void write(String relative, String content) throws Exception {
		Path path = dir.resolve(relative);
		Files.createDirectories(path.getParent());
		Files.writeString(path, content);
	}
}
