package com.flowkraft.starterpacks.services;

import com.flowkraft.starterpacks.dtos.ExecuteCommandResponseDto;
import com.sourcekraft.documentburster.MainProgram;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Executes starter pack commands by calling MainProgram.execute() —
 * the exact same code path as running DataPallas.bat from the CLI.
 *
 * MainProgram (picocli) → ServiceCommand.call() → CliJob.doService()
 *   → _createJobFile() (drives WebSocket progress tracking)
 *   → ServicesManager.execute() (runs Docker commands)
 *   → _deleteJobFile()
 *
 * BLOCKING: The HTTP response waits for the command to complete,
 * matching the old ProcessService.spawn() behavior exactly.
 * Runs on a dedicated thread pool to avoid reactor thread interruption.
 */
@Service
public class StarterPacksManagementService {

    private static final Logger log = LoggerFactory.getLogger(StarterPacksManagementService.class);

    // Dedicated thread pool — commands block for minutes (docker compose up + wait for DB ready).
    // Must NOT run on reactor threads (they get interrupted → InterruptedException).
    private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "starter-pack-cmd");
        t.setDaemon(true);
        return t;
    });

    /**
     * Execute a starter pack command. Blocks until the command completes,
     * matching the old shellService.runBatFile() → ProcessService.spawn() behavior.
     *
     * The command string uses the same format as the CLI:
     *   "system service database start northwind postgres 5432"
     *
     * If the "system service" prefix is missing, it's prepended automatically.
     */
    public Mono<ExecuteCommandResponseDto> executeCommand(String command) {
        log.info("Executing command: {}", command);

        String cleanCommand = command.trim();
        if (cleanCommand.isEmpty()) {
            return Mono.just(new ExecuteCommandResponseDto("Error: empty command.", "error"));
        }

        // Ensure "system service" prefix — ServiceCommand lives under SystemCommand since B5+B6
        if (!cleanCommand.toLowerCase().startsWith("system service ")) {
            cleanCommand = "system service " + cleanCommand;
        }

        // Split into args array for MainProgram.execute() — same as DataPallas.bat
        final String[] args = cleanCommand.split("\\s+");
        final String cmd = command;

        // Commands that complete quickly (custom seed scripts) run synchronously —
        // the HTTP response blocks until the script finishes, giving the frontend
        // a clean completion signal.
        // Long-running commands (docker compose start/stop) run async and return
        // "pending" immediately — the frontend polls Docker status for actual state.
        if (cleanCommand.contains("run-custom-seed")) {
            return Mono.fromCallable(() -> {
                // Capture stdout + stderr so Groovy errors reach the frontend
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                java.io.PrintStream capture = new java.io.PrintStream(baos);
                java.io.PrintStream origOut = System.out;
                java.io.PrintStream origErr = System.err;
                try {
                    System.setOut(capture);
                    System.setErr(capture);
                    new MainProgram().execute(args);
                    String output = baos.toString().trim();
                    log.info("Command completed: {}", cmd);
                    return new ExecuteCommandResponseDto(
                            output.isEmpty() ? "Custom seed script completed" : output, "ok");
                } catch (Throwable e) {
                    String output = baos.toString().trim();
                    log.error("Command failed: {}", e.getMessage(), e);
                    String msg = output.isEmpty() ? e.getMessage() : output;
                    return new ExecuteCommandResponseDto("Error: " + msg, "error");
                } finally {
                    System.setOut(origOut);
                    System.setErr(origErr);
                }
            }).subscribeOn(Schedulers.boundedElastic());
        }

        // Async: returns immediately with "pending" for long-running commands (docker compose).
        // The frontend polls /system/services/status for actual state.
        executor.submit(() -> {
            try {
                new MainProgram().execute(args);
                log.info("Command completed: {}", cmd);
            } catch (Throwable e) {
                log.error("Command failed: {}", e.getMessage(), e);
            }
        });

        return Mono.just(new ExecuteCommandResponseDto("Executing: " + cmd, "pending"));
    }
}
