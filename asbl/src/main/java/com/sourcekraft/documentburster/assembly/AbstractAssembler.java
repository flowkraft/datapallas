package com.sourcekraft.documentburster.assembly;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;

import org.apache.commons.lang3.StringUtils;
import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.zeroturnaround.zip.ZipUtil;

public abstract class AbstractAssembler {

	protected String topFolderName;

	protected String verifyDirPath;

	protected String packageDirPath;
	protected String targetPathZipFile;

	public AbstractAssembler(String packageDirPath, String verifyDirPath, String targetPathZipFile) {
		this.packageDirPath = packageDirPath;
		this.verifyDirPath = verifyDirPath;
		this.targetPathZipFile = targetPathZipFile;
	}

	public abstract void verify() throws Exception;

	protected abstract void compile() throws Exception;

	protected abstract void preparePackage() throws Exception;

	private void _initialize() throws Exception {

		// clean / prepare stuff
		if (StringUtils.isNotEmpty(targetPathZipFile)) {

			FileUtils.deleteQuietly(new File(targetPathZipFile));
			assertThat(new File(targetPathZipFile).exists()).isFalse();

			String zipFilePath = "dist/" + FilenameUtils.getName(targetPathZipFile);

			FileUtils.deleteQuietly(new File(zipFilePath));
			assertThat(new File(zipFilePath).exists()).isFalse();
		}

		FileUtils.deleteQuietly(new File(packageDirPath));
		assertThat(new File(packageDirPath).exists()).isFalse();

		FileUtils.deleteQuietly(new File(verifyDirPath));
		assertThat(new File(verifyDirPath).exists()).isFalse();

		this.topFolderName = Utils.getInstallationTopFolderName();

		FileUtils.forceMkdir(new File(packageDirPath + "/" + this.topFolderName));
		assertThat(new File(packageDirPath + "/" + this.topFolderName).exists()).isTrue();

		System.out.println(
				"------------------------------------- DONE_00:AbstractAssembler _initiallize () packageDirPath: '"
						+ packageDirPath + "' ... -------------------------------------");

	}

	// trying to follow Maven's Build Lifecycle
	// https://maven.apache.org/guides/introduction/introduction-to-the-lifecycle.html
	public void assemble() throws Exception {

		_initialize();

		// clean compile and generate jars +
		// output documentation files
		compile();

		// copy jars + dependencies jars + all other needed files +
		// do modify / prepare the files as needed
		preparePackage();

		// package the zip file
		_packageZip();

	}

	// assemble() without compile(). The dev server hot-reloads its CODE from the sources, but its
	// CONTENT -- samples, templates, scripts, the whole db-template tree -- only exists once it has
	// been packaged, because preparePackage() is what writes each sample its settings.xml and
	// reporting.xml. Rebuilding the jars to pick up a changed .groovy or .html is half an hour of
	// waiting for nothing, so this runs the packaging on the jars that are already built. Nothing in
	// a release calls it: assemble() is untouched and stays the only way a shipped package is made.
	public void assembleContentOnly() throws Exception {

		_initialize();

		preparePackage();

	}

	public void install() throws Exception {

		FileUtils.moveFile(new File(targetPathZipFile), new File("dist/" + FilenameUtils.getName(targetPathZipFile)));
		System.out.println("------------------------------------- DONE:AbstractAssembler install() targetPathZipFile '"
				+ targetPathZipFile + "' 'dist/" + FilenameUtils.getName(targetPathZipFile)
				+ "' ... -------------------------------------");

	};

	private void _packageZip() throws Exception {

		if (StringUtils.isNotEmpty(targetPathZipFile)) {
			ZipUtil.pack(new File(packageDirPath), new File(targetPathZipFile));
			System.out.println(
					"------------------------------------- DONE:AbstractAssembler packageZip() packageDirPath '"
							+ packageDirPath + "' targetPathZipFile '" + targetPathZipFile
							+ "' ... -------------------------------------");
		}
	}

	public String getVerifyDirPath() {
		return verifyDirPath;
	}

}
