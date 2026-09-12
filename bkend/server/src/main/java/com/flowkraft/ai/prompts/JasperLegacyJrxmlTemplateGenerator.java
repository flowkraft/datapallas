package com.flowkraft.ai.prompts;

import java.util.List;

/**
 * Generates classic JRXML — the schema JasperReports used from 1.x through 6.21.
 * Kept separate from {@link JasperJrxmlTemplateGenerator} because JasperReports 7
 * replaced the file format outright: the two are not dialects of one language,
 * and a template written in either is rejected by the other engine.
 */
public final class JasperLegacyJrxmlTemplateGenerator {

    private JasperLegacyJrxmlTemplateGenerator() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "JASPER_LEGACY_JRXML_TEMPLATE_GENERATOR",
            "Generate Legacy JasperReports (.jrxml) Template",
            "Generates a complete classic .jrxml template for JasperReports 6.21 and earlier, based on user requirements.",
            List.of("jasper", "jrxml", "template", "legacy"),
            "JasperReports Legacy (.jrxml) Generation",
            """
THIS IS FOR THE LEGACY JASPERREPORTS FORMAT, USED BY EVERY VERSION FROM 1.x UP TO AND INCLUDING 6.21 — PRIOR TO VERSION 7.0.
That one schema covers roughly 2000 to 2023: Jaspersoft Studio 6.x and earlier, and everything exported from JasperReports Server. JasperReports 7.0 replaced the format, so a template in this format is rejected by the 7.x engine and a 7.x template is rejected by the engine this one targets. If the request is about a template for JasperReports 7.0 or later, stop and say the standard JasperReports generator is the right tool.

Write a CLASSIC JasperReports .jrxml. Return only the complete .jrxml code — no partial snippets or explanations.

<REQUIREMENT>
[INSERT USER'S NATURAL LANGUAGE DESCRIPTION OF THE REPORT HERE]
</REQUIREMENT>

THIS IS NOT THE JASPERREPORTS 7 FORMAT. Do not use the Jackson-based syntax.
- Use <staticText>, <textField>, <image>, <line>, <rectangle> as band children — NOT <element kind="...">.
- Every element carries a nested <reportElement x= y= width= height=/>.
- Text comes from <text><![CDATA[...]]></text>; expressions from <textFieldExpression class="java.lang.String"><![CDATA[...]]></textFieldExpression>.
- Bands are <title><band height="..."> ... </band></title>, likewise <pageHeader>, <columnHeader>, <detail>, <columnFooter>, <pageFooter>, <summary>.
- Charts use the classic <pieChart>/<barChart>/<lineChart> elements with <chart>, dataset and plot children.
- Barcodes use <componentElement> with the components namespace, e.g. <c:Code128>.

REQUIRED ROOT ELEMENT — reproduce this exactly, changing only name and page geometry:
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:schemaLocation="http://jasperreports.sourceforge.net/jasperreports http://jasperreports.sourceforge.net/xsd/jasperreport.xsd"
              name="my_report" pageWidth="595" pageHeight="842" columnWidth="515"
              leftMargin="40" rightMargin="40" topMargin="40" bottomMargin="40">

DATA MODEL:
A companion script (Groovy or SQL) prepares the data. The data source is JRMapCollectionDataSource — flat rows from a Map (no JDBC).
- Declare every field as <field name="..." class="java.lang.Object"/>.
- SIMPLE REPORTS (one row = one document): put the whole layout in the title band; it can read fields from the single row.
- MULTI-ROW / MASTER-DETAIL REPORTS: the data arrives pre-flattened (master fields repeated on every child row). A companion script can append "virtual rows" for totals and footers carrying a row_type field; route them with printWhenExpression inside ONE detail band.

RULES THAT HOLD FOR THIS ENGINE:
- Fields are NULL outside the primary detail band. Do not display field values from the summary band, column footer, last page footer or a group footer.
- Do not wrap conditional elements in a <frame> with printWhenExpression — fields inside the frame read as null. Put each element directly in the band with its own printWhenExpression.
- Every element must fit inside its band's declared height, and band heights must fit within pageHeight minus topMargin minus bottomMargin, or compilation fails.
- Object fields need coercion in expressions: write "" + $F{amount} rather than relying on the declared type.
- Fonts: use SansSerif, Serif or Monospaced, or DejaVu Sans. Do not name a font that may not exist on the rendering machine.
- Subreports are loaded as compiled .jasper files, not .jrxml. Prefer a single file unless the requirement demands otherwise.

Available data columns:
[INSERT COLUMN NAMES HERE]

Sample data (first rows):
[INSERT SAMPLE DATA HERE]

Script which generated the data:
[INSERT SCRIPT HERE]"""
        );
    }
}
