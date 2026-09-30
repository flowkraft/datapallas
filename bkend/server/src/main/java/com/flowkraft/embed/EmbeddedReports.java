package com.flowkraft.embed;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.flowkraft.reporting.services.ReportingService;

/**
 * Which other dashboards a dashboard's published page puts on the screen.
 *
 * <h2>Why this exists</h2>
 * A gallery page is one published dashboard whose template is mostly other dashboards: twenty-five
 * {@code <rb-dashboard report-id="…">} tags. A share link or an embed token opens one report, so
 * without this the page would render and every tile inside it would be refused - the half-rendered
 * screen the embed design exists to prevent. The list this returns is what widens a credential, by
 * one rule and in one place: {@code EmbedTokenAuthorizationManager.admits}.
 *
 * <h2>Read once, when the credential is made</h2>
 * It is called while a link or a token is created, never while a request is served. That is what
 * makes what a link opens fixed for its life: editing the page afterwards cannot widen a link
 * somebody already has, and a request cannot talk the server into reading a template again. It also
 * keeps the authorisation decision free of disk reads.
 *
 * <h2>One level</h2>
 * An embedded dashboard's own template is never read. A page therefore cannot reach a third
 * dashboard through a second one, and a template that embeds itself - or two that embed each other -
 * is not a loop this can fall into.
 *
 * <p>The template read is the same file {@code /api/reports/<id>/config} serves, through the same
 * {@link ReportingService} call, so there is no second reader to disagree with it. Anything that
 * fails - no such report, no template, unreadable - is an empty list: a credential that opens
 * exactly its own report, which is what every credential did before this existed.
 */
@Component
public class EmbeddedReports {

	private static final Logger log = LoggerFactory.getLogger(EmbeddedReports.class);

	/**
	 * A dashboard or a report tag, with its attributes. Deliberately a regex and not an HTML parser:
	 * the answer is only ever used to <em>widen</em> a credential, and a tag spelled in a way this
	 * misses costs a tile that asks the viewer to sign in, while a parser dragged in for it would be a
	 * new dependency on the authorisation path.
	 */
	private static final Pattern WIDGET_TAG = Pattern.compile("<rb-(?:dashboard|report)\\b([^>]*)>",
			Pattern.CASE_INSENSITIVE);

	private static final Pattern REPORT_ID_ATTRIBUTE = Pattern
			.compile("report-id\\s*=\\s*([\"'])(.*?)\\1", Pattern.CASE_INSENSITIVE);

	private static final ObjectMapper MAPPER = new ObjectMapper();

	@Autowired
	private ReportingService reportingService;

	/**
	 * @return the report ids of the {@code <rb-dashboard>} and {@code <rb-report>} tags in this
	 *         report's published template: in the order the page lists them, each one once, never
	 *         including {@code reportId} itself, and empty whenever the template cannot be read or
	 *         embeds nothing
	 */
	public List<String> of(String reportId) {

		if (StringUtils.isBlank(reportId))
			return List.of();

		String template;
		try {
			template = reportingService.loadReportConfig(reportId).dashboardTemplate;
		} catch (Exception e) {
			// A report whose template cannot be read is a report that embeds nothing: the credential
			// then opens what it always opened, and no tile of somebody else's data is admitted by a
			// failure.
			log.debug("Could not read the template of report '{}'; it embeds nothing", reportId);
			return List.of();
		}

		return inTemplate(template, reportId);
	}

	/**
	 * The same answer for a template already in hand, so a caller that has just read one does not read
	 * it twice.
	 */
	public List<String> inTemplate(String template, String ownReportId) {

		if (StringUtils.isBlank(template))
			return List.of();

		List<String> embedded = new ArrayList<>();

		Matcher tag = WIDGET_TAG.matcher(template);
		while (tag.find()) {

			Matcher attribute = REPORT_ID_ATTRIBUTE.matcher(tag.group(1));
			if (!attribute.find())
				continue;

			String embeddedId = attribute.group(2).trim();

			if (StringUtils.isBlank(embeddedId) || embeddedId.equals(ownReportId) || embedded.contains(embeddedId))
				continue;

			embedded.add(embeddedId);
		}

		return List.copyOf(embedded);
	}

	// ============================================================
	// how the list travels: JSON, in share_token.embedded_reports
	// ============================================================

	/** @return the column value for a stored link, or null for a link that embeds nothing */
	public static String toJson(List<String> embeddedReports) {

		if (embeddedReports == null || embeddedReports.isEmpty())
			return null;

		try {
			return MAPPER.writeValueAsString(embeddedReports);
		} catch (Exception e) {
			// A list that cannot be written is stored as none: the link opens its own report, which is
			// narrower than what was asked for and never wider.
			log.error("Could not store the embedded reports of a share link", e);
			return null;
		}
	}

	/**
	 * @return what a stored link embeds, empty for a link created before the column existed, for a
	 *         link that embeds nothing, and for a value that cannot be read - all of which mean a link
	 *         that opens exactly its own report
	 */
	public static List<String> fromJson(String json) {

		if (StringUtils.isBlank(json))
			return List.of();

		try {
			return List.copyOf(MAPPER.readValue(json, new TypeReference<ArrayList<String>>() {
			}));
		} catch (Exception e) {
			log.error("Could not read the embedded reports of a share link", e);
			return List.of();
		}
	}
}
