package com.sourcekraft.documentburster.engine;

import org.apache.commons.io.FilenameUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.engine.excel.PoiExcelBurster;
import com.sourcekraft.documentburster.engine.pdf.PdfBurster;
import com.sourcekraft.documentburster.engine.reporting.CsvReporter;
import com.sourcekraft.documentburster.engine.reporting.ExcelReporter;
import com.sourcekraft.documentburster.engine.reporting.FixedWidthReporter;
import com.sourcekraft.documentburster.engine.reporting.JasperStandaloneReporter;
import com.sourcekraft.documentburster.engine.reporting.ScriptedReporter;
import com.sourcekraft.documentburster.engine.reporting.SqlReporter;
import com.sourcekraft.documentburster.engine.reporting.XmlReporter;

public class BursterFactory {

	private static Logger log = LoggerFactory.getLogger(BursterFactory.class);
	static String MODE_BURST = "burst";

	public static AbstractBurster create(String filePath, String configurationFilePath, String jobType)
			throws Exception {

		log.debug("BursterFactory.create: filePath = " + filePath + "configurationFilePath = " + configurationFilePath
				+ ", jobType = " + jobType);

		String extension = FilenameUtils.getExtension(filePath);

		if (MODE_BURST.equals(jobType)) {

			AbstractBurster burster = null;

			if (extension.equalsIgnoreCase("pdf"))
				burster = new PdfBurster(configurationFilePath);
			else
				burster = new PoiExcelBurster(configurationFilePath);

			burster.setJobType(MODE_BURST);

			return burster;

		} else {

			AbstractReporter reporter = null;

			switch (jobType) {
			case "ds.xmlfile":
				reporter = new XmlReporter(configurationFilePath);
				break;
			case "ds.csvfile":
				reporter = new CsvReporter(configurationFilePath);
				break;
			case "ds.tsvfile":
				reporter = new CsvReporter(configurationFilePath);
				break;
			case "ds.excelfile":
				reporter = new ExcelReporter(configurationFilePath);
				break;
			case "ds.sqlquery":
				// System.out.println("Processing database connection");
				reporter = new SqlReporter(configurationFilePath);
				break;
			case "ds.scriptfile":
			case "ds.dashboard":
				// System.out.println("Processing database connection");
				reporter = new ScriptedReporter(configurationFilePath);
				break;
			case "ds.jasper":
			case "ds.jasperlegacy":
				// Both are a bare .jrxml that carries its own data; only the engine
				// behind the render differs.
				reporter = new JasperStandaloneReporter(configurationFilePath);
				break;
			case "ds.gsheet":
				// System.out.println("Processing Google Sheet");
				break;
			case "ds.o365sheet":
				// System.out.println("Processing Office 365 Sheet");
				break;
			case "ds.fixedwidthfile":
				reporter = new FixedWidthReporter(configurationFilePath);
				break;
			default:
				// System.out.println("Unknown data source type");
				break;
			}

			reporter.setJobType(jobType);

			return reporter;
		}

	}
}
