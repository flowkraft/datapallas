package com.sourcekraft.documentburster.engine;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
//import org.perf4j.aop.Profiled;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.GlobalContext;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.Attachment;
import com.sourcekraft.documentburster.context.BurstingContext;
import com.sourcekraft.documentburster.job.JobUtils;
import com.sourcekraft.documentburster.job.model.JobProgressDetails;
import com.sourcekraft.documentburster.scripting.Scripting;
import com.sourcekraft.documentburster.sender.AbstractSender;
import com.sourcekraft.documentburster.sender.factory.SendersFactory;
import com.sourcekraft.documentburster.utils.LicenseUtils;
import com.sourcekraft.documentburster.utils.Scripts;
import com.sourcekraft.documentburster.utils.Utils;
import com.sourcekraft.documentburster.variables.Variables;

public abstract class AbstractBurster {

	protected static Logger log = LoggerFactory.getLogger(AbstractBurster.class);

	private static final Pattern BURSTING_PLACEHOLDER_PATTERN = Pattern.compile("\\$\\{[^}]+\\}");

	private long startExecutionTime = 0;

	protected int licenseLimit = 9999;
	private boolean licenseLimitExceeded = false;

	private JobProgressDetails previousJobExecutionProgressDetails = null;

	private GlobalContext global = new GlobalContext();

	protected boolean requestedCancelOrPauseProcessing = false;

	protected String configurationFilePath;

	protected Scripting scripting;

	protected String jobType;
	protected String jobFilePath;

	protected String filePath;
	protected String fileName;

	protected BurstingContext ctx;

	protected LicenseUtils licenseUtils = new LicenseUtils();

	public AbstractBurster(String configFilePath) {
		if ((StringUtils.isNoneEmpty(configFilePath)
				&& ((configFilePath.contains(Utils.SPLIT_2ND_TIME) || Files.exists(Paths.get(configFilePath))))))
			this.configurationFilePath = configFilePath;
		else
			this.configurationFilePath = Utils.resolvePathAgainstPortableDir("config/burst/settings.xml");
	}

	public int getLicenseLimit() {
		return licenseLimit;
	}

	public String getTempFolder() {
		return Utils.getTempFolder();
	}

	protected void fetchData() throws Exception {
	};

	protected void parseBurstingMetaData() throws Exception {
	}

	// @Profiled
	protected void processOutputDocument() throws Exception {

		extractOutputBurstDocument();

		ctx.extractedFilePaths.put(ctx.token, ctx.extractedFilePath);

		ctx.numberOfExtractedFiles++;

	}

	public void setJobType(String jobType) {

		this.jobType = jobType;

	}

	public void setJobFilePath(String jobFilePath) {

		this.jobFilePath = jobFilePath;

	}

	public void setPreviousJobExecutionProgressDetails(JobProgressDetails jobProgressDetails) {

		this.previousJobExecutionProgressDetails = jobProgressDetails;

	}

	protected void executeBurstingLifeCycleScript(String scriptFileName, BurstingContext context) throws Exception {
		//System.out.println("Executing executeBurstingLifeCycleScript: " + scriptFileName);
		scripting.executeBurstingLifeCycleScript(scriptFileName, ctx);
	}

