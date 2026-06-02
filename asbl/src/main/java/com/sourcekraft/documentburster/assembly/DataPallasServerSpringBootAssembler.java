package com.sourcekraft.documentburster.assembly;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Collection;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.zeroturnaround.exec.ProcessExecutor;
import org.zeroturnaround.exec.stream.LogOutputStream;
import org.zeroturnaround.zip.ZipUtil;

public class DataPallasServerSpringBootAssembler extends AbstractAssembler {

	private String groovyCompilationLogs = StringUtils.EMPTY;

	private String dataPallasVerifyDirPath;

	public DataPallasServerSpringBootAssembler() {

		super("target/package/db-server", "target/package/verified-db-server", "target/datapallas-server.zip");

	}

	protected void compile() throws Exception {

		String npmRunCustomReleaseCommand = "npm run custom:release-web --force";

		new ProcessExecutor().directory(new File(Utils.getTopProjectFolderPath() + "/frend/reporting"))
				.command("cmd", "/c", npmRunCustomReleaseCommand).redirectOutput(new LogOutputStream() {
					@Override
					protected void processLine(String line) {
						System.out.println(line);
					}
				}).execute();

		System.out.println(
				"------------------------------------- DONE_01:DataPallasServer npm run custom:release-web --force) ... -------------------------------------");

	}

	protected void preparePackage() throws Exception {

		// copy all the already "verified" DataPallas files
		FileUtils.copyDirectory(new File(dataPallasVerifyDirPath + "/" + this.topFolderName),
				new File(packageDirPath + "/" + this.topFolderName));

		System.out.println(
				"------------------------------------- DONE_02:DataPallasServer copy all the already 'verified' DataPallas files ... -------------------------------------");

		// copy db-server template files and folders
		FileUtils.copyDirectory(new File("src/main/external-resources/db-server-template"),
				new File(packageDirPath + "/" + this.topFolderName));

		System.out.println(
				"------------------------------------- DONE_03:DataPallasServer copy db-server template files and folders ... -------------------------------------");

		// copy "frontent" web app (compiled)
		String frontEndFolderPath = packageDirPath + "/" + this.topFolderName + "/lib/frend";

		FileUtils.forceMkdir(new File(frontEndFolderPath));

		FileUtils.copyDirectory(new File(Utils.getTopProjectFolderPath() + "/frend/reporting/dist"),
				new File(frontEndFolderPath));

		System.out.println(
				"------------------------------------- DONE_04:DataPallasServer copy 'frontent' web app (compiled) ... -------------------------------------");

		// COMPILE / CHECK the groovy scripts don't give errors

		new ProcessExecutor().command("cmd", "/c", "java -cp " + packageDirPath + "/" + this.topFolderName
				+ "/lib/burst/ant-launcher.jar org.apache.tools.ant.launch.Launcher -buildfile bild-groovy.xml -DtopFolderName="
				+ this.topFolderName).redirectOutput(new LogOutputStream() {
					@Override
					protected void processLine(String line) {
						System.out.println(line);
						groovyCompilationLogs += line;
					}
				}).execute();

		if (groovyCompilationLogs.toUpperCase().contains("BUILD FAILED"))
			throw new Exception("Groovy Scripts COMPILATION FAILED");

		System.out.println(
				"------------------------------------- DONE_05:DataPallasServer COMPILE / CHECK the groovy scripts don't give errors ... -------------------------------------");

		FileUtils.moveFile(
				FileUtils.getFile(packageDirPath + "/" + this.topFolderName + "/scripts/batch/schedules.groovy"),
				FileUtils.getFile(
						packageDirPath + "/" + this.topFolderName + "/scripts/batch/schedules.groovy.example"));

		// END COMPILE groovy scripts

	}

	@Override
	public void verify() throws Exception {

		ZipUtil.unpack(new File(targetPathZipFile), new File(verifyDirPath));

		// copy all the already "verified" DataPallas files
		assertThat(Utils.dir1ContainsAllDir2Files(new File(verifyDirPath + "/" + this.topFolderName),
				new File(dataPallasVerifyDirPath + "/" + this.topFolderName))).isTrue();

		System.out.println(
				"------------------------------------- VERIFIED_02:DataPallasServer copy all the already 'verified' DataPallas files ... -------------------------------------");

		// copy db-server template files and folders
		assertThat(Utils.dir1ContainsAllDir2Files(new File(verifyDirPath + "/" + this.topFolderName),
				new File("src/main/external-resources/db-server-template"))).isTrue();

		System.out.println(
				"------------------------------------- VERIFIED_03:DataPallasServer db-server template files and folders ... -------------------------------------");

		// copy "frontent" web app (compiled)
		String content = FileUtils.readFileToString(
				new File(packageDirPath + "/" + this.topFolderName + "/lib/frend/index.html"), "UTF-8");

		// the compiled Angular app always bootstraps from the <app-root> element
		assertThat(content.contains("app-root")).isTrue();

		System.out.println(
				"------------------------------------- VERIFIED_04:DataPallasServer copy 'frontent' web app (compiled) ... -------------------------------------");

		// COMPILE / CHECK the groovy scripts don't give errors

		Collection<File> groovyScriptFiles = FileUtils.listFiles(
				new File(verifyDirPath + "/" + this.topFolderName + "/scripts"), new String[] { "groovy" }, true);

		assertThat(groovyScriptFiles.size() > 0).isTrue();

		// by default, after it was checked that it is compilable, have the
		// schedules.groovy to be only an "example" "schedules.groovy.example"
		assertThat(
				Files.exists(Paths.get(verifyDirPath + "/" + this.topFolderName + "/scripts/batch/schedules.groovy")))
				.isFalse();
		assertThat(Files.exists(
				Paths.get(verifyDirPath + "/" + this.topFolderName + "/scripts/batch/schedules.groovy.example")))
				.isTrue();

		System.out.println(
				"------------------------------------- VERIFIED_07:DataPallasServer CHECK the groovy scripts ... -------------------------------------");

		// END COMPILE groovy scripts

		// VERIFY ALL CUSTOM FILES

		// log4j.xml
		content = FileUtils.readFileToString(new File(verifyDirPath + "/" + this.topFolderName + "/log4j2.xml"),
				"UTF-8");

		assertThat(content).as("log4j2.xml should NOT contain 'rbsj-server.log'").doesNotContain("rbsj-server.log");

	}

	public void setdataPallasVerifyDirPath(String dataPallasVerifyDirPath) {
		this.dataPallasVerifyDirPath = dataPallasVerifyDirPath;
	}

}
