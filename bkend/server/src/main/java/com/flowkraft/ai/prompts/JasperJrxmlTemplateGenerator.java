package com.flowkraft.ai.prompts;

import java.util.List;

public final class JasperJrxmlTemplateGenerator {

    private JasperJrxmlTemplateGenerator() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "JASPER_JRXML_TEMPLATE_GENERATOR",
            "Generate JasperReports (.jrxml) Template",
            "Generates a complete .jrxml template for JasperReports, based on user requirements.",
            List.of("jasper", "jrxml", "template"),
            "JasperReports (.jrxml) Generation",
            """
THIS IS FOR THE NEW JASPERREPORTS FORMAT, INTRODUCED IN VERSION 7.0 AND USED BY EVERY RELEASE FROM 7.0 ONWARDS.
JasperReports 7.0 replaced the .jrxml file format outright. Templates in this format are rejected by JasperReports 6.21 and earlier, and templates in the older format are rejected by the engine this one targets. If the request is about a template written for JasperReports 6.21 or earlier, stop and say the Legacy JasperReports generator is the right tool.

Write a JasperReports 7.0+ .jrxml (Jackson-based XML format). Return only the complete .jrxml code — no partial snippets or explanations.

<REQUIREMENT>
[INSERT USER'S NATURAL LANGUAGE DESCRIPTION OF THE REPORT HERE]
</REQUIREMENT>

DATA MODEL:
A companion script (Groovy or SQL) prepares the data. Data source is JRMapCollectionDataSource — flat rows from a Map (no JDBC).
- All fields must be declared as java.lang.Object.
- SIMPLE REPORTS (one row = one document): all data is directly available on the single row. Use the title band for the full layout — it can access fields from the first (and only) row.
- MULTI-ROW / MASTER-DETAIL REPORTS: data is pre-flattened (master fields duplicated on every child row). A companion script can add separate "virtual rows" for totals/footers with a row_type field. The .jrxml uses printWhenExpression on elements to show different layouts per row_type — all within a SINGLE detail band.

FORMAT RULES (JR 7.0.x / Jackson XML):
- Do NOT add xmlns or xsi:schemaLocation on <jasperReport> — JR7 does not use them.
- Do NOT use expressionBackcolor (unsupported in 7.0.x). For alternating row colors use two overlapping rectangles with printWhenExpression.
- Do NOT declare a REPORT_CONNECTION parameter.
- No subreports — single file only.
- Band heights must fit within pageHeight minus topMargin minus bottomMargin.
- All elements that go beyond the declared band height cause a compile-time validation error — every element must fit within its band.

CRITICAL JR 7 + JRMapCollectionDataSource RULES:
- Fields are NULL outside the primary detail band. Do NOT use summary band, columnFooter, lastPageFooter, group footer, or second detail bands for displaying field values — they will always be empty.
- Do NOT use <variable> elements (calculation="First", "Nothing", sticky patterns) to carry values into post-detail bands — they also fail with JRMapCollectionDataSource.
- Do NOT wrap conditional elements in a <frame> with printWhenExpression — fields inside the frame will be null. Instead, put each element directly in the band with its own individual printWhenExpression.
- java.lang.Object fields do NOT render as text. Always use string concatenation to force toString(): write `"" + $F{myField}` or `"Label: " + $F{myField}`, never bare `$F{myField}` in a textField expression.
- Only the title band and the detail band can safely access field values. Everything else sees null.

ARCHITECTURE PATTERNS:

Pattern A — SIMPLE REPORT (one row = one document, e.g., a letter, certificate, single-record form):
- Put the entire layout in the title band. All fields are available from the single data row.
- Use the detail band only if you need repeating sections.

Pattern B — MULTI-ROW REPORT with totals (e.g., invoice, order, statement):
- Title band: report header, company logo, bill-to info (fields from first row).
- Single detail band (fixed height, e.g., 24px) with row_type routing:
  1. Normal data rows (row_type == null): line items with product, qty, price, etc.
  2. Totals rows (row_type == "totals_line"): label + value right-aligned in table columns.
  3. Grand total row (row_type == "total_due"): bold label + value with colored background.
  4. Footer row (row_type == "footer"): notes, signatures, thank-you message.
- All within ONE <detail><band> — no summary, no second band, no frames.
- The script emits totals/footer as separate data rows after the line items.

Available data columns:
[INSERT COLUMN NAMES HERE]

Sample data (first rows):
[INSERT SAMPLE DATA HERE]

Script which generated the data:
[INSERT SCRIPT HERE]"""
        );
    }
}
