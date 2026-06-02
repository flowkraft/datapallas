package com.flowkraft.starterpacks.controllers;

import com.flowkraft.starterpacks.dtos.ExecuteCommandRequestDto;
import com.flowkraft.starterpacks.dtos.ExecuteCommandResponseDto;
import com.flowkraft.starterpacks.services.StarterPacksManagementService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Mono;

import jakarta.validation.Valid;

/**
 * Controller for managing Starter Packs (databases, apps).
 * Delegates command execution to ServicesManager via StarterPacksManagementService.
 */
@RestController
@RequestMapping(value = "/api/system/services",
		produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
public class StarterPacksController {

	private static final Logger log = LoggerFactory.getLogger(StarterPacksController.class);

	private final StarterPacksManagementService starterPacksManagementService;

	@Autowired
	public StarterPacksController(StarterPacksManagementService starterPacksManagementService) {
		this.starterPacksManagementService = starterPacksManagementService;
	}

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