	// @Profiled(tag = "burst_{$0}_{$1}_{$2}_{$3}")
	public void burst(String pathToFile, boolean testAll, String listOfTestTokens, int numberOfRandomTestTokens)
			throws Exception {

		log.info("Bursting document: '" + pathToFile + "' ...");

		checkLicense();

		filePath = pathToFile;
		fileName = FilenameUtils.getName(pathToFile);

		_initializeBursting();

		ctx.inputDocumentFilePath = pathToFile;

		try {

			setUpScriptingRoots();

			executeBurstingLifeCycleScript(ctx.scripts.startBursting, ctx);

			// don't remove executeController() from here
			// this line is loading the default settings.xml the first time here and then,
			// if defined, each different sub class will load again any custom defined XML
			// configuration file
			executeController();

			validateConfigurationValues();

			initializeResources();

			fetchData();

			// After data is fetched but before processing
			executeBurstingLifeCycleScript(ctx.scripts.transformFetchedData, ctx);

			parseBurstingMetaData();

			log.debug("burstTokens = " + ctx.burstTokens);

			this.requestedCancelOrPauseProcessing = checkIfRequestedCancelOrPauseProcessing();

			// *** START: SIMPLIFIED SINGLE REPORT MODE IMPLEMENTATION ***

			// Determine if we are in single report mode based SOLELY on burstFileName and
			// reportData presence
			boolean isSingleReportMode = false;
			String burstFileName = ctx.settings.getBurstFileName();

			if (burstFileName != null && !burstFileName.isEmpty()) {
				// Check if the filename contains specific bursting placeholders
				if (!BURSTING_PLACEHOLDER_PATTERN.matcher(burstFileName).find()) {
					// It's potentially single report mode, but only if data exists
					if (ctx.reportData != null && !ctx.reportData.isEmpty()) {
						isSingleReportMode = true;
					} else {
						log.warn(
								"Filename '{}' suggests single report mode, but reportData is empty. Cannot generate report.",
								burstFileName);
						// Let it fall through to the empty token check if parseBurstingMetaData also
						// yielded no tokens
					}
				}
				// If pattern matches, it's definitely NOT single report mode
			} else {
				log.warn("BurstFileName is null or empty. Cannot determine report mode or generate file.");
				// Let it fall through to the empty token check
			}

			if (isSingleReportMode) {

				log.info("Detected single report mode (Filename: '{}', reportData present). Processing once.",
						burstFileName);
				if (!this.requestedCancelOrPauseProcessing) {
					// 1. Set a fixed token for context consistency
					ctx.token = "1"; // Use "1" as the standard single token
					ctx.variables.set(Variables.BURST_TOKEN, ctx.token);
					ctx.variables.setUserVariable(ctx.token, "burst_token", ctx.token);
					ctx.variables.setUserVariable(ctx.token, "row_index", "0");
					ctx.variables.setUserVariable(ctx.token, "row_number", "1");

					// 2. *** Make ctx.reportData available to the template as 'reportData' ***
					ctx.variables.set("reportData", ctx.reportData);
					log.debug("Made ctx.reportData available to template as 'reportData'");

					// 3. Directly process the report once
					_processReportForCurrentToken(shouldSendFiles(), true);

				}
			} else {

				if (ctx.burstTokens.size() == 0) {
					throw new Exception(
							"No burst tokens were provided or fetched for the document : " + pathToFile);
				} else if (!this.requestedCancelOrPauseProcessing) {

					boolean shouldSendFiles = shouldSendFiles();

					List<String> listOfTokens = new ArrayList<String>();

					if (_isRunningInQualityAssuranceMode(testAll, listOfTestTokens, numberOfRandomTestTokens)) {

						// in QA mode make sure job will continue to run so that it can
						// find all errors in a single execution
						ctx.settings.setFailJobIfAnyDistributionFails(false);

						ctx.testName += "quality-assurance-test-mode";
						ctx.isQARunningMode = true;

						if (StringUtils.isNotBlank(listOfTestTokens)) {

							listOfTokens = Arrays.asList(listOfTestTokens.split(","));

							if (ctx.burstTokens.containsAll(listOfTokens))
								ctx.burstTokens.retainAll(listOfTokens);
							else
								throw new IllegalArgumentException("You provided the list: " + listOfTestTokens
										+ ", which is not correct. Please provide a comma separated list of burst tokens which should be tested. Each of the elements from this"
										+ " list should be a valid burst token from '" + pathToFile + "'!");
						}

						if (numberOfRandomTestTokens > 0) {
							Collections.shuffle(ctx.burstTokens);
							while (ctx.burstTokens.size() > numberOfRandomTestTokens)
								ctx.burstTokens.remove(ctx.burstTokens.size() - 1);
						}
					}

					// validate jobProgressDetails
					if (previousJobExecutionProgressDetails != null)
						_validatePreviousJobExecutionProgressDetails();

					String lastTokenInDocument = ctx.burstTokens.get(ctx.burstTokens.size() - 1);

					this.requestedCancelOrPauseProcessing = checkIfRequestedCancelOrPauseProcessing();
					boolean doMore = !this.requestedCancelOrPauseProcessing;

					int doneCount = 0;

					for (String token : ctx.burstTokens) {

						ctx.token = token;

						ctx.variables.set(Variables.BURST_TOKEN, ctx.token);
						ctx.variables.set(Variables.BURST_INDEX, doneCount + 1);

						if (doMore) {

							if (previousJobExecutionProgressDetails != null) {

								boolean wasAlreadyProcessed = _checkIfCurrentTokenWasAlreadyProcessedInPreviousJobExecution();

								if (!wasAlreadyProcessed)
									_processReportForCurrentToken(shouldSendFiles, !testAll);

							} else
								_processReportForCurrentToken(shouldSendFiles, !testAll);

							if (token.equals(lastTokenInDocument)) {
								File progressFile = new File(getTempFolder() + getJobProgressFileName());
								progressFile.delete();
							} else
								_updateJobProgressAndSaveToFile(testAll, listOfTestTokens, numberOfRandomTestTokens);

							doneCount++;

							licenseLimitExceeded = (doneCount < licenseLimit) ? false : true;
							this.requestedCancelOrPauseProcessing = checkIfRequestedCancelOrPauseProcessing();

							doMore = (!this.requestedCancelOrPauseProcessing) && (!licenseLimitExceeded);

						}
					}

					boolean isDeleteFiles = ctx.settings.isDeleteFiles();

					if (isDeleteFiles) {

						String backupFilePath = ctx.backupFolder + "/" + FilenameUtils.getName(pathToFile);

						File backupFile = new File(backupFilePath);

						if ((backupFile.exists()) && (!FileUtils.deleteQuietly(backupFile))) {
							log.error("Failed to delete " + backupFilePath);
						}

					}

					ctx.token = StringUtils.EMPTY;
					ctx.extractedFilePath = StringUtils.EMPTY;

					if (licenseLimitExceeded)
						log.warn(
								"DEMO version limit - " + "DocumentBurster DEMO version can burst and distribute up to "
										+ licenseLimit + " reports. If you need more please "
										+ "license DocumentBurster from https://www.pdfburst.com/store/ ");

				}

			}

		} finally {

			closeResources();

			backupFile();

			executeBurstingLifeCycleScript(ctx.scripts.endBursting, ctx);

			log.info("DONE bursting document");

			writeStatsFile();

		}

	}

