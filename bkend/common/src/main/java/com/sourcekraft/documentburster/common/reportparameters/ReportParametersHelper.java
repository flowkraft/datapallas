package com.sourcekraft.documentburster.common.reportparameters;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import org.codehaus.groovy.control.CompilerConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

public class ReportParametersHelper {

	private static final Logger log = LoggerFactory.getLogger(ReportParametersHelper.class);

	private static final Set<String> JASPER_SYSTEM_PARAMS = Set.of("JASPER_REPORTS_CONTEXT", "REPORT_CONNECTION",
			"REPORT_DATA_SOURCE", "REPORT_LOCALE", "REPORT_TIME_ZONE", "REPORT_VIRTUALIZER", "REPORT_CLASS_LOADER",
			"REPORT_URL_HANDLER_FACTORY", "REPORT_FILE_RESOLVER", "REPORT_FORMAT_FACTORY", "REPORT_PARAMETERS_MAP",
			"REPORT_SCRIPTLET", "IS_IGNORE_PAGINATION", "REPORT_MAX_COUNT", "REPORT_TEMPLATES", "SORT_FIELDS",
			"FILTER");

	public static List<ReportParameter> parseJrxmlParameters(String jrxmlContent) {
		List<ReportParameter> params = new ArrayList<>();
		try {
			DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
			factory.setNamespaceAware(false);
			// Classic JRXML of the JasperReports 1.x/2.x era starts with
			// <!DOCTYPE jasperReport PUBLIC "-//JasperReports//DTD Report Design//EN" "...jasperreport.dtd">.
			// Rejecting every DOCTYPE left those reports without a parameter form. The DOCTYPE is
			// accepted, but nothing is ever loaded from outside the file (no DTD download, no
			// external entities, no XInclude) and the JDK's secure-processing limits apply.
			factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
			factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
			factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
			factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
			factory.setXIncludeAware(false);
			factory.setExpandEntityReferences(false);
			DocumentBuilder builder = factory.newDocumentBuilder();
			Document doc = builder.parse(new ByteArrayInputStream(jrxmlContent.getBytes(StandardCharsets.UTF_8)));

			NodeList paramNodes = doc.getElementsByTagName("parameter");
			for (int i = 0; i < paramNodes.getLength(); i++) {
				Element paramEl = (Element) paramNodes.item(i);

				String name = paramEl.getAttribute("name");
				String className = paramEl.getAttribute("class");
				if (className == null || className.isEmpty()) {
					className = "java.lang.String";
				}

				// Skip system parameters
				if (JASPER_SYSTEM_PARAMS.contains(name) || name.startsWith("NET_SF_JASPERREPORTS_")) {
					continue;
				}

				// Skip parameters marked as not for prompting (prompting is the default). Classic
				// JRXML (JasperReports 6 and earlier) writes isForPrompting="false"; JasperReports 7
				// renamed the attribute to forPrompting="false". Missing the new name put
				// SUBREPORT_DIR into the form, and its default text then overrode the report folder.
				if ("false".equalsIgnoreCase(paramEl.getAttribute("isForPrompting"))
						|| "false".equalsIgnoreCase(paramEl.getAttribute("forPrompting"))) {
					continue;
				}

				ReportParameter rp = new ReportParameter();
				rp.id = name;
				rp.label = name;
				rp.type = mapJavaClassToParamType(className);

				// Extract default value from <defaultValueExpression>
				NodeList defaultExpNodes = paramEl.getElementsByTagName("defaultValueExpression");
				if (defaultExpNodes.getLength() > 0) {
					String defaultText = defaultExpNodes.item(0).getTextContent();
					if (defaultText != null) {
						rp.defaultValue = defaultText.trim();
					}
				}

				// Extract description from <parameterDescription>
				NodeList descNodes = paramEl.getElementsByTagName("parameterDescription");
				if (descNodes.getLength() > 0) {
					String desc = descNodes.item(0).getTextContent();
					if (desc != null && !desc.isBlank()) {
						rp.label = desc.trim();
					}
				}

				params.add(rp);
			}
		} catch (Exception e) {
			log.warn("Failed to parse .jrxml parameters via XML parser, returning empty list", e);
		}
		return params;
	}

	private static String mapJavaClassToParamType(String className) {
		if (className == null)
			return "String";
		switch (className) {
			case "java.lang.Integer":
			case "java.lang.Long":
			case "java.lang.Short":
				return "Integer";
			case "java.lang.Double":
			case "java.lang.Float":
			case "java.math.BigDecimal":
				return "Double";
			case "java.lang.Boolean":
				return "Boolean";
			case "java.util.Date":
			case "java.sql.Date":
				return "Date";
			case "java.sql.Timestamp":
				return "Timestamp";
			default:
				return "String";
		}
	}

	public static List<ReportParameter> parseGroovyParametersDslCode(String groovyParametersDslCode) throws Exception {

		// 2) set up binding (if you still want to expose reportParametersProvided,
		// etc.)
		Binding binding = new Binding();
		binding.setVariable("reportParametersProvided", false);

		// 3) configure GroovyShell to use our ReportParametersScript as base class
		CompilerConfiguration config = new CompilerConfiguration();
		config.setScriptBaseClass(ReportParametersScript.class.getName());

		// 4) parse + run
		// Pass the script base class's classloader as parent. Without this, under Spring Boot
		// DevTools the compiled Script1 extends a ReportParametersScript loaded by GroovyShell's
		// classloader while the cast target is loaded by RestartClassLoader → ClassCastException.
		GroovyShell shell = new GroovyShell(ReportParametersScript.class.getClassLoader(), binding, config);
		ReportParametersScript script = (ReportParametersScript) shell.parse(groovyParametersDslCode);
		script.setBinding(binding);
		script.run();

		List<Map<String, Object>> paramsMetadataList = script.getParamsMetadataList();
		List<ReportParameter> reportParameters = new ArrayList<>();

		//System.out.println("groovyParametersDslCode: " + groovyParametersDslCode.substring(0, 100));
		//System.out.println("paramsMetadataList: " + paramsMetadataList.size());

		if (paramsMetadataList != null) {
			for (Map<String, Object> paramMap : paramsMetadataList) {
				ReportParameter rp = new ReportParameter();

				// top-level properties
				rp.id = (String) paramMap.get("id");
				rp.label = (String) paramMap.get("label");
				Object t = paramMap.get("type");
				rp.type = t instanceof Class ? ((Class<?>) t).getSimpleName() : String.valueOf(t);
				rp.description = (String) paramMap.get("description");
				Object defVal = paramMap.get("defaultValue");
				rp.defaultValue = defVal != null ? String.valueOf(defVal) : null;

				Map<String, Object> constraints = (Map<String, Object>) paramMap.getOrDefault("constraints",
						Collections.emptyMap());
				Map<String, Object> uiHints = (Map<String, Object>) paramMap.getOrDefault("ui", Collections.emptyMap());

				// shove the maps straight onto the model
				rp.constraints.putAll(constraints);
				rp.uiHints.putAll(uiHints);

				// finally add to your config
				reportParameters.add(rp);
			}
		}

		return reportParameters;

	}
}
