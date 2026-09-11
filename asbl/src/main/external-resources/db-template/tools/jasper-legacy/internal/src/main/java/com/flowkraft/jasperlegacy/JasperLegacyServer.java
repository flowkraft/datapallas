package com.flowkraft.jasperlegacy;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * REST face of {@link JasperLegacyEngine} — the same renderer the CLI uses,
 * reached over HTTP instead of through a container start.
 *
 * Started by docker-compose (startJasperLegacyServer.bat / .sh); the image's
 * default entrypoint remains the CLI.
 */
@SpringBootApplication
public class JasperLegacyServer {

	public static void main(String[] args) {
		SpringApplication.run(JasperLegacyServer.class, args);
	}
}