	private void validateConfigurationValues() throws Exception {

		if (StringUtils.isBlank(ctx.settings.getBurstFileName()))
			throw new Exception(
					"'Burst File Name' cannot be empty, please provide a valid 'Burst File Name' configuration value for the configuration template called '"
							+ ctx.settings.getTemplateName() + "'");

		if (StringUtils.isBlank(ctx.settings.getOutputFolder()))
			throw new Exception(
					"'Output Folder' cannot be empty, please provide a valid 'Output Folder' configuration value for the configuration template called '"
							+ ctx.settings.getTemplateName() + "'");

		if (shouldSendFiles() && StringUtils.isBlank(ctx.settings.getQuarantineFolder()))
			throw new Exception(
					"'Quarantine Folder' cannot be empty, please provide a valid 'Quarantine Folder' configuration value for the configuration template called '"
							+ ctx.settings.getTemplateName() + "'");

	}

	protected boolean shouldSendFiles() {

		boolean isSendFilesEmail = ctx.settings.getSendFiles().email;
		boolean isSendFilesUpload = ctx.settings.getSendFiles().upload;
		boolean isSendFilesWeb = ctx.settings.getSendFiles().web;
		boolean isSendFilesSms = ctx.settings.getSendFiles().sms;

		return isSendFilesEmail || isSendFilesUpload || isSendFilesWeb || isSendFilesSms;

	}

	// public Map<String, String> getBurstDocumentPaths() {
	// return burstDocumentPaths;
	// }

	public void setLicenseUtils(LicenseUtils licenseUtils) {
		this.licenseUtils = licenseUtils;
	}

	protected void setUpScriptingRoots() {

		// nothing to do here since Scripting has correct default engineRoots
		// this is only required to override the engineRoots in the Unit Tests

	};

	public void setGlobal(GlobalContext global) {
		this.global = global;
	}

	public String getCancelJobFileName() {

		String jobFileBaseName = FilenameUtils.getBaseName(jobFilePath);

		return jobFileBaseName + ".cancel";

	}

	public String getPauseJobFileName() {

		String jobFileBaseName = FilenameUtils.getBaseName(jobFilePath);

		return jobFileBaseName + ".pause";

	}

	public String getJobProgressFileName() {

		String jobFileBaseName = FilenameUtils.getBaseName(jobFilePath);

		return jobFileBaseName + ".progress";

	}

	public BurstingContext getCtx() {
		return ctx;
	}

	public Scripting getScripting() {
		return this.scripting;
	}

	protected void initializeResources() throws Exception {
	}

