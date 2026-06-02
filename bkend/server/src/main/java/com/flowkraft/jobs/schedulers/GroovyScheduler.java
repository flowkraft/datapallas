package com.flowkraft.jobs.schedulers;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Paths;

import jakarta.annotation.PostConstruct;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;
import com.sourcekraft.documentburster.utils.Utils;

import groovy.lang.Binding;
import groovy.util.GroovyScriptEngine;

@Service
public class GroovyScheduler {

	@Value("${POLLING_PATH:}")
	private String pollingPath;

	@PostConstruct
	public void init() throws Exception {

		if (!StringUtils.isBlank(pollingPath)) {

			File pollDir = new File(pollingPath);
			if (!pollDir.exists()) {
				pollDir.mkdirs();
			}

			File pollDirReceived = new File(pollingPath + "/received");
			if (!pollDirReceived.exists()) {
				pollDirReceived.mkdirs();
			}

			String scriptsFolderPath = Utils.resolvePathAgainstPortableDir("scripts/batch/");

			String scriptName = "schedules.groovy";

			String scriptPath = Paths.get(scriptsFolderPath, scriptName).toString();

			if (Files.exists(Paths.get(scriptPath))) {

				Binding binding = new Binding();
				binding.setVariable("PORTABLE_EXECUTABLE_DIR_PATH", AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
				binding.setVariable("POLLING_PATH", pollingPath);

				GroovyScriptEngine gse = new GroovyScriptEngine(new String[] { scriptsFolderPath });

				gse.run(scriptName, binding);
			}
		}
	}
}