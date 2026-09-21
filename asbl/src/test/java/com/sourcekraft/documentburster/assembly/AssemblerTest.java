package com.sourcekraft.documentburster.assembly;

import org.junit.Test;
import org.zeroturnaround.exec.ProcessExecutor;
import org.zeroturnaround.exec.stream.LogOutputStream;

public class AssemblerTest {

	// trying to follow Maven's Build Lifecycle
	// https://maven.apache.org/guides/introduction/introduction-to-the-lifecycle.html
	public void doAdHoc() throws Exception {

		new ProcessExecutor().command("cmd", "/c",
				"java -cp target/package/db/DataPallas/lib/burst/ant-launcher.jar org.apache.tools.ant.launch.Launcher -buildfile bild-groovy.xml")
				.redirectOutput(new LogOutputStream() {
					@Override
					protected void processLine(String line) {
						System.out.println(line);
					}
				}).execute();

	}

	@Test
	public void assembleDataPallasAndDataPallasServer() throws Exception {

		AbstractAssembler e2eAssembler = new NoExeAssembler();

		e2eAssembler.assemble();
		e2eAssembler.verify();

		System.out.println(
				"------------------------------------- FINISHED Assembler:NoExeAssembler ... -------------------------------------");

		AbstractAssembler rbAssembler = new DataPallasAssembler();
		((DataPallasAssembler) rbAssembler).setE2EVerifyDirPath(e2eAssembler.getVerifyDirPath());

		rbAssembler.assemble();
		rbAssembler.verify();
		rbAssembler.install();

		System.out.println(
				"------------------------------------- FINISHED Assembler:DataPallasAssembler ... -------------------------------------");

		AbstractAssembler rbServerAssembler = new DataPallasServerSpringBootAssembler();

		((DataPallasServerSpringBootAssembler) rbServerAssembler)
				.setdataPallasVerifyDirPath(rbAssembler.getVerifyDirPath());

		rbServerAssembler.assemble();
		rbServerAssembler.verify();
		rbServerAssembler.install();

		System.out.println(
				"------------------------------------- FINISHED Assembler:DataPallasServerSpringBootAssembler ... -------------------------------------");

		// Build a Docker image from the project root (requires docker daemon available)
		AbstractAssembler dockerAssembler = new DockerAssembler();
		dockerAssembler.assemble();
		dockerAssembler.verify();
		dockerAssembler.install();
		
		System.out.println(
				"------------------------------------- FINISHED Assembler:DockerAssembler ... -------------------------------------");
		
		AbstractAssembler rbSourceAssembler = new DataPallasSourceAssembler();
		
		rbSourceAssembler.assemble();
		rbSourceAssembler.verify();
		rbSourceAssembler.install();

		System.out.println(
				"------------------------------------- FINISHED Assembler:DataPallasSourceAssembler ... -------------------------------------");

	}

	// Linux CI (asbl/ci/dp-ci.sh): the same chain as assembleDataPallasAndDataPallasServer minus
	// DataPallasAssembler, whose DataPallas.exe can only be built on Windows. The server package is
	// assembled from the NoExe package instead.
	@Test
	public void assembleDataPallasServerLinux() throws Exception {

		AbstractAssembler e2eAssembler = new NoExeAssembler();

		e2eAssembler.assemble();
		e2eAssembler.verify();

		System.out.println(
				"------------------------------------- FINISHED Assembler:NoExeAssembler ... -------------------------------------");

		AbstractAssembler rbServerAssembler = new DataPallasServerSpringBootAssembler();

		((DataPallasServerSpringBootAssembler) rbServerAssembler)
				.setdataPallasVerifyDirPath(e2eAssembler.getVerifyDirPath());

		rbServerAssembler.assemble();
		rbServerAssembler.verify();
		rbServerAssembler.install();

		System.out.println(
				"------------------------------------- FINISHED Assembler:DataPallasServerSpringBootAssembler ... -------------------------------------");

		AbstractAssembler dockerAssembler = new DockerAssembler();
		dockerAssembler.assemble();
		dockerAssembler.verify();
		dockerAssembler.install();

		System.out.println(
				"------------------------------------- FINISHED Assembler:DockerAssembler ... -------------------------------------");

	}

	@Test
	public void prepareForE2E() throws Exception {

		AbstractAssembler e2eAssembler = new NoExeAssembler();

		e2eAssembler.assemble();
		e2eAssembler.verify();

		System.out.println(
				"------------------------------------- FINISHED Assembler:E2ENoExeAssembler ... -------------------------------------");

	}

}
