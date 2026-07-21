package com.sourcekraft.documentburster.utils;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.StringWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URLEncoder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.antlr.stringtemplate.StringTemplate;
import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.hazlewood.connor.bottema.emailaddress.EmailAddressCriteria;
import org.hazlewood.connor.bottema.emailaddress.EmailAddressValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import com.sourcekraft.documentburster.common.settings.model.EmailSettings;
import com.sourcekraft.documentburster.common.settings.model.SmsSettings;
import com.sourcekraft.documentburster.common.settings.model.UploadSettings;
import com.sourcekraft.documentburster.common.settings.model.WebUploadSettings;
import com.sourcekraft.documentburster.context.BurstingContext;
import com.sourcekraft.documentburster.variables.DateRenderer;
import com.sourcekraft.documentburster.variables.Variables;

import freemarker.template.Template;

public class Utils {

	private static Logger log = LoggerFactory.getLogger(Utils.class);

	public static final String SPLIT_2ND_TIME = "split_2nd_time";

	public static final String PDFBURST_WEBSITE = "https://www.pdfburst.com";
	public static final String NULL_STRING_VALUE = "null";
	
	public enum FileSizeUnit {
		BYTE, KILOBYTE, MEGABYTE, GIGABYTE, TERABYTE, PETABYTE, EXABYTE, ZETTABYTE, YOTTABYTE
	};

	public static String getProduct() {

		if ((new File("startServer.bat").exists()) || (new File("startServer.sh").exists()))
			return "DocumentBurster Server";
		else
			return "DocumentBurster";

	}

	public static String getProductPermalink() {

		if ((new File("startServer.bat").exists()) || (new File("startServer.sh").exists()))
			return "documentburster-server";
		else
			return "documentburster";

	}

	public static String getProductName(String version) {
		return "DocumentBurster " + version;
	}

	public static String getFileNameOfBurstDocument(String defaultFileName, String token) {
		if (StringUtils.isNotEmpty(defaultFileName)) {
			return defaultFileName;
		} else {
			return token + ".pdf";
		}
	}

	/**
	 * Resolve a relative path against PORTABLE_EXECUTABLE_DIR or DOCUMENTBURSTER_HOME.
	 * Same lookup order as getTempFolder/getDbFolderPath/getAppsFolderPath.
	 * Absolute paths are returned as-is.
	 */
	public static String resolvePathAgainstPortableDir(String relativePath) {
		if (relativePath == null || relativePath.isEmpty()) return relativePath;
		File f = new File(relativePath);
		if (f.isAbsolute()) return relativePath;
		String portableDir = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		if (StringUtils.isNotBlank(portableDir)) {
			return new File(portableDir, relativePath).toPath().normalize().toAbsolutePath().toString();
		}
		String homeDir = System.getProperty("DOCUMENTBURSTER_HOME");
		if (StringUtils.isNotBlank(homeDir)) {
			return new File(homeDir, relativePath).toPath().normalize().toAbsolutePath().toString();
		}
		return relativePath;
	}

	public static String getTempFolder() {
		String portableDir = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		if (StringUtils.isNotBlank(portableDir)) {
			return new File(portableDir, "temp").getAbsolutePath() + "/";
		}
		String homeDir = System.getProperty("DOCUMENTBURSTER_HOME");
		if (StringUtils.isNotBlank(homeDir)) {
			return new File(homeDir, "temp").getAbsolutePath() + "/";
		}
		return "./temp/";
	}

	public static String getDbFolderPath() {
		String portableDir = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		if (StringUtils.isNotBlank(portableDir)) {
			return new File(portableDir, "db").getAbsolutePath() + "/";
		}
		String homeDir = System.getProperty("DOCUMENTBURSTER_HOME");
		if (StringUtils.isNotBlank(homeDir)) {
			return new File(homeDir, "db").getAbsolutePath() + "/";
		}
		return resolvePathAgainstPortableDir("db") + "/";
	}

