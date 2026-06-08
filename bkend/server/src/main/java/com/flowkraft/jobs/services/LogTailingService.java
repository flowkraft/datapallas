package com.flowkraft.jobs.services;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.commons.io.input.Tailer;
import org.apache.commons.io.input.TailerListenerAdapter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;
import com.flowkraft.jobs.models.FileInfo;
import com.flowkraft.jobs.models.WebSocketJobsExecutionStatsInfo;

@Service
public class LogTailingService {

	@Autowired
	private SimpMessageSendingOperations messagingTemplate;

	private Map<String, Tailer> existingTailers = new ConcurrentHashMap<>();

	// synchronized so a concurrent start/stop for the same file can't pass the
	// check-then-act below at the same time and spawn two tailer threads.
	public synchronized void startTailer(String fileName) {
		if (Objects.isNull(existingTailers.get(fileName))) {

			// Poll the log file every 250ms (matches the execution-stats cadence) so new
			// lines stream to the UI responsively, instead of the 1s Tailer default.
			Tailer tailer = new Tailer(new File(AppPaths.LOGS_DIR_PATH + "/" + fileName), new TailerListenerAdapter() {
				public void handle(String line) {

					boolean trimContent = false;

					List<FileInfo> logsTailInfo = new ArrayList<FileInfo>();
					logsTailInfo.add(new FileInfo(fileName, line, trimContent));

					WebSocketJobsExecutionStatsInfo tailMessageInfo = new WebSocketJobsExecutionStatsInfo("logs.tailer",
							logsTailInfo.stream());

					messagingTemplate.convertAndSend("/topic/tailer", tailMessageInfo);
				}
			}, 250);
			existingTailers.put(fileName, tailer);
			new Thread(tailer, "log-tailer-" + fileName).start();
		}
		// If already running, desired state is already achieved — idempotent no-op.
	}

	public synchronized void stopTailer(String fileName) {

		Tailer tailer = existingTailers.get(fileName);

		if (!Objects.isNull(tailer)) {
			tailer.stop();
			existingTailers.remove(fileName);
		}

	}

}