	protected void closeResources() throws Exception {
	}

	protected abstract void extractOutputBurstDocument() throws Exception;

	protected void executeController() throws Exception {

		executeBurstingLifeCycleScript(Scripts.CONTROLLER, ctx);
		_initializeVariables();

	}

	protected boolean checkIfRequestedCancelOrPauseProcessing() {

		if (this.requestedCancelOrPauseProcessing)
			return this.requestedCancelOrPauseProcessing;

		File pauseFile = new File(getTempFolder() + getPauseJobFileName());
		// log.info("[CHECK-SIGNAL] looking for pause file at: {} (exists={})", pauseFile.getAbsolutePath(), pauseFile.exists());

		boolean shouldPause = pauseFile.exists();

		if (shouldPause) {

			log.info("***User requested PAUSE***");

			pauseFile.delete();

			return shouldPause;

		}

		File cancelFile = new File(getTempFolder() + getCancelJobFileName());

		boolean shouldCancel = cancelFile.exists();

		if (shouldCancel) {

			log.info("***User requested CANCEL***");

			cancelFile.delete();

			File progressFile = new File(getTempFolder() + getJobProgressFileName());
			if (progressFile.exists())
				progressFile.delete();

			return shouldCancel;
		}

		return this.requestedCancelOrPauseProcessing;

	}

	protected void _initializeBursting() throws Exception {

		startExecutionTime = System.nanoTime();

		ctx = new BurstingContext();

		ctx.configurationFilePath = configurationFilePath;

		ctx.settings = new Settings(configurationFilePath);

		ctx.scripts = new Scripts();

		scripting = new Scripting();

		this.requestedCancelOrPauseProcessing = false;

	}

	private void _initializeVariables() {

		ctx.variables = new Variables(fileName, ctx.settings.getLanguage(), ctx.settings.getCountry(),
				ctx.settings.getNumberOfUserVariables());

	}

	private void _initializeLogsArchivesFolder() throws Exception {

		ctx.logsArchivesFolder = Utils.getStringFromTemplate(ctx.settings.getLogsArchivesFolder(), ctx.variables,
				ctx.token);

		global.logsArchivesFolder = ctx.logsArchivesFolder;

	}