	public static String getAppsFolderPath() {
		String portableDir = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		if (StringUtils.isNotBlank(portableDir)) {
			return new File(portableDir, "_apps").getAbsolutePath() + "/";
		}
		String homeDir = System.getProperty("DOCUMENTBURSTER_HOME");
		if (StringUtils.isNotBlank(homeDir)) {
			return new File(homeDir, "_apps").getAbsolutePath() + "/";
		}
		return resolvePathAgainstPortableDir("_apps") + "/";
	}

	/**
	 * Every directory that holds a <code>_custom</code> app definition (app.json + app-seed.groovy).
	 * A directory qualifies ONLY if it contains a <code>_custom/</code> folder — so <code>_examples</code>
	 * itself (a container, not an app) is never mistaken for one. Custom apps live under a single home,
	 * <code>_apps/flowkraft/xx-custom/</code>, scanned one level deep at two roots:
	 * <ul>
	 *   <li><code>_apps/flowkraft/xx-custom/&lt;id&gt;</code> — a user's own apps</li>
	 *   <li><code>_apps/flowkraft/xx-custom/_examples/&lt;id&gt;</code> — the FlowKraft-shipped examples</li>
	 * </ul>
	 * The examples sit one level deeper than user apps, so the two roots are scanned separately; one
	 * does not subsume the other. Order is meaningful and deliberate: the FlowKraft-shipped examples
	 * come first, the user's own apps last, each group sorted by folder name — the Seed-Data dropdown
	 * lists examples above a separator and the user's own apps below it. The discovery scans
	 * (SystemService manifests, GenericSeedExecutor Seed-Data templates) key off this list.
	 */
	public static java.util.List<File> getCustomAppDirs() {
		File customHome = new File(getAppsFolderPath(), "flowkraft/xx-custom");
		java.util.List<File> examples = new java.util.ArrayList<>();
		addCustomAppDirs(examples, new File(customHome, "_examples")); // the FlowKraft-shipped examples
		examples.sort(java.util.Comparator.comparing(File::getName));
		java.util.List<File> userApps = new java.util.ArrayList<>();
		addCustomAppDirs(userApps, customHome);                        // the user's own custom apps
		userApps.sort(java.util.Comparator.comparing(File::getName));
		java.util.List<File> dirs = new java.util.ArrayList<>(examples);
		dirs.addAll(userApps);
		return dirs;
	}

	/** True if {@code appDir} is a FlowKraft-shipped example (lives in the {@code _examples/} folder). */
	public static boolean isExampleAppDir(File appDir) {
		File parent = appDir == null ? null : appDir.getParentFile();
		return parent != null && "_examples".equals(parent.getName());
	}

	/** Add each direct child of {@code parent} that is a custom app (i.e. has a {@code _custom/} folder). */
	private static void addCustomAppDirs(java.util.List<File> dirs, File parent) {
		File[] children = parent.isDirectory() ? parent.listFiles(File::isDirectory) : null;
		if (children == null)
			return;
		for (File child : children)
			if (new File(child, "_custom").isDirectory())
				dirs.add(child);
	}

	public static String getConfigurationFolderPath(String configurationFilePath) {

		if (StringUtils.isBlank(configurationFilePath))
			return "./config";
		else
			return getParentFolderPathHavingName(configurationFilePath, "config");
	}

