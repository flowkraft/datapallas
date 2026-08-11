package com.sourcekraft.documentburster.utils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import fr.opensagres.xdocreport.document.discovery.ITemplateEngineInitializerDiscovery;
import fr.opensagres.xdocreport.template.ITemplateEngine;
import fr.opensagres.xdocreport.template.TemplateEngineKind;
import fr.opensagres.xdocreport.template.freemarker.FreemarkerTemplateEngine;
import freemarker.core.TemplateClassResolver;
import freemarker.template.Configuration;
import freemarker.template.TemplateExceptionHandler;

import org.apache.commons.lang3.StringUtils;

import java.util.Locale;
import java.util.TimeZone;

/**
 * Single place that:
 * - holds the shared FreeMarker Configuration (FREE_MARKER_CFG)
 * - provides configureFreeMarker(...) to populate it from your settings
 * - acts as XDocReport SPI initializer (apply conservative defaults)
 * - exposes applySettingsTo(...) to copy settings into a XDocReport engine on-demand
 */
public class DocumentBursterFreemarkerInitializer implements ITemplateEngineInitializerDiscovery {

    private static final Logger log = LoggerFactory.getLogger(DocumentBursterFreemarkerInitializer.class);

    // single shared Configuration used by your app and copied into XDocReport when needed
    public static final Configuration FREE_MARKER_CFG = new Configuration(Configuration.VERSION_2_3_29);

    static {
        harden(FREE_MARKER_CFG);
    }

    /**
     * Report templates are authored by users, so a template is executable content, not data.
     * Without a class resolver FreeMarker's default one lets a template instantiate any class
     * on the classpath — {@code ${"freemarker.template.utility.Execute"?new()("...")}} is a
     * shell out of a .ftl. SAFER_RESOLVER blocks exactly the three classes that turn template
     * rendering into code execution (Execute, ObjectConstructor, JythonRuntime) and leaves
     * everything a real template needs untouched.
     */
    private static void harden(Configuration cfg) {
        cfg.setNewBuiltinClassResolver(TemplateClassResolver.SAFER_RESOLVER);
    }

    // conservative defaults used if XDocReport initializes before your settings are loaded
    private static final Locale DEFAULT_LOCALE = Locale.US;
    private static final String DEFAULT_NUMBER_FORMAT = "0.######";
    private static final String DEFAULT_DATE_FORMAT = "MM/dd/yyyy";
    private static final String DEFAULT_TIME_FORMAT = "HH:mm:ss";
    private static final String DEFAULT_DATETIME_FORMAT = "MM/dd/yyyy HH:mm:ss";
    private static final String DEFAULT_TIMEZONE = "UTC";

    // ========== Utility to configure the shared FREE_MARKER_CFG ==========

    public static void configureFreeMarker(
            com.sourcekraft.documentburster.common.settings.model.Locale localeSettings,
            com.sourcekraft.documentburster.common.settings.model.FreeMarkerSettings fmSettings) {

        // build Java Locale
        Locale javaLocale;
        if (localeSettings == null) {
            javaLocale = DEFAULT_LOCALE;
        } else {
            String language = localeSettings.language;
            String country = localeSettings.country;
            if (StringUtils.isBlank(language)) {
                log.warn("No language specified in locale, defaulting to {}", DEFAULT_LOCALE);
                javaLocale = DEFAULT_LOCALE;
            } else if (StringUtils.isBlank(country)) {
                javaLocale = new Locale.Builder().setLanguage(language).build();
            } else {
                javaLocale = new Locale.Builder().setLanguage(language).setRegion(country).build();
            }
        }
        FREE_MARKER_CFG.setLocale(javaLocale);
        
        FREE_MARKER_CFG.setDefaultEncoding("UTF-8");
        FREE_MARKER_CFG.setOutputEncoding("UTF-8");

        // apply formats if present, otherwise keep existing/free defaults
        if (fmSettings != null) {
            if (StringUtils.isNotBlank(fmSettings.dateformat)) {
                FREE_MARKER_CFG.setDateFormat(fmSettings.dateformat);
            } else {
                FREE_MARKER_CFG.setDateFormat(DEFAULT_DATE_FORMAT);
            }
            if (StringUtils.isNotBlank(fmSettings.timeformat)) {
                FREE_MARKER_CFG.setTimeFormat(fmSettings.timeformat);
            } else {
                FREE_MARKER_CFG.setTimeFormat(DEFAULT_TIME_FORMAT);
            }
            if (StringUtils.isNotBlank(fmSettings.datetimeformat)) {
                FREE_MARKER_CFG.setDateTimeFormat(fmSettings.datetimeformat);
            } else {
                FREE_MARKER_CFG.setDateTimeFormat(DEFAULT_DATETIME_FORMAT);
            }
            if (StringUtils.isNotBlank(fmSettings.numberformat)) {
                FREE_MARKER_CFG.setNumberFormat(fmSettings.numberformat);
            } else {
                FREE_MARKER_CFG.setNumberFormat(DEFAULT_NUMBER_FORMAT);
            }
            if (StringUtils.isNotBlank(fmSettings.timezone)) {
                FREE_MARKER_CFG.setTimeZone(TimeZone.getTimeZone(fmSettings.timezone));
            } else {
                FREE_MARKER_CFG.setTimeZone(TimeZone.getTimeZone(DEFAULT_TIMEZONE));
            }
        } else {
            // set conservative defaults if no fmSettings provided
            FREE_MARKER_CFG.setDateFormat(DEFAULT_DATE_FORMAT);
            FREE_MARKER_CFG.setTimeFormat(DEFAULT_TIME_FORMAT);
            FREE_MARKER_CFG.setDateTimeFormat(DEFAULT_DATETIME_FORMAT);
            FREE_MARKER_CFG.setNumberFormat(DEFAULT_NUMBER_FORMAT);
            FREE_MARKER_CFG.setTimeZone(TimeZone.getTimeZone(DEFAULT_TIMEZONE));
        }

        log.debug("Configured FREE_MARKER_CFG: locale={}, timezone={}, date={}, time={}, datetime={}, number={}",
                FREE_MARKER_CFG.getLocale(),
                FREE_MARKER_CFG.getTimeZone(),
                FREE_MARKER_CFG.getDateFormat(),
                FREE_MARKER_CFG.getTimeFormat(),
                FREE_MARKER_CFG.getDateTimeFormat(),
                FREE_MARKER_CFG.getNumberFormat());
    }