	protected void writeStatsFile() throws Exception {

		if (Objects.isNull(ctx.variables))
			return;

		_initializeLogsArchivesFolder();

		File logsArchivesDir = new File(ctx.logsArchivesFolder);

		if (!logsArchivesDir.exists())
			FileUtils.forceMkdir(logsArchivesDir);
		else
			throw new IllegalArgumentException("Folder '" + ctx.logsArchivesFolder
					+ "' already exists. Please provide a logsarchivesfolder configuration which is guaranteed to generate a new logs/archives folder for each bursting session!");

		// stats variables
		ctx.variables.set(Variables.NUM_PAGES, ctx.numberOfPages);

		if (ctx.burstTokens != null)
			ctx.variables.set(Variables.NUM_TOKENS, ctx.burstTokens.size());
		else
			ctx.variables.set(Variables.NUM_TOKENS, 0);

		ctx.variables.set(Variables.NUM_FILES_EXTRACTED, ctx.numberOfExtractedFiles);
		ctx.variables.set(Variables.NUM_MESSAGES_SENT, ctx.numberOfMessagesSent);
		ctx.variables.set(Variables.NUM_FILES_DISTRIBUTED, ctx.numberOfDistributedFiles);
		ctx.variables.set(Variables.NUM_FILES_SKIPPED_DISTRIBUTION, ctx.numberOfSkippedFiles);
		ctx.variables.set(Variables.NUM_FILES_QUARANTINED, ctx.numberOfQuarantinedFiles);

		String statsFileContentTemplate = "\n\nInput Document = '" + ctx.inputDocumentFilePath + "'\n\n";

		statsFileContentTemplate += "Execution Time = "
				+ Utils.getHumanReadableTime(System.nanoTime() - startExecutionTime) + "\n\n";

		if ((StringUtils.isNotBlank(ctx.inputDocumentFilePath)) && ctx.inputDocumentFilePath.endsWith(".pdf"))
			statsFileContentTemplate += "Number Of Pages = ${num_pages}\n";

		statsFileContentTemplate += "Number Of Tokens Read = ${num_tokens}\n";

		statsFileContentTemplate += "Number Of Documents Extracted = ${num_files_extracted}\n";

		statsFileContentTemplate += "Number Of Messages Sent = ${num_messages_sent}\n";

		statsFileContentTemplate += "Number Of Documents Distributed = ${num_files_distributed}\n";

		if (ctx.numberOfSkippedFiles > 0)
			statsFileContentTemplate += "Number Of Documents Skipped = ${num_files_skipped_distribution}\n";

		if (ctx.numberOfQuarantinedFiles > 0)
			statsFileContentTemplate += "Number Of Documents Quarantined = ${num_files_quarantined}\n";

		statsFileContentTemplate += "\n";

		if ((ctx.outputFolder != null) && (ctx.outputFolder.length() > 0))
			statsFileContentTemplate += "Output Folder = '${output_folder}'\n";

		if ((ctx.quarantineFolder != null) && (ctx.quarantineFolder.length() > 0))
			statsFileContentTemplate += "Quarantine Folder = '${quarantine_folder}'\n";

		statsFileContentTemplate += "\n";

		String statsFileContent = Utils.getStringFromTemplate(statsFileContentTemplate, ctx.variables, ctx.token);

		log.info(statsFileContent);

		statsFileContentTemplate += "sendfiles.email = " + ctx.settings.getSendFiles().email;
		statsFileContentTemplate += "\n";
		statsFileContentTemplate += "sendfiles.upload = " + ctx.settings.getSendFiles().upload;
		statsFileContentTemplate += "\n";
		statsFileContentTemplate += "sendfiles.web = " + ctx.settings.getSendFiles().web;
		statsFileContentTemplate += "\n";
		statsFileContentTemplate += "sendfiles.sms = " + ctx.settings.getSendFiles().sms;
		statsFileContentTemplate += "\n\n";

		statsFileContentTemplate += "failjobifanydistributionfails = " + ctx.settings.isFailJobIfAnyDistributionFails();
		statsFileContentTemplate += "\n\n";

		statsFileContent = Utils.getStringFromTemplate(statsFileContentTemplate, ctx.variables, ctx.token);

		ctx.variables.set(Variables.STATS_INFO,
				Utils.getStringFromTemplate(Variables.STATS_INFO_TEMPLATE, ctx.variables, ctx.token));

		String statsFileName = Utils.getStringFromTemplate(ctx.settings.getStatsFileName(), ctx.variables, ctx.token);
		String statsFilePath = ctx.logsArchivesFolder + "/" + statsFileName;

		File statsFile = new File(statsFilePath);

		if (statsFile.createNewFile()) {

			BufferedWriter writer = new BufferedWriter(new FileWriter(statsFilePath));

			writer.write(statsFileContent);
			writer.close();

		}

		_doStats(statsFileContent);

	}

	private void _doStats(String statsFileContent) throws Exception {

	}

	private boolean _isRunningInQualityAssuranceMode(boolean testAll, String listOfTestTokens,
			int numberOfRandomTestTokens) {

		return ((testAll) || (StringUtils.isNotBlank(listOfTestTokens)) || (numberOfRandomTestTokens > 0));

	}

	private void _processReportForCurrentToken(boolean isSendFiles, boolean executeDistribution) throws Exception {

		if (this.requestedCancelOrPauseProcessing)
			return;

		String skip = ctx.variables.getUserVariables(ctx.token).get(Variables.SKIP).toString();

		ctx.skipCurrentFileDistribution = Boolean.valueOf(skip).booleanValue();

		log.debug("token = " + ctx.token + ", ctx.skipCurrentFileDistribution = " + ctx.skipCurrentFileDistribution);

		extractDocument();

		if (!ctx.configurationFilePath.contains(Utils.SPLIT_2ND_TIME)) {
			processAttachments();

			if (isSendFiles && !ctx.skipCurrentFileDistribution) {

				double delay = ctx.settings.getDelayEachDistributionBy();
				if (delay > 0)
					Thread.sleep((long) (delay * 1000));

				_distributeReport(executeDistribution);

			} else {

				if (isSendFiles && ctx.skipCurrentFileDistribution)
					ctx.numberOfSkippedFiles++;

			}
		}

	}