	/**
	 * Returns the portable executable directory for this runtime.
	 * Checks in this order: System property PORTABLE_EXECUTABLE_DIR, then
	 * environment variable PORTABLE_EXECUTABLE_DIR. Returns empty string if not set.
	 *
	 * Behavior note: if PORTABLE_EXECUTABLE_DIR is provided via environment and is a
	 * relative path (e.g., "testground/e2e"), we return it as-is (normalized slashes)
	 * instead of converting it to an absolute path. This preserves backward-compatible
	 * behavior for processes started from the project root (older behavior relied on
	 * relative paths resolving against the JVM working dir).
	 */
	public static String getPortableExecutableDir() {
		// Prefer system property (explicit JVM arg -DPORTABLE_EXECUTABLE_DIR)
		String portableDir = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		boolean fromSystemProperty = true;
		if (StringUtils.isBlank(portableDir)) {
			portableDir = System.getenv("PORTABLE_EXECUTABLE_DIR");
			fromSystemProperty = false;
		}
		if (StringUtils.isBlank(portableDir)) return StringUtils.EMPTY;

		// If it originated from a system property, keep existing behavior: resolve to absolute path
		if (fromSystemProperty) {
			try {
				Path p = Paths.get(portableDir);
				if (!p.isAbsolute()) p = p.toAbsolutePath().normalize();
				return p.toString().replace("\\", "/");
			} catch (Exception e) {
				return portableDir.replace("\\", "/");
			}
		} else {
			// Env var case: if absolute, normalize; if relative, leave relative (preserve legacy semantics)
			try {
				Path p = Paths.get(portableDir);
				if (p.isAbsolute()) {
					return p.toAbsolutePath().normalize().toString().replace("\\", "/");
				} else {
					return portableDir.replace("\\", "/");
				}
			} catch (Exception e) {
				return portableDir.replace("\\", "/");
			}
		}
	}

	public static String getRandomJobFileName() {

		return getRandomFileName("temp.job");

	}

	public static String getRandomFileName(String fileName) {

		return FilenameUtils.getBaseName(fileName) + "-" + StringUtils.substring(UUID.randomUUID().toString(), 0, 3)
				+ "." + FilenameUtils.getExtension(fileName);
	}

	public static void archiveLogFiles(String logsArchivesFolder) throws Exception {

		// might not be required but to be sure no exceptions are raised
		// give time for log4j to finish logging and close all files
		// Thread.sleep(1000);

		String logsFolderPath = Utils.getParentFolderPathHavingName(logsArchivesFolder, "logs");

		List<File> logFiles = new ArrayList<File>();

		logFiles.add(new File(logsFolderPath + "/info.log"));
		logFiles.add(new File(logsFolderPath + "/errors.log"));
		logFiles.add(new File(logsFolderPath + "/warnings.log"));

		// one by one copy log files to ctx.logsArchivesFolder
		for (File logFile : logFiles) {

			String destFilePath = logsArchivesFolder + "/" + FilenameUtils.getName(logFile.getCanonicalPath());

			// this try catch makes sure FileUtils.copyFile will never trigger an
			// exception to errors.log even if documentburst.bat.log file is locked
			// sometimes documentburst.bat.log fails to be copied because it is locked by
			// the JVM but other times it works - it is not such a big deal if
			// documentburst.bat.log is not archived sometimes
			try {

				FileUtils.copyFile(logFile, new File(destFilePath));

			} catch (Exception e) {
			}

		}

	}

	public static String getOutputFolder(String outputFolder) {
		int pos = outputFolder.indexOf('"', 0);

		if (pos >= 0) {
			return outputFolder.substring(1, outputFolder.length() - 1);
		} else {
			return outputFolder;
		}
	}

	public static int getQuarter(Date date, Locale locale) {
		Calendar cal;

		if (locale == null)
			cal = Calendar.getInstance();
		else
			cal = Calendar.getInstance(locale);

		cal.setTime(date);

		int month = cal.get(Calendar.MONTH);

		return (month / 3) + 1;
	}

	public static String getStringFromTemplate(String template, Variables variables, String token) throws Exception {
		log.debug("getStringFromTemplate(String template,Variables variables) : template=" + template + ", variables="
				+ variables);

		String freeMarkerTest = StringUtils.substringBetween(template, "${", "}");

		String stringTemplateTest = StringUtils.EMPTY;

		if (StringUtils.isEmpty(freeMarkerTest))
			stringTemplateTest = StringUtils.substringBetween(template, "$", "$");

		if (StringUtils.isEmpty(stringTemplateTest) && StringUtils.isEmpty(freeMarkerTest))
			return template;

		// if StringTemplate
		if (!StringUtils.isEmpty(stringTemplateTest) && StringUtils.isEmpty(freeMarkerTest)) {
			StringTemplate engine = new StringTemplate();
			engine.registerRenderer(Date.class, new DateRenderer());
			engine.setTemplate(template);
			engine.setAttributes(variables.getUserVariables(token));
			log.debug("getStringFromTemplate(String template,Variables variables) : returns = " + engine);
			return engine.toString();
		} else { // if (!freeMarkerTest.isEmpty() && stringTemplateTest.isEmpty())

			Template engine = new Template("template", template, DocumentBursterFreemarkerInitializer.FREE_MARKER_CFG);

			StringWriter stringWriter = new StringWriter();
			engine.process(variables.getUserVariables(token), stringWriter);
			stringWriter.flush();

			return stringWriter.toString();
		}

	}

