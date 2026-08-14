package com.flowkraft.jobs.schedulers;

import jakarta.annotation.PostConstruct;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ExitCodeGenerator;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.flowkraft.common.Constants;
import com.flowkraft.jobs.models.WebSocketJobsExecutionStatsInfo;
import com.flowkraft.jobs.services.JobsService;
import com.flowkraft.jobs.services.LogsService;

@Component
public class JobManScheduler {

	@Value("${ELECTRON_PID:}")
	private String parentElectronPid;

	@Autowired
	JobsService jobsService;

	@Autowired
	LogsService logsService;

	@Autowired
	private SimpMessageSendingOperations messagingTemplate;

	private final ConfigurableApplicationContext context;

	public JobManScheduler(ConfigurableApplicationContext context) {
		this.context = context;
	}

	/**
	 * Stop the server once the DataPallas.exe (Electron) that started it is gone.
	 *
	 * <p>This is the only thing that ends the server process, so it is deliberately the cheapest and
	 * most reliable check available: {@link ProcessHandle} asks the operating system directly, with no
	 * child process to spawn, no streams to drain and nothing that can block. A watchdog that shells
	 * out several times a second is a watchdog that eventually hangs — and a hung one leaves an
	 * orphaned server holding the installation's files and its port for as long as the machine stays
	 * on.
	 *
	 * <p>It runs on its own schedule rather than alongside the statistics push so that a slow push can
	 * never delay shutdown.
	 */
	@Scheduled(fixedRate = 1000)
	public void stopServerWhenTheDesktopIsClosed() {

		if (StringUtils.isBlank(parentElectronPid))
			return;

		long pid = Long.parseLong(parentElectronPid);

		if (ProcessHandle.of(pid).filter(ProcessHandle::isAlive).isPresent())
			return;

		int exitCode = SpringApplication.exit(this.context, (ExitCodeGenerator) () -> 0);
		System.exit(exitCode);
	}

	@Scheduled(fixedRate = 250)
	public void publishExecutionStatsDetailsToWebSocket() throws Exception {

		WebSocketJobsExecutionStatsInfo execStatsMessageInfo = new WebSocketJobsExecutionStatsInfo("stats.jobs",
				jobsService.fetchStats());

		messagingTemplate.convertAndSend(Constants.WS_TOPIC_EXECUTION_STATS, execStatsMessageInfo);

		execStatsMessageInfo = new WebSocketJobsExecutionStatsInfo("stats.logs", logsService.ls());
		messagingTemplate.convertAndSend(Constants.WS_TOPIC_EXECUTION_STATS, execStatsMessageInfo);

	}

	@PostConstruct
	public void killAnyHangedElectronProcesses() throws Exception {
		// this code makes sense only if the SpringBoot server was initiated from
		// DataPallas.exe

		/*
		 * if (StringUtils.isNotBlank(parentElectronPid)) {
		 * 
		 * String parentElectronCreationDate =
		 * Utils.getProcessCreationDate(Long.parseLong(parentElectronPid));
		 * 
		 * List<Long> pIDs =
		 * Utils.getPidsOfProcessesOfExecutableRunning("DataPallas.exe"); if
		 * (pIDs.size() > 0) { for (Long pid : pIDs) {
		 * 
		 * String processCreationDate = Utils.getProcessCreationDate(pid);
		 * 
		 * // kill all "hanged" DataPallas.exe but make sure the current "parent" //
		 * DataPallas.exe which // triggered the server is not killed also if
		 * (!processCreationDate.equals(parentElectronCreationDate)) { boolean
		 * isRunning; do { System.out.println(
		 * "rbsj.JobManScheduler.killAnyHangedElectronProcesses() - Attempting to kill 'hanged' DataPallas.exe process having PID "
		 * + pid);
		 * 
		 * Process killProcess = Runtime.getRuntime().exec("taskkill /F /PID " + pid);
		 * BufferedReader killReader = new BufferedReader( new
		 * InputStreamReader(killProcess.getErrorStream())); String killLine; boolean
		 * accessDenied = false; while ((killLine = killReader.readLine()) != null) { if
		 * (killLine.contains("Access is denied")) { accessDenied = true;
		 * System.out.println("Warning: Unable to kill process with PID: " + pid +
		 * " due to insufficient permissions."); break; } } if (accessDenied) { break; }
		 * 
		 * // Check if the process is still running Process process =
		 * Runtime.getRuntime().exec("cmd /c tasklist /FI \"PID eq " + pid + "\"");
		 * BufferedReader reader = new BufferedReader(new
		 * InputStreamReader(process.getInputStream())); String line; isRunning = false;
		 * while ((line = reader.readLine()) != null) { if (line.contains(" " + pid +
		 * " ")) { Thread.sleep(1000); isRunning = true; } } } while (isRunning); } } }
		 * }
		 */
	}
}