	protected void extractDocument() throws Exception {

		executeBurstingLifeCycleScript(ctx.scripts.beforeTemplateProcessing, ctx);

		executeBurstingLifeCycleScript(ctx.scripts.startExtractDocument, ctx);

		createOutputFoldersIfTheyDontExist();

		String burstFileName = Utils.getFileNameOfBurstDocument(ctx.settings.getBurstFileName(), ctx.token);

		ctx.extractedFilePath = ctx.outputFolder + "/"
				+ Utils.getStringFromTemplate(burstFileName, ctx.variables, ctx.token);
		ctx.variables.set(Variables.EXTRACTED_FILE_PATH, ctx.extractedFilePath);

		if (ctx.settings.getDumpRecordDataAsXml()) {
			this.dumpCurrentRecordDataAsXml();
		}

		processOutputDocument();

		executeBurstingLifeCycleScript(ctx.scripts.endExtractDocument, ctx);

		log.info("Document '" + ctx.extractedFilePath + "' was extracted for token '" + ctx.token + "'");

	}

	protected void dumpCurrentRecordDataAsXml() throws Exception {
		String xmlDumpFilePath = ctx.extractedFilePath.substring(0, ctx.extractedFilePath.length() - 4)
				+ "-record-data.xml";
		String xmlDumpFileContent = Utils.dumpRowAsXml(ctx.variables.getUserVariables(ctx.token));
		FileUtils.writeStringToFile(new File(xmlDumpFilePath), xmlDumpFileContent, "UTF-8");
	}

	protected void processAttachments() throws Exception {

		ctx.attachments.clear();
		ctx.archiveFilePath = StringUtils.EMPTY;

		List<Attachment> attachments = ctx.settings.getAttachments();

		// if there are any attachments
		if (attachments.size() > 0) {

			// generate the path from the template/variable based path
			for (Attachment attachment : attachments) {

				String attachmentPath = StringUtils.EMPTY;
				/*
				 * another option could be
				 * 
				 * if (ctx.getSettings().isSplit2ndTime())
				 * 
				 * but I believe the below works better
				 * 
				 */

				if (!attachment.path.contains(Variables.EXTRACTED_FILE_PATHS_AFTER_SPLITTING_2ND_TIME)) {

					attachmentPath = Utils.getStringFromTemplate(attachment.path, ctx.variables, ctx.token);

					// normal attachments, it goes here most of the times
					ctx.attachments.add(attachmentPath);

				} else if (attachment.path.contains(Variables.EXTRACTED_FILE_PATHS_AFTER_SPLITTING_2ND_TIME))// if
																												// should
																												// go
																												// here
				// only for the
				// situation of
				// ctx.getSettings().isSplit2ndTime()
				{

					// otherwise it will try to process this code for the master PdfBurster and it
					// will fail with NullPointerException
					// on ctx.extractedFilePathsAfterSplitting2ndTime
					for (Map.Entry<String, String> entry : ctx.extractedFilePathsAfterSplitting2ndTime.entrySet()) {

						attachmentPath = entry.getValue();

						if (new File(attachmentPath).exists())
							ctx.attachments.add(attachmentPath);
					}
				}

			}

			// archive the attachments together
			if (ctx.settings.isArchiveAttachments()) {

				String archiveFileName = Utils.getStringFromTemplate(ctx.settings.getArchiveFileName(), ctx.variables,
						ctx.token);

				if (StringUtils.isNotBlank(archiveFileName)) {

					ctx.archiveFilePath = ctx.outputFolder + "/" + archiveFileName;

					log.debug("Archiving attachments to '" + ctx.archiveFilePath + "'");

					executeBurstingLifeCycleScript(ctx.scripts.archive, ctx);

				} else
					throw new Exception("You need to provide a valid 'archiveFileName'");

			}

		} else
			log.debug("There are no attachments defined for the token '" + ctx.token + "'!");

		log.debug("ctx.attachments = " + ctx.attachments);

	}

	private void _distributeReport(boolean execute) throws Exception {

		List<AbstractSender> senders = new ArrayList<AbstractSender>();

		try {

			senders = _getSenders(execute);

			if ((senders != null) && (senders.size() > 0)) {

				for (AbstractSender sender : senders) {

					sender.setScripting(scripting);
					sender.send();

				}
			}
			_checkAndDeleteFile();

		} catch (IllegalArgumentException e)/*
											 * address validation errors generated by senders = getSenders(testName,
											 * execute);
											 */ {
			if (ctx.settings.isQuarantineFiles())
				quarantineDocument();

			ctx.setLastException(e);
			executeBurstingLifeCycleScript(ctx.scripts.distributeReportErrorHandling, ctx);

		}

	}