	public static boolean isValidFtpCommand(BurstingContext ctx, UploadSettings uploadSettings) throws Exception {

		String command = Utils.getStringFromTemplate(uploadSettings.ftpcommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);

	}

	public static boolean isValidFileShareCommand(BurstingContext ctx, UploadSettings uploadSettings) throws Exception {

		String command = Utils.getStringFromTemplate(uploadSettings.filesharecommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);

	}

	public static boolean isValidFtpsCommand(BurstingContext ctx, UploadSettings uploadSettings) throws Exception {

		String command = Utils.getStringFromTemplate(uploadSettings.ftpscommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);

	}

	public static boolean isValidSftpCommand(BurstingContext ctx, UploadSettings uploadSettings) throws Exception {

		String command = Utils.getStringFromTemplate(uploadSettings.sftpcommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);

	}

	public static boolean isValidHttpCommand(BurstingContext ctx, UploadSettings uploadSettings) throws Exception {

		String command = Utils.getStringFromTemplate(uploadSettings.httpcommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);

	}

	public static boolean isValidCloudUploadCommand(BurstingContext ctx, UploadSettings uploadSettings)
			throws Exception {

		String command = Utils.getStringFromTemplate(uploadSettings.cloudcommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);

	}

	public static boolean isValidDocumentBursterWebCommand(BurstingContext ctx, WebUploadSettings webUploadSettings)
			throws Exception {

		String command = Utils.getStringFromTemplate(webUploadSettings.documentbursterwebcommand, ctx.variables,
				ctx.token);

		return StringUtils.isNotEmpty(command);

	}

	public static boolean isValidMSSharePointCommand(BurstingContext ctx, WebUploadSettings webUploadSettings)
			throws Exception {

		String command = Utils.getStringFromTemplate(webUploadSettings.mssharepointcommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);
	}

	public static boolean isValidWordPressCommand(BurstingContext ctx, WebUploadSettings webUploadSettings)
			throws Exception {

		String command = Utils.getStringFromTemplate(webUploadSettings.wordpresscommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);
	}

	public static boolean isValidDrupalCommand(BurstingContext ctx, WebUploadSettings webUploadSettings)
			throws Exception {

		String command = Utils.getStringFromTemplate(webUploadSettings.drupalcommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);
	}

	public static boolean isValidJoomlaCommand(BurstingContext ctx, WebUploadSettings webUploadSettings)
			throws Exception {

		String command = Utils.getStringFromTemplate(webUploadSettings.joomlacommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);
	}

