package com.flowkraft.jobs.schedulers;

import java.io.File;
import java.util.Collection;
import java.util.LinkedList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

import jakarta.annotation.PostConstruct;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.flowkraft.common.Constants;
import com.flowkraft.common.Utils;
import com.flowkraft.jobs.models.FileInfo;
import com.flowkraft.jobs.services.JobExecutionService;
import com.flowkraft.jobs.services.JobsService;
import com.flowkraft.common.AppPaths;

@Component
public class PollScheduler {

	private static final Logger log = LoggerFactory.getLogger(PollScheduler.class);

	@Value("${POLLING_PATH:}")
	private String pollingPath;

	@Autowired
	JobsService jobsService;

	@Autowired
	JobExecutionService jobExecutionService;

	// put the new files in a waitQueue just to be sure we don't try to process
	// incomplete files which are not yet fully copied to the "poll" folder
	private List<String> waitQueue = new LinkedList<String>();

	@PostConstruct
	public void init() {

		if (!StringUtils.isBlank(pollingPath)) {

			File pollDir = new File(pollingPath);
			if (!pollDir.exists()) {
				pollDir.mkdirs();
			}

			File pollDirReceived = new File(pollingPath + "/received");
			if (!pollDirReceived.exists()) {
				pollDirReceived.mkdirs();
			}
		}
	}

	@Scheduled(fixedRate = 5000)
	public void poll() throws Exception {
		// System.out.println("Polling started...");

		if (StringUtils.isBlank(pollingPath)) {
			// System.out.println("Polling path is blank, returning...");
			return;
		}

		String pollingReceivedPath = pollingPath + "/received";

		Collection<File> allFilesInPollFolder = FileUtils.listFiles(new File(pollingPath),
				Utils.filesWhichCanBeProcessedFilter, null);

		if (allFilesInPollFolder.size() > 0)
			// System.out.println("Found " + allFilesInPollFolder.size() + " files in poll
			// folder.");

			for (File polledFile : allFilesInPollFolder) {

				// process one file at a time
				// this condition should remain inside the for, when moved outside the for
				// the system will try to process all the files in the same time (bad)
				if (jobsService.state.numberOfActiveJobs > 0)
					return;

				String polledFilePath = polledFile.getAbsolutePath();

				// System.out.println("Processing file: " + polledFilePath);

				String baseName = FilenameUtils.getBaseName(polledFilePath); // get filename without extension
				String extension = FilenameUtils.getExtension(polledFilePath); // get file extension

				String randomUUID = UUID.randomUUID().toString(); // generate random UUID

				// construct new filename with random UUID
				String polledFileName = baseName + "-" + randomUUID + "." + extension;

				Collection<File> processingFiles = FileUtils.listFiles(new File(pollingReceivedPath),
						Utils.filesWhichCanBeProcessedFilter, null);

				jobsService.state.numberOfActiveJobs = processingFiles.size();

				// System.out.println("Number of active jobs: " +
				// jobsService.state.numberOfActiveJobs);

				if (!waitQueue.contains(polledFilePath)) {
					// System.out.println("Adding file to wait queue: " + polledFilePath);
					waitQueue.add(polledFilePath);
				} else {

					String filePathToProcess = pollingReceivedPath + "/" + polledFileName;

					jobsService.state.numberOfActiveJobs = 1;

					File fileToProcess = new File(filePathToProcess);

					FileUtils.moveFile(polledFile, fileToProcess);

					// In-process execution via JobExecutionService (replaces ShellService)
					jobExecutionService.executeAsync(new String[] { "job", "burst", filePathToProcess }, () -> {
						try {
							List<FileInfo> progressFile = this.jobsService.fetchStats()
									.filter(f -> f.fileName.endsWith(Constants.EXTENTION_PROGRESS_FILE)
											&& f.fileContent.contains(filePathToProcess))
									.collect(Collectors.toList());
							// if there is a corresponding .progress file do not remove the file since it
							// might be "Resumed" later
							if (Objects.isNull(progressFile) || progressFile.size() == 0) {
								FileUtils.forceDelete(fileToProcess);
							}
							waitQueue.remove(polledFilePath);
						} catch (Exception e) {
							log.warn("Post-burst cleanup failed for {}: {}", filePathToProcess, e.getMessage());
						} finally {
							jobsService.state.numberOfActiveJobs = 0;
						}
					});
				}
			}
		// System.out.println("Polling ended...");
	}

}