	private void _updateJobProgressAndSaveToFile(boolean testAll, String listOfTestTokens, int numberOfRandomTestTokens)
			throws Exception {

		if (!licenseUtils.getLicense().itWasPaid())
			return;

		Date d = Calendar.getInstance().getTime();
		SimpleDateFormat sdf = new SimpleDateFormat("dd-MMM-yyyy HH:mm:ss");
		String currentDate = sdf.format(d);

		int tokensCount = ctx.burstTokens.size();
		int pagesCount = ctx.numberOfPages;

		String lastTokenProcessed = ctx.token;
		String lastTokenInDocument = ctx.burstTokens.get(ctx.burstTokens.size() - 1);

		int indexOfLastTokenProcessed = ctx.burstTokens.indexOf(lastTokenProcessed);
		int numberOfRemainingTokens = ctx.burstTokens.size() - 1 - indexOfLastTokenProcessed;

		JobProgressDetails currentJobExecutionProgressDetails = new JobProgressDetails();

		currentJobExecutionProgressDetails.currentdate = currentDate;
		currentJobExecutionProgressDetails.filepath = filePath;
		currentJobExecutionProgressDetails.jobtype = jobType;
		currentJobExecutionProgressDetails.configurationFilePath = configurationFilePath;

		currentJobExecutionProgressDetails.lasttokenprocessed = lastTokenProcessed;
		currentJobExecutionProgressDetails.lasttokenindocument = lastTokenInDocument;

		currentJobExecutionProgressDetails.testall = testAll;
		currentJobExecutionProgressDetails.listoftesttokens = listOfTestTokens;
		currentJobExecutionProgressDetails.numberofrandomtesttokens = numberOfRandomTestTokens;

		currentJobExecutionProgressDetails.tokenscount = tokensCount;
		currentJobExecutionProgressDetails.pagescount = pagesCount;
		currentJobExecutionProgressDetails.numberofremainingtokens = numberOfRemainingTokens;
		currentJobExecutionProgressDetails.indexoflasttokenprocessed = indexOfLastTokenProcessed;

		String progressFilePath = getTempFolder() + getJobProgressFileName();

		File progressFile = new File(progressFilePath);

		if (progressFile.exists())
			progressFile.delete();

		JobUtils.saveJobProgressDetails(currentJobExecutionProgressDetails, progressFilePath);

	}

	protected void backupFile() throws Exception {

		// Guard: if settings were never loaded (e.g., burst failed before
		// controller.groovy ran), skip backup to avoid masking the real error.
		if (!ctx.settings.isSettingsLoaded())
			return;

		// don't waste time doing a backup if files are to be deleted anyway
		// (and if you do the unit tests will fail)
		if (ctx.settings.isDeleteFiles())
			return;

		ctx.backupFolder = Utils.getStringFromTemplate(ctx.settings.getBackupFolder(), ctx.variables, ctx.token);

		File backupDir = new File(ctx.backupFolder);
		if (!backupDir.exists())
			FileUtils.forceMkdir(backupDir);

		File backupFile = new File(ctx.backupFolder + "/" + fileName);

		if (!backupFile.exists())
			FileUtils.copyFile(new File(filePath), backupFile);

	}

	protected void createOutputFoldersIfTheyDontExist() throws Exception {

		ctx.quarantineFolder = Utils.resolvePathAgainstPortableDir(
				Utils.getStringFromTemplate(ctx.settings.getQuarantineFolder(), ctx.variables, ctx.token));
		ctx.variables.set(Variables.QUARANTINE_FOLDER, ctx.quarantineFolder);

		ctx.outputFolder = Utils.resolvePathAgainstPortableDir(
				Utils.getStringFromTemplate(ctx.settings.getOutputFolder(), ctx.variables, ctx.token));
		ctx.variables.set(Variables.OUTPUT_FOLDER, ctx.outputFolder);

		File outputDir = new File(ctx.outputFolder);

		if (!outputDir.exists()) {
			FileUtils.forceMkdir(outputDir);

			if (ctx.isQARunningMode)
				FileUtils.forceMkdir(new File(ctx.outputFolder + "/quality-assurance"));

		}

	}

	private List<AbstractSender> _getSenders(boolean execute) throws Exception {

		log.debug("getSenders()");

		List<AbstractSender> senders = SendersFactory.makeSenders(ctx, execute);
		return senders;

	}

	protected void quarantineDocument() throws Exception {

		Utils.copyFileToQuarantine(ctx.quarantineFolder, ctx.extractedFilePath);
		ctx.numberOfQuarantinedFiles += 1;
		executeBurstingLifeCycleScript(ctx.scripts.quarantineDocument, ctx);

	}

	protected void checkLicense() throws Exception {

		licenseUtils.getLicense().loadLicense();

		if (licenseUtils.getLicense().isDemo())
			return;

		licenseUtils.checkLicense();

		if (licenseUtils.getLicense().itWasPaid())
			licenseLimit = Integer.MAX_VALUE;

		if (licenseUtils.getLicense().isExpired())
			log.warn("License expired - Please renew license - https://www.pdfburst.com/renew.html");

	}

	private void _checkAndDeleteFile() throws Exception {

		boolean isDeleteFiles = ctx.settings.isDeleteFiles();

		if (isDeleteFiles) {
			File extractedFile = new File(ctx.extractedFilePath);
			if (extractedFile.delete()) {
				log.info("Document '" + ctx.extractedFilePath
						+ "' was deleted because {deletefiles} configuration is true");
			} else {
				log.error("Failed to delete " + ctx.extractedFilePath);
			}
		}

	}

	private boolean _checkIfCurrentTokenWasAlreadyProcessedInPreviousJobExecution() {

		int indexLastTokenProcessedInPreviousJobExecution = ctx.burstTokens
				.indexOf(previousJobExecutionProgressDetails.lasttokenprocessed);
		int indexTokenCurrent = ctx.burstTokens.indexOf(ctx.token);

		if (indexTokenCurrent <= indexLastTokenProcessedInPreviousJobExecution)
			return true;

		return false;

	}

	private void _validatePreviousJobExecutionProgressDetails() throws IllegalArgumentException {

		if (previousJobExecutionProgressDetails.tokenscount != ctx.burstTokens.size())
			throw new IllegalArgumentException(previousJobExecutionProgressDetails.filepath + " shows tokensCount as "
					+ previousJobExecutionProgressDetails.tokenscount + " but "
					+ previousJobExecutionProgressDetails.filepath + " has " + ctx.burstTokens.size() + " tokens!");

		if (!previousJobExecutionProgressDetails.lasttokenindocument
				.equals(ctx.burstTokens.get(ctx.burstTokens.size() - 1)))
			throw new IllegalArgumentException(previousJobExecutionProgressDetails.filepath
					+ " shows lastTokenInDocument as " + previousJobExecutionProgressDetails.lasttokenindocument
					+ " but the last token in " + previousJobExecutionProgressDetails.filepath + " is "
					+ ctx.burstTokens.get(ctx.burstTokens.size() - 1));

		int indexOfLastTokenProcessed = ctx.burstTokens.indexOf(previousJobExecutionProgressDetails.lasttokenprocessed);
		int numberOfRemainingTokens = ctx.burstTokens.size() - 1 - indexOfLastTokenProcessed;

		if (previousJobExecutionProgressDetails.indexoflasttokenprocessed != indexOfLastTokenProcessed)
			throw new IllegalArgumentException(previousJobExecutionProgressDetails.filepath + " shows indexOf "
					+ previousJobExecutionProgressDetails.lasttokenprocessed + " as "
					+ previousJobExecutionProgressDetails.indexoflasttokenprocessed + " but the index of "
					+ previousJobExecutionProgressDetails.lasttokenprocessed + " in the "
					+ previousJobExecutionProgressDetails.filepath + " is " + indexOfLastTokenProcessed);

		if (previousJobExecutionProgressDetails.numberofremainingtokens != numberOfRemainingTokens)
			throw new IllegalArgumentException(previousJobExecutionProgressDetails.filepath
					+ " shows numberOfRemainingTokens as " + previousJobExecutionProgressDetails.numberofremainingtokens
					+ " but in the file " + previousJobExecutionProgressDetails.filepath + " there are "
					+ numberOfRemainingTokens + " remaining tokens!");

		if ((ctx.numberOfPages > -1) && (previousJobExecutionProgressDetails.pagescount != ctx.numberOfPages))
			throw new IllegalArgumentException(previousJobExecutionProgressDetails.filepath + " shows pagesCount as "
					+ previousJobExecutionProgressDetails.pagescount + " but "
					+ previousJobExecutionProgressDetails.filepath + " has " + ctx.numberOfPages + " pages!");

	}

}