	public static boolean isValidOtherWebCommand(BurstingContext ctx, WebUploadSettings webUploadSettings)
			throws Exception {

		String command = Utils.getStringFromTemplate(webUploadSettings.otherwebcommand, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(command);
	}

	public static boolean isValidEmailMessage(BurstingContext ctx, EmailSettings emailSettings) throws Exception {

		log.debug("ctx = " + ctx + ", destination = destination");

		boolean isValidToEmailAddress = isValidEmailAddress(emailSettings.to, ctx);

		log.debug("isValidToEmailAddress = " + isValidToEmailAddress);

		boolean isValidCcEmailAddress = isValidEmailAddress(emailSettings.cc, ctx);

		log.debug("isValidCcEmailAddress = " + isValidCcEmailAddress);

		boolean isValidBccEmailAddress = isValidEmailAddress(emailSettings.bcc, ctx);

		log.debug("isValidBccEmailAddress = " + isValidBccEmailAddress);

		return ((isValidToEmailAddress) || (isValidCcEmailAddress) || (isValidBccEmailAddress));

	}

	public static List<EmailAddressCriteria> getEmailAddressRfc2822ValidationOptions(BurstingContext ctx) {

		List<EmailAddressCriteria> options = new ArrayList<>();

		if (ctx.settings.getEmailRfc2822Validator().allowdomainliterals)
			options.add(EmailAddressCriteria.ALLOW_DOMAIN_LITERALS);

		if (ctx.settings.getEmailRfc2822Validator().allowquotedidentifiers)
			options.add(EmailAddressCriteria.ALLOW_QUOTED_IDENTIFIERS);

		if (ctx.settings.getEmailRfc2822Validator().allowdotinatext)
			options.add(EmailAddressCriteria.ALLOW_DOT_IN_A_TEXT);

		if (ctx.settings.getEmailRfc2822Validator().allowsquarebracketsinatext)
			options.add(EmailAddressCriteria.ALLOW_SQUARE_BRACKETS_IN_A_TEXT);

		if (ctx.settings.getEmailRfc2822Validator().allowparensinlocalpart)
			options.add(EmailAddressCriteria.ALLOW_PARENS_IN_LOCALPART);

		return options;

	}

	public static boolean isValidEmailAddress(String addressesTemplates, BurstingContext ctx) throws Exception {

		boolean isValidEmailAddress = true;

		String addresses = Utils.getStringFromTemplate(addressesTemplates, ctx.variables, ctx.token);

		if (StringUtils.isNotEmpty(addresses)) {

			String separator = ";";

			if (addresses.contains(","))
				separator = ",";

			String[] ads = addresses.split(separator);

			if ((ads == null) || (ads.length == 0))
				isValidEmailAddress = false;

			// boolean allowLocalEmailAddresses = ctx.settings.isAllowLocalEmailAddresses();
			List<EmailAddressCriteria> emailRfc2822ValidationOptions = Utils
					.getEmailAddressRfc2822ValidationOptions(ctx);
			String skipValidationForAddresses = ctx.settings.getEmailRfc2822Validator().skipvalidationfor;

			for (String address : ads) {

				if (StringUtils.isNotBlank(skipValidationForAddresses)) {
					if (skipValidationForAddresses.toLowerCase().contains(address.toLowerCase()))
						continue;
				}

				boolean isCurrentEmailAddressValid = true;

				if (emailRfc2822ValidationOptions.size() > 0)
					isCurrentEmailAddressValid = EmailAddressValidator.isValid(address,
							EnumSet.copyOf(emailRfc2822ValidationOptions));
				else
					isCurrentEmailAddressValid = EmailAddressValidator.isValid(address);

				if (!isCurrentEmailAddressValid)
					isValidEmailAddress = false;

			}
		} else
			isValidEmailAddress = false;

		if (!isValidEmailAddress) {
			if (StringUtils.isNotEmpty(addresses)) {
				throw new IllegalArgumentException(
						"Invalid email address '" + addresses + "' found for the token '" + ctx.token + "'");

			}
		}

		return isValidEmailAddress;

	}

	public static boolean isEmptyFile(String filePath) throws Exception {

		InputStream stream = new FileInputStream(new File(filePath));

		int size = stream.available();
		stream.close();

		return (size == 0);
	}

	public static double getFileSize(long fileSizeInBytes, FileSizeUnit unit) {

		double bytes = fileSizeInBytes;

		if (unit == FileSizeUnit.BYTE)
			return bytes;

		double kilobytes = (bytes / 1024);

		if (unit == FileSizeUnit.KILOBYTE)
			return kilobytes;

		double megabytes = (kilobytes / 1024);

		if (unit == FileSizeUnit.MEGABYTE)
			return megabytes;

		double gigabytes = (megabytes / 1024);

		if (unit == FileSizeUnit.GIGABYTE)
			return gigabytes;

		/*
		 * double terabytes = (gigabytes / 1024);
		 * 
		 * if (unit == FileSizeUnit.TERABYTE) return terabytes;
		 * 
		 * double petabytes = (terabytes / 1024);
		 * 
		 * if (unit == FileSizeUnit.PETABYTE) return petabytes;
		 * 
		 * double exabytes = (petabytes / 1024);
		 * 
		 * if (unit == FileSizeUnit.EXABYTE) return exabytes;
		 * 
		 * double zettabytes = (exabytes / 1024);
		 * 
		 * if (unit == FileSizeUnit.ZETTABYTE) return zettabytes;
		 * 
		 * double yottabytes = (zettabytes / 1024);
		 * 
		 * if (unit == FileSizeUnit.YOTTABYTE) return yottabytes;
		 */

		return 0;

	}

	// public static boolean isQATestMode(String testName) {
	// return StringUtils.contains(testName, "quality-assurance-test-mode");
	// }

	public static void copyFileToQuarantine(String quarantineFolderPath, String filePath) throws Exception {

		log.debug("copyFileToQuarantine(String quarantineFolderPath, String filePath): " + quarantineFolderPath + ", "
				+ filePath);

		File quarantineDir = new File(quarantineFolderPath);
		if (!quarantineDir.exists())
			FileUtils.forceMkdir(quarantineDir);

		FileUtils.copyFile(new File(filePath), new File(quarantineFolderPath + "/" + FilenameUtils.getName(filePath)));

	}

	public static String encodeURIComponent(String s) throws Exception {

		return URLEncoder.encode(s, "UTF-8").replaceAll("\\+", "%20").replaceAll("\\%21", "!").replaceAll("\\%27", "'")
				.replaceAll("\\%28", "(").replaceAll("\\%29", ")").replaceAll("\\%7E", "~");

	}

	public static String getHumanReadableTime(Long nanos) {

		long tempSec = nanos / (1000 * 1000 * 1000);
		long sec = tempSec % 60;
		long min = (tempSec / 60) % 60;
		long hour = (tempSec / (60 * 60)) % 24;
		long day = (tempSec / (24 * 60 * 60)) % 24;

		if (day > 0)
			return String.format("%d days %d hours %d minutes %d seconds", day, hour, min, sec);
		else {
			if (hour > 0)
				return String.format("%d hours %d minutes %d seconds", hour, min, sec);
			else {
				if (min > 0)
					return String.format("%d minutes %d seconds", min, sec);
				else
					return String.format("%d seconds", sec);

			}

		}

	}

	public static boolean isValidSmsMessage(BurstingContext ctx, SmsSettings smsSettings) throws Exception {

		String text = Utils.getStringFromTemplate(smsSettings.text, ctx.variables, ctx.token);

		return StringUtils.isNotEmpty(text);

	}

	public static boolean isValidTwilioMessage(BurstingContext ctx, SmsSettings smsSettings) throws Exception {

		String accountSid = Utils.getStringFromTemplate(smsSettings.twilio.accountsid, ctx.variables, ctx.token);
		String authToken = Utils.getStringFromTemplate(smsSettings.twilio.authtoken, ctx.variables, ctx.token);

		return isValidSmsMessage(ctx, smsSettings) && StringUtils.isNotEmpty(accountSid)
				&& StringUtils.isNotEmpty(authToken);

	}

	public static Map<String, Object> loadHeadersPropertiesFromText(String text) {

		Map<String, Object> properties = new HashMap<String, Object>();

		// good to parse complex csv like "a1, a2, a3, \"a4,a5\", a6"
		Pattern pattern = Pattern.compile("\\s*(\"[^\"]*\"|[^,]*)\\s*");

		Scanner scanner = new Scanner(text);

		while (scanner.hasNextLine()) {

			String key = StringUtils.EMPTY, value = StringUtils.EMPTY;

			String line = scanner.nextLine();

			// process the line in csv format
			Matcher matcher = pattern.matcher(line);

			int count = 0;

			while (matcher.find()) {
				count++;
				if (count == 1)
					key = matcher.group(1);
				else if (count == 2)
					value = matcher.group(1);
			}

			if (StringUtils.isNotBlank(key) && StringUtils.isNotBlank(value))
				properties.put(key.trim(), _parsePropertyValue(value.trim()));

		}

		scanner.close();

		return properties;
	}

	private static Object _parsePropertyValue(String propertyValue) {

		// read boolean value
		final Map<String, Boolean> booleanConversionMap = new HashMap<>();

		booleanConversionMap.put("0", false);
		booleanConversionMap.put("1", true);
		booleanConversionMap.put("false", false);
		booleanConversionMap.put("true", true);
		booleanConversionMap.put("no", false);
		booleanConversionMap.put("yes", true);

		if (booleanConversionMap.containsKey(propertyValue)) {
			return booleanConversionMap.get(propertyValue.toLowerCase());
		}

		// read Long number value
		try {
			return Long.valueOf(propertyValue);
		} catch (final NumberFormatException nfe) {
			// ok, so not a long number
		}

		// read Double number value
		try {
			return Double.valueOf(propertyValue);
		} catch (final NumberFormatException nfe) {
			// ok, so not a double number
		}

		// return value as is (which should be string)
		return propertyValue;

	}

	public static String removeControlCharactersFromString(String inputString) {

		// https://stackoverflow.com/questions/9057083/remove-all-control-characters-from-a-java-string

		/*
		 * To remove just ASCII control characters, use the Cntrl character class
		 * 
		 * String newString = string.replaceAll("\\p{Cntrl}", ""); To remove all 65 of
		 * the characters that Unicode refers to as "control characters", use the Cntrl
		 * character class in UNICODE_CHARACTER_CLASS mode, with the (?U) flag:
		 * 
		 * String newString = string.replaceAll("(?U)\\p{Cntrl}", ""); To additionally
		 * remove unicode "format" characters - things like the control characters for
		 * making text go right-to-left, or the soft hyphen - also nuke the Cf character
		 * class:
		 * 
		 * String newString = string.replaceAll("(?U)\\p{Cntrl}|\\p{Gc=Cf}", "");
		 */

		return inputString.replaceAll("(?U)\\p{Cntrl}|\\p{Gc=Cf}", "");

	}

	public static class RowWrapper {
		public Map<String, Object> record;

		public RowWrapper(Map<String, Object> row) {
			this.record = row;
		}

		public RowWrapper() {
		}
	}

	public static String dumpRowAsXml(Map<String, Object> row) throws Exception {
		XmlMapper xmlMapper = new XmlMapper();
		// Wrap in a root element for valid XML
		return xmlMapper.writerWithDefaultPrettyPrinter().writeValueAsString(new RowWrapper(row));
	}

	public static String getParentFolderPathHavingName(String filePath, String folderName) {

		if (StringUtils.isBlank(filePath))
			return "./config";
		else {

			File file = new File(filePath);
			File parentFolder = file.getParentFile();

			while (parentFolder != null) {
				if (parentFolder.getName().equalsIgnoreCase(folderName)) {
					return parentFolder.getAbsolutePath();
				}

				parentFolder = parentFolder.getParentFile();
			}

			return StringUtils.EMPTY;
		}
	}

	public static String ibContent(String htmlContent, String bType) {
		if (StringUtils.isBlank(htmlContent)) {
			return htmlContent;
		}

		try {
			Path brandingPath = Paths.get(resolvePathAgainstPortableDir("scripts/burst/internal/bb.html"));
			if (!Files.exists(brandingPath)) {

				brandingPath = Paths.get("src/main/external-resources/template/scripts/burst/internal/bb.html");
				if (!Files.exists(brandingPath)) {
					return htmlContent;
				}
			}

			// Read branding content
			String brandingContent = Files.readString(brandingPath);

			// Replace the branding text
			brandingContent = brandingContent.replace("Built by", bType);

			// Determine URL suffix based on branding type
			String urlSuffix;
			if ("Sent by".equals(bType)) {
				urlSuffix = "eml";
			} else if ("Built by".equals(bType)) {
				urlSuffix = "gr";
			} else {
				urlSuffix = "gr"; // Default fallback
			}

			// Replace the URL base pattern
			brandingContent = brandingContent.replaceAll("href=\"https://datapallas.com/g/rb/\\w+\"",
					"href=\"https://datapallas.com/g/rb/" + urlSuffix + "\"");

			// Insert content before closing body tag
			int bodyIndex = htmlContent.toLowerCase().lastIndexOf("</body>");
			if (bodyIndex != -1) {
				return htmlContent.substring(0, bodyIndex) + brandingContent + htmlContent.substring(bodyIndex);
			} else {
				return htmlContent + brandingContent;
			}
		} catch (Exception e) {
			// If anything goes wrong, return original content
			return htmlContent;
		}
	}

	public static boolean isPortOpen(String host, int port, int timeoutMs) {
		try (Socket socket = new Socket()) {
			// Set socket connection timeout
			socket.connect(new InetSocketAddress(host, port), timeoutMs);
			return true;
		} catch (Exception e) {
			return false; // Connection failed - port closed or unreachable
		}
	}

	/**
	 * Checks if the application is running inside a Docker container.
	 * Detection is based on the RUNNING_IN_DOCKER environment variable set by the entrypoint.
	 * 
	 * @return true if running inside Docker, false otherwise
	 */
	public static boolean isRunningInDocker() {
		String dockerEnv = System.getenv("RUNNING_IN_DOCKER");
		return "true".equalsIgnoreCase(dockerEnv);
	}

	/**
	 * Returns the effective hostname for network connections.
	 * When running inside Docker, converts localhost/127.0.0.1 to host.docker.internal
	 * to enable communication with sibling containers via host port mapping.
	 * 
	 * This provides cross-platform support for Docker Desktop (Windows/Mac) and Linux
	 * when extra_hosts is configured in docker-compose.yml.
	 * 
	 * @param configuredHost The hostname from configuration (e.g., "localhost")
	 * @return The effective hostname to use for connections
	 */
	public static String getEffectiveHost(String configuredHost) {
		if (isRunningInDocker() && isLocalhostHost(configuredHost)) {
			log.debug("Docker environment detected - converting {} to host.docker.internal", configuredHost);
			return "host.docker.internal";
		}
		return configuredHost;
	}

	/**
	 * Checks if the given hostname refers to localhost.
	 * 
	 * @param host The hostname to check
	 * @return true if the host is localhost or 127.0.0.1
	 */
	private static boolean isLocalhostHost(String host) {
		if (host == null) return false;
		String h = host.trim().toLowerCase();
		return "localhost".equals(h) || "127.0.0.1".equals(h);
	}
	
	// sanitize a string so it is safe to use as a folder/file name on Windows/Linux
	public static String sanitizeFileName(String input) {
        if (input == null) return "report";
        String s = Normalizer.normalize(input, Normalizer.Form.NFKD).replaceAll("\\p{M}", "");
        s = FilenameUtils.getName(s); // strip any path components
        s = s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", "_");
        s = s.replaceAll("[^A-Za-z0-9._\\- ]+", "_");
        s = s.replaceAll("[ _]{2,}", "_");
        s = s.trim();
        s = s.replaceAll("^\\.+|\\.+$", ""); // remove leading/trailing dots
        if (s.isEmpty()) s = "report";
        String upper = s.toUpperCase();
        Set<String> reserved = new HashSet<>();
        reserved.add("CON"); reserved.add("PRN"); reserved.add("AUX"); reserved.add("NUL");
        for (int i = 1; i <= 9; i++) { reserved.add("COM" + i); reserved.add("LPT" + i); }
        if (reserved.contains(upper)) s = "_" + s;
        int max = 200;
        if (s.length() > max) s = s.substring(0, max);
        return s;
    }

}
