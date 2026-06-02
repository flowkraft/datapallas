package com.flowkraft.system.services;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.io.PrintWriter;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;
import com.flowkraft.common.Utils;
import static com.sourcekraft.documentburster.utils.Utils.resolvePathAgainstPortableDir;
import com.flowkraft.system.dtos.ProcessOutputResultDto;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class ProcessService {

	public class ProcessOutput {
		public Stream<String> stdout;
		public Stream<String> stderr;
	}

	public Mono<ProcessOutputResultDto> spawn(List<String> args, Optional<String> cwdPath) throws Exception {
		List<String> commandWithShell = new ArrayList<>();
		String os = System.getProperty("os.name").toLowerCase();

		if (os.contains("win")) {
			commandWithShell.add("cmd.exe");
			commandWithShell.add("/c");
		} else if (os.contains("nix") || os.contains("nux") || os.contains("mac")) {
			commandWithShell.add("/bin/sh");
		}

		List<String> newArgs = new ArrayList<>();
		for (String arg : args) {
			String modifiedArg = arg.replace("PORTABLE_EXECUTABLE_DIR_PATH/",
					AppPaths.PORTABLE_EXECUTABLE_DIR_PATH.concat("/"));
			if (os.contains("nix") || os.contains("nux") || os.contains("mac")) {
				modifiedArg = modifiedArg.replace(".bat", ".sh");
			}
			newArgs.add(modifiedArg);
		}
		for (String part : commandWithShell) {
		}
		for (String part : newArgs) {
		}

		commandWithShell.addAll(newArgs);

		String workingDirectoryPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;

		if (cwdPath.isPresent()) {
			workingDirectoryPath = resolvePathAgainstPortableDir(
					URLDecoder.decode(cwdPath.get(), StandardCharsets.UTF_8.toString()));
		}

		ProcessBuilder processBuilder = new ProcessBuilder(commandWithShell);
		processBuilder.directory(new File(workingDirectoryPath));

		Process process = processBuilder.start();

		Flux<String> stdoutFlux = Flux.using(() -> new BufferedReader(new InputStreamReader(process.getInputStream())),
				reader -> Flux.fromStream(reader.lines()), Utils.uncheckedConsumer(BufferedReader::close));

		Flux<String> stderrFlux = Flux.using(() -> new BufferedReader(new InputStreamReader(process.getErrorStream())),
				reader -> Flux.fromStream(reader.lines()), Utils.uncheckedConsumer(BufferedReader::close));

		return Flux.merge(stdoutFlux, stderrFlux).collectList()
				.map(outputLines -> new ProcessOutputResultDto(process.exitValue() == 0, outputLines))
				.doOnTerminate(process::destroy);
	}

	public ProcessOutput execProcess(String command) throws Exception {
		Process process = Runtime.getRuntime().exec(command);

		PipedInputStream stdoutPipedInput = new PipedInputStream();
		PipedOutputStream stdoutPipedOutput = new PipedOutputStream(stdoutPipedInput);
		Thread stdoutThread = new Thread(() -> {
			BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
			PrintWriter writer = new PrintWriter(stdoutPipedOutput);
			reader.lines().forEach(writer::println);

		});

		PipedInputStream stderrPipedInput = new PipedInputStream();
		PipedOutputStream stderrPipedOutput = new PipedOutputStream(stderrPipedInput);
		Thread stderrThread = new Thread(() -> {
			BufferedReader reader = new BufferedReader(new InputStreamReader(process.getErrorStream()));
			PrintWriter writer = new PrintWriter(stderrPipedOutput);
			reader.lines().forEach(writer::println);

		});

		stdoutThread.start();
		stderrThread.start();

		ProcessOutput output = new ProcessOutput();
		output.stdout = new BufferedReader(new InputStreamReader(stdoutPipedInput)).lines();
		output.stderr = new BufferedReader(new InputStreamReader(stderrPipedInput)).lines();
		return output;
	}

	public Mono<ProcessOutputResultDto> installChocolatey() throws Exception {

		String INSTALL_CHOCOLATEY_SCRIPT_CONTENT = "@echo off\n" + "\n" + "SET DIR=%~dp0%\n" + "    \n"
				+ "::download install.ps1\n"
				+ "%systemroot%/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"((new-object net.webclient).DownloadFile('https://chocolatey.org/install.ps1','%DIR%install.ps1'))\"\n"
				+ "::run installer\n"
				+ "%systemroot%/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"& '%DIR%install.ps1' %*\"\n"
				+ "del /f /s install.ps1\n";

		java.nio.file.Path scriptFilePath = Paths.get("/temp/installChocolatey.cmd");
		Files.write(scriptFilePath, INSTALL_CHOCOLATEY_SCRIPT_CONTENT.getBytes());

		String elevatedScriptFilePath = getCommandReadyToBeRunAsAdministratorUsingBatchCmd(
				"CALL " + scriptFilePath.toString());

		List<String> commands = Arrays.asList("cmd.exe", "/c", elevatedScriptFilePath);
		return spawn(commands, Optional.empty());

	}

	public Mono<ProcessOutputResultDto> unInstallChocolatey() throws Exception {

		String elevatedScriptFilePath = getCommandReadyToBeRunAsAdministratorUsingBatchCmd(
				"& ../tools/chocolatey/uninstall.ps1");

		List<String> commands = Arrays.asList("cmd.exe", "/c", elevatedScriptFilePath);
		return spawn(commands, Optional.empty());

	}

	private String getCommandReadyToBeRunAsAdministratorUsingBatchCmd(String commandToElevate) throws Exception {
		File tempFile = File.createTempFile("elevated-batch-cmd-script", ".cmd", new File("/temp/"));
		String elevatedScriptFilePath = tempFile.getAbsolutePath();

		String bashLogPath = resolvePathAgainstPortableDir("logs/bash.service.log");
		String scriptContent = "::::::::::::::::::::::::::::::::::::::::::::\n" + ":: Elevate.cmd - Version 4\n"
				+ ":: Automatically check & get admin rights\n"
				+ ":: see \"https://stackoverflow.com/a/12264592/1016343\" for description\n"
				+ "::::::::::::::::::::::::::::::::::::::::::::\n" + " @echo off\n" + " CLS\n" + " ECHO.\n"
				+ " ECHO =============================\n" + " ECHO Please wait... Running '" + commandToElevate
				+ "' as Admin...\n" + " ECHO =============================\n" + ":init\n"
				+ " setlocal DisableDelayedExpansion\n" + " set cmdInvoke=0\n" + " set winSysFolder=System32\n"
				+ " set \"batchPath=%~0\"\n" + " for %%k in (%0) do set batchName=%%~nk\n"
				+ " set \"vbsGetPrivileges=%temp%/OEgetPriv_%batchName%.vbs\"\n" + " setlocal EnableDelayedExpansion\n"
				+ ":checkPrivileges\n" + "  NET FILE 1>NUL 2>NUL\n"
				+ "  if '%errorlevel%' == '0' ( goto gotPrivileges ) else ( goto getPrivileges )\n" + ":getPrivileges\n"
				+ "  if '%1'=='ELEV' (echo ELEV & shift /1 & goto gotPrivileges)\n" + "  ECHO.\n"
				+ "  ECHO **************************************\n" + "  ECHO Invoking UAC for Privilege Escalation\n"
				+ "  ECHO **************************************\n"
				+ "  ECHO Set UAC = CreateObject^(\"Shell.Application\"^) > \"%vbsGetPrivileges%\"\n"
				+ "  ECHO args = \"ELEV \" >> \"%vbsGetPrivileges%\"\n"
				+ "  ECHO For Each strArg in WScript.Arguments >> \"%vbsGetPrivileges%\"\n"
				+ "  ECHO args = args ^& strArg ^& \" \"  >> \"%vbsGetPrivileges%\"\n"
				+ "  ECHO Next >> \"%vbsGetPrivileges%\"\n" + "  if '%cmdInvoke%'=='1' goto InvokeCmd\n"
				+ "  ECHO UAC.ShellExecute \"!batchPath!\", args, \"\", \"runas\", 1 >> \"%vbsGetPrivileges%\"\n"
				+ "  goto ExecElevation\n" + ":InvokeCmd\n"
				+ "  ECHO args = \"/c \"\"\" + \"!batchPath!\" + \"\"\" \" + args >> \"%vbsGetPrivileges%\"\n"
				+ "  ECHO UAC.ShellExecute \"%SystemRoot%/%winSysFolder%/cmd.exe\", args, \"\", \"runas\", 1 >> \"%vbsGetPrivileges%\"\n"
				+ ":ExecElevation\n" + " \"%SystemRoot%/%winSysFolder%/WScript.exe\" \"%vbsGetPrivileges%\" %*\n"
				+ " exit /B\n" + ":gotPrivileges\n" + " setlocal & cd /d %~dp0\n"
				+ " if '%1'=='ELEV' (del \"%vbsGetPrivileges%\" 1>nul 2>nul  &  shift /1)\n"
				+ "::::::::::::::::::::::::\n" + "::START\n" + "::::::::::::::::::::::::\n"
				+ " REM Run shell as admin (example) - put here code as you like\n" + " " + commandToElevate
				+ " 2>&1 >> " + bashLogPath + "\n"
				+ " del /f /s *.cmd 2>&1 >> " + bashLogPath + "\n"
				+ " cmd /k\n";

		Files.write(Paths.get(elevatedScriptFilePath), scriptContent.getBytes());

		return elevatedScriptFilePath;
	}

}
