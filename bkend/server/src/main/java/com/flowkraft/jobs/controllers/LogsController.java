package com.flowkraft.jobs.controllers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.jobs.models.FileInfo;
import com.flowkraft.jobs.models.TailCommandInfo;
import com.flowkraft.jobs.services.LogTailingService;
import com.flowkraft.jobs.services.LogsService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping(value = "/api/jobs", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
public class LogsController {

	private static final Logger log = LoggerFactory.getLogger(LogsController.class);

	@Autowired
	LogsService logsService;

	@Autowired
	LogTailingService logTailingService;

	@GetMapping("/logs")
	public Flux<FileInfo> logs() throws Exception {

		return Flux.fromStream(logsService.ls());

	}

	@PostMapping("/logs/tailer")
	public Mono<ResponseEntity<Void>> tail(@RequestBody TailCommandInfo tailCommandInfo) {

		//System.out.println("tailCommandInfo.fileName = " + tailCommandInfo.fileName);
		//System.out.println("tailCommandInfo.command = " + tailCommandInfo.command);

		if (tailCommandInfo.command.equals("start"))
			logTailingService.startTailer(tailCommandInfo.fileName);
		else
			// if (info.equals("stop"))
			logTailingService.stopTailer(tailCommandInfo.fileName);

		return Mono.just(new ResponseEntity<Void>(HttpStatus.OK));
	}

	@DeleteMapping(value = "/logs/{logFileName}", consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Void>> clearLogs(@PathVariable String logFileName) throws Exception {

		//System.out.println("Controller clearLogs: " + logFileName);

		logsService.clearLogs(logFileName);
		return Mono.just(new ResponseEntity<Void>(HttpStatus.OK));

	}

}