    // ========== SPI initializer (called automatically by XDocReport if on classpath) ==========
    @Override
    public String getId() {
        return DocumentBursterFreemarkerInitializer.class.getName();
    }

    @Override
    public String getDescription() {
        return "DocumentBurster FreeMarker SPI initializer (applies conservative defaults)";
    }

    @Override
    public String getDocumentKind() {
        return null;
    }

    @Override
    public void initialize(ITemplateEngine templateEngine) {
        // only handle FreeMarker engine kinds
        if (!TemplateEngineKind.Freemarker.name().equals(templateEngine.getKind())) {
            return;
        }
        try {
            FreemarkerTemplateEngine fmEngine = (FreemarkerTemplateEngine) templateEngine;
            Configuration cfg = fmEngine.getFreemarkerConfiguration();

            harden(cfg);

            // apply conservative defaults so XDocReport behaves reasonably if it initializes early
            cfg.setDefaultEncoding("UTF-8");
            cfg.setOutputEncoding("UTF-8"); 

            cfg.setLocale(DEFAULT_LOCALE);
            cfg.setNumberFormat(DEFAULT_NUMBER_FORMAT);
            cfg.setDateFormat(DEFAULT_DATE_FORMAT);
            cfg.setTimeFormat(DEFAULT_TIME_FORMAT);
            cfg.setDateTimeFormat(DEFAULT_DATETIME_FORMAT);
            cfg.setTimeZone(TimeZone.getTimeZone(DEFAULT_TIMEZONE));

            log.debug("XDocReport FreeMarker initialized with conservative defaults (SPI).");
        } catch (Throwable t) {
            log.warn("Could not apply default FreeMarker settings in SPI initialize(): {}", t.toString());
        }
    }

    // ========== Controlled override: call this after you've called configureFreeMarker(...) ==========
    public static void applySettingsTo(ITemplateEngine templateEngine) {
        if (templateEngine == null) return;
        try {
            FreemarkerTemplateEngine fmEngine = (FreemarkerTemplateEngine) templateEngine;
            Configuration cfg = fmEngine.getFreemarkerConfiguration();

            harden(cfg);

            // copy values from shared FREE_MARKER_CFG into the XDocReport engine
            if (FREE_MARKER_CFG.getLocale() != null) cfg.setLocale(FREE_MARKER_CFG.getLocale());
            if (FREE_MARKER_CFG.getNumberFormat() != null) cfg.setNumberFormat(FREE_MARKER_CFG.getNumberFormat());
            if (FREE_MARKER_CFG.getDateFormat() != null) cfg.setDateFormat(FREE_MARKER_CFG.getDateFormat());
            if (FREE_MARKER_CFG.getTimeFormat() != null) cfg.setTimeFormat(FREE_MARKER_CFG.getTimeFormat());
            if (FREE_MARKER_CFG.getDateTimeFormat() != null)
                cfg.setDateTimeFormat(FREE_MARKER_CFG.getDateTimeFormat());
            TemplateExceptionHandler teh = FREE_MARKER_CFG.getTemplateExceptionHandler();
            if (teh != null) cfg.setTemplateExceptionHandler(teh);

            log.debug("Applied FREE_MARKER_CFG into XDocReport FreemarkerTemplateEngine (controlled).");
        } catch (ClassCastException e) {
            log.warn("applySettingsTo: templateEngine is not FreemarkerTemplateEngine: {}", e.toString());
        } catch (Throwable t) {
            log.warn("applySettingsTo failed: {}", t.toString());
        }
    }
}