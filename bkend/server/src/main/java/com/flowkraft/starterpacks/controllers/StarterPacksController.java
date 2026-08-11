package com.flowkraft.starterpacks.controllers;

import com.flowkraft.starterpacks.dtos.ExecuteCommandRequestDto;
import com.flowkraft.starterpacks.dtos.ExecuteCommandResponseDto;
import com.flowkraft.starterpacks.services.StarterPacksManagementService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Mono;

import jakarta.validation.Valid;

/**
 * Controller for managing Starter Packs (databases, apps).
 * Delegates command execution to ServicesManager via StarterPacksManagementService.
 *
 * <p>{@code REPORT_AUTHOR}, because starting these is part of authoring rather than a favour an
 * administrator does for you. The AI Hub is where dashboards get built and the starter packs are the
 * sample databases reports are written against — an author who cannot start either has to file a
 * request before they can begin work, every time.
 *
 * <p>This does hand an author docker-compose, which runs containers with volume mounts into the
 * installation. That is a smaller step than it sounds: the same role already writes Groovy,
 * FreeMarker and JasperReports content that this server executes unsandboxed, so an author is a
 * trusted operator inside their tenant no matter what this annotation says (see {@code Role}). The
 * boundary that contains them is the tenant's process and installation directory, not this line.
 */
@RestController
@PreAuthorize("hasRole('REPORT_AUTHOR')")
@RequestMapping(value = "/api/system/services",
		produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
public class StarterPacksController {

	private static final Logger log = LoggerFactory.getLogger(StarterPacksController.class);

	private final StarterPacksManagementService starterPacksManagementService;

	@Autowired
	public StarterPacksController(StarterPacksManagementService starterPacksManagementService) {
		this.starterPacksManagementService = starterPacksManagementService;
	}

	/**
	 * Drives docker-compose lifecycle commands: starting and stopping the apps and starter packs an
	 * author works with. See the class note for why this is {@code REPORT_AUTHOR} and not {@code ADMIN}.
	 */
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PostMapping("/execute")
	public Mono<ResponseEntity<ExecuteCommandResponseDto>> executeStarterPackCommand(
			@Valid @RequestBody ExecuteCommandRequestDto request) {
		log.info("Received starter pack command: [{}]", request.getCommand());

		if (request.getCommand() == null || request.getCommand().trim().isEmpty()) {
			log.warn("Received empty command in execute request.");
			return Mono.just(ResponseEntity.badRequest()
					.body(new ExecuteCommandResponseDto("Error: Command cannot be empty.", "error")));
		}

		return starterPacksManagementService.executeCommand(request.getCommand()).map(response -> {
			log.info("Command result: status={}, output='{}'", response.getStatus(), response.getOutput());
			return ResponseEntity.ok(response);
		});
	}
}
