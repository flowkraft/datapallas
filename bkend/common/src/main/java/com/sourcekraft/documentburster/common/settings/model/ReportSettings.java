/*
    DocumentBurster is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    DocumentBurster is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with DocumentBurster.  If not, see <http://www.gnu.org/licenses/>
 */
package com.sourcekraft.documentburster.common.settings.model;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import com.sourcekraft.documentburster.utils.DumpToString;

public class ReportSettings extends DumpToString {

	/**
	 * 
	 */
	private static final long serialVersionUID = -6958891508875181693L;

	public DataSource datasource;
	public Template template;

	public static class DataSource extends DumpToString {

		/**
		 * 
		 */
		private static final long serialVersionUID = -989054855315988479L;
		public String type;
		public String parser;
		public boolean showmoreoptions;

		// public String parametersspecpath;

		public XmlOptions xmloptions;
		
		public CSVOptions csvoptions;
		public FixedWidthOptions fixedwidthoptions;

		// Add these fields to the DataSource class
		public ExcelOptions exceloptions;

		public SQLOptions sqloptions;
		public ScriptOptions scriptoptions;
		public String scriptnameparamsspec = "";

		public boolean showadditionaltransformation = false; // Just one flag
		public String scriptnameadditionaltransformation = "";

		public static class SQLOptions extends DumpToString {
			private static final long serialVersionUID = 2691588813086554915L;

			public String conncode = "";
			public String query = "";
			public String scriptname = "";
			// public String querypath = "";
			public String idcolumn = "notused";
		}

		public static class ScriptOptions extends DumpToString {
			private static final long serialVersionUID = 2691588813086554916L;

			public String conncode = "";
			public String scriptname = "";
			public String idcolumn = "notused";
			public String selectfileexplorer = "notused";
		}

		public static class XmlOptions extends DumpToString {
			private static final long serialVersionUID = 2691588813086554916L;

			/** XPath to select the repeating node (e.g. /root/records/record) */
			public String repeatingnodexpath = "";

			/** Name or XPath of the ID column/attribute (relative or absolute) */
			public String idcolumn = "notused";

			/** Whether to use namespace-aware parsing */
			public String namespacemappings = "";

			/** Character encoding for the XML file */
			public String encoding = "UTF-8";

			/** Optional: XSD schema path for validation */
			public String validationschema = "";

			/**
			 * Optional: Map XML fields to report columns (comma-separated, e.g.
			 * "name:fullName,amount:total")
			 */
			public String fieldmappings = "";

			/** Optional: Trim whitespace from text content */
			public boolean ignoreleadingwhitespace = true;
		}

		public static class CSVOptions extends DumpToString {

			private static final long serialVersionUID = 2691588813086554914L;

			// Default values based on reporting.xml
			public String separatorchar = ",";
			public String quotationchar = "\"";
			public String escapechar = "\\";

			public boolean strictquotations = false;
			public boolean ignorequotations = false;
			public boolean ignoreleadingwhitespace = true; // Updated to match XML

			public String header = "noheader"; // Updated to match XML
			public int skiplines = 0;

			public String idcolumn = "notused"; // Updated to match XML (no hyphen)

			public LinesRegExValidator linesregexvalidator = new LinesRegExValidator();

			static class LinesRegExValidator extends DumpToString {
				/**
				 * 
				 */
				private static final long serialVersionUID = 4303178532924813244L;

				static class LineMatcher extends DumpToString {
					/**
					 * 
					 */
					private static final long serialVersionUID = -3495825773742591476L;

					public int index;
					public String expressionpattern;
				}

				public List<LineMatcher> linematcher = new ArrayList<LineMatcher>();;
			}

		}

		public static class FixedWidthOptions extends DumpToString {

			private static final long serialVersionUID = 2691588813086554914L;

			public String columns = "";
			public String header = "noheader"; // Updated to match XML
			public int skiplines = 0;
			public boolean ignoreleadingwhitespace = true; // Updated to match XML

			public String idcolumn = "notused"; // Updated to match XML (no hyphen)

		}

		public static class ExcelOptions extends DumpToString {
			private static final long serialVersionUID = 2691588813086554914L;

			// Initialize with values from reporting.xml
			public String header = "noheader"; // Updated to match XML
			public int skiplines = 0;
			public boolean ignoreleadingwhitespace = true;
			public String idcolumn = "notused"; // Updated to match XML (no hyphen)
			public int sheetindex = 0;
			public boolean useformularesults = true;
		}
	}

	public static class Template extends DumpToString {

		/**
		 * 
		 */
		private static final long serialVersionUID = 8368806508871014150L;

		public String outputtype;
		public String documentpath;

		public String retrieveTemplateFilePath() {
			// On Linux a real absolute path also starts with "/" - keep it when it points to an existing
			// file. On Windows "/templates/..." is never absolute, so the stripping below is unchanged.
			File templateFile = new File(documentpath);
			if (templateFile.isAbsolute() && templateFile.exists())
				return documentpath;
			if (documentpath.startsWith("/") || documentpath.startsWith("\\"))
				return documentpath.substring(1);
			else
				// paths like
				// "src/main/external-resources/template/samples/reports/payslips/payslips-template.docx"
				return documentpath;
		}

	}

}