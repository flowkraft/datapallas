package com.flowkraft;

import org.springframework.boot.ExitCodeGenerator;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@ComponentScan(basePackages = "com.flowkraft")
public class ServerApplication implements ExitCodeGenerator {

    private static int exitCode;

    public static void main(String[] args) {

        // SERVE_WEB is the SINGLE source of truth
        // Check BOTH: JVM property -DSERVE_WEB=true (for Maven spring-boot:run) 
        // AND environment variable (for .bat/.sh scripts)
        // This works 100% reliably across all platforms
        String serveWebProp = System.getProperty("SERVE_WEB");
        String serveWebEnv = System.getenv("SERVE_WEB");
        boolean serveWeb = "true".equalsIgnoreCase(serveWebProp) || "true".equalsIgnoreCase(serveWebEnv);

        SpringApplicationBuilder appBuilder = new SpringApplicationBuilder(ServerApplication.class);
        final long pid = getPid();

        if (!serveWeb) {
            System.out.println("Started ServerApplication with PID " + pid + " serveWeb=false");
            appBuilder.web(WebApplicationType.NONE);
            exitCode = SpringApplication.exit(appBuilder.run(args));
        } else {
            appBuilder.web(WebApplicationType.SERVLET);
            appBuilder.listeners(event -> {
                if (event instanceof org.springframework.boot.context.event.ApplicationReadyEvent) {
                    System.out.println("Started ServerApplication with PID " + pid + " serveWeb=true");
                }
            });
            appBuilder.run(args);
        }

        // Deliberately NOT disabling spring.devtools.restart here. DevTools is declared
        // <optional>/<runtime>, and the Spring Boot Maven plugin leaves it out of the packaged
        // rb-server.jar, so in a shipped DataPallas it is not on the classpath at all and there
        // is nothing to switch off. The only thing the old line did was kill the dev restart
        // loop: with it gone, a recompiled class under bkend/server/target/classes restarts the
        // context in a few seconds instead of needing a full rebuild of the dev server.
    }

    private static long getPid() {
        try {
            return ProcessHandle.current().pid();
        } catch (Throwable t) {
            return -1;
        }
    }

    @Override
    public int getExitCode() {
        return exitCode;
    }
}