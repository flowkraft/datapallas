package com.flowkraft.jobs.services;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;
import com.flowkraft.common.Constants;
import com.flowkraft.jobs.models.WebSocketJobsExecutionStatsInfo;
import com.sourcekraft.documentburster.DocumentBurster;
import com.sourcekraft.documentburster.common.settings.Settings;

/**
 * Executes ReportBurster jobs in-process by calling MainProgram.execute() —
 * the exact same code path as running reportburster.bat from the CLI.
 *
 * MainProgram (picocli) → CliJob → _createJobFile() → work → _deleteJobFile()
 *
 * Replaces ShellService which spawned a separate JVM process via reportburster.bat.
 * Uses a dedicated thread pool (same pattern as StarterPacksManagementService)
 * to avoid blocking reactor threads.
 *
 * WebSocket notifications match the old ShellService behavior exactly:
 * - "on.process.complete" with exit value on success
 * - "on.process.failed" with exception message on failure
 */
@Service
public class JobExecutionService {

	private static final Logger log = LoggerFactory.getLogger(JobExecutionService.class);

	private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
		Thread t = new Thread(r, "job-executor");
		t.setDaemon(true);
		return t;
	});

	@Autowired
	private SimpMessageSendingOperations messagingTemplate;

	/**
	 * Execute a job asynchronously. Returns immediately — the job runs on a
	 * background thread. WebSocket notifications are sent on completion/failure.
	 *
	 * @param args CLI args (same format as reportburster.bat command line)
	 */
	public void executeAsync(String[] args) {
		executeAsync(args, null);
	}

	/**
	 * Execute a job synchronously — blocks until the job completes.
	 * Used for operations where the caller needs the result before proceeding
	 * (e.g., license activation/deactivation).
	 */
	public void executeSync(String[] args) throws Throwable {
		final String cmdDescription = String.join(" ", args);
		log.info("Executing job (sync): {}", cmdDescription);
		System.setProperty("DOCUMENTBURSTER_HOME", AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
		Settings.PORTABLE_EXECUTABLE_DIR_PATH = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		DocumentBurster.execute(args);
		log.info("Job completed (sync): {}", cmdDescription);
	}

	/**
	 * Execute a tracked job asynchronously. Updates {@link JobStore} status
	 * (queued → running → done/failed) and sends SSE events via the emitter
	 * registered for the given job ID. Also sends the legacy WebSocket notification
	 * so existing UI stats panels continue to work alongside the new job model.
	 */
	public void executeTracked(String[] args, String jobId, JobStore jobStore) {
		final String cmdDescription = String.join(" ", args);
		log.info("Submitting tracked job {}: {}", jobId, cmdDescription);

		executor.submit(() -> {
			jobStore.updateStatus(jobId, "running");
			try {
				System.setProperty("DOCUMENTBURSTER_HOME", AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
				Settings.PORTABLE_EXECUTABLE_DIR_PATH = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
				DocumentBurster.execute(args);
				log.info("Tracked job completed: {} ({})", jobId, cmdDescription);
				jobStore.updateStatus(jobId, "done");
				messagingTemplate.convertAndSend(Constants.WS_TOPIC_EXECUTION_STATS,
						new WebSocketJobsExecutionStatsInfo("on.process.complete", 0));
			} catch (Throwable e) {
				log.error("Tracked job failed: {} ({}): {}", jobId, cmdDescription, e.getMessage(), e);
				jobStore.find(jobId).ifPresent(rec -> rec.resultMetadata.put("error", e.getMessage()));
				jobStore.updateStatus(jobId, "failed");
				WebSocketJobsExecutionStatsInfo info = new WebSocketJobsExecutionStatsInfo("on.process.failed");
				info.setExceptionMessage(e.getMessage());
				messagingTemplate.convertAndSend(Constants.WS_TOPIC_EXECUTION_STATS, info);
			}
		});
	}

	/**
	 * Execute a job asynchronously with a callback that runs after the job
	 * completes (before WebSocket notification). Used by PollScheduler for
	 * post-burst cleanup.
	 *
	 * @param args         CLI args
	 * @param onComplete   callback to run after job completes (success or failure), may be null
	 */
	public void executeAsync(String[] args, Runnable onComplete) {
		final String cmdDescription = String.join(" ", args);
		log.info("Submitting job: {}", cmdDescription);

		executor.submit(() -> {
			try {
				// Same code path as CLI (DocumentBurster.main) but without System.exit().
				// Logs "Program Started", runs the command, logs "Execution Ended", archives logs.
				System.setProperty("DOCUMENTBURSTER_HOME", AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
				Settings.PORTABLE_EXECUTABLE_DIR_PATH = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
				DocumentBurster.execute(args);
				log.info("Job completed: {}", cmdDescription);

				if (onComplete != null) {
					try {
						onComplete.run();
					} catch (Exception e) {
						log.warn("Post-completion callback failed for {}: {}", cmdDescription, e.getMessage());
					}
				}

				messagingTemplate.convertAndSend(Constants.WS_TOPIC_EXECUTION_STATS,
						new WebSocketJobsExecutionStatsInfo("on.process.complete", 0));
			} catch (Throwable e) {
				log.error("Job failed: {}: {}", cmdDescription, e.getMessage(), e);

				if (onComplete != null) {
					try {
						onComplete.run();
					} catch (Exception ex) {
						log.warn("Post-failure callback failed for {}: {}", cmdDescription, ex.getMessage());
					}
				}

				WebSocketJobsExecutionStatsInfo info = new WebSocketJobsExecutionStatsInfo("on.process.failed");
				info.setExceptionMessage(e.getMessage());
				messagingTemplate.convertAndSend(Constants.WS_TOPIC_EXECUTION_STATS, info);
			}
		});
	}
}
