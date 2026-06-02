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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;
import com.sourcekraft.documentburster.utils.DumpToString;

public class ConfigurationFileInfo extends DumpToString {

	public String fileName;
	public String filePath;
	public String relativeFilePath;
	public String templateName;
	public boolean isFallback;
	public boolean capReportDistribution;
	public boolean capReportGenerationMailMerge;
	public String dsInputType;
	public String notes;
	public String folderName;
	public String type;
	public boolean activeClicked;
	public boolean useEmlConn;
	public String emlConnCode;

	// For SQL/Script reports (dsInputType ds.db / ds.script): the DB connection code
	public boolean useDbConn;
	public String dbConnCode;

	public String scriptOptionsSelectFileExplorer;

	// For JasperReports: the DB connection code to use (from datasource.properties or default)
	public String dbConnectionCode;

	// For JasperReports: path to the .jrxml file (separate from filePath which points to settings.xml)
	public String jrxmlFilePath;

	public List<ReportParameter> reportParameters = new ArrayList<>();
	
	// Parsed Tabulator DSL options — flat map matching tabulator.info constructor options
	public Map<String, Object> tabulatorOptions;
	
	// Parsed Chart DSL options (type, labelField, options, labels, datasets, data)
	public Map<String, Object> chartOptions;
	
	// Parsed Pivot Table DSL options (rows, cols, vals, aggregatorName, rendererName, etc.)
	public Map<String, Object> pivotTableOptions;

}
