package com.flowkraft.common;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.lang.management.ManagementFactory;
import java.lang.management.RuntimeMXBean;
import java.net.URLEncoder;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Consumer;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.io.filefilter.FileFilterUtils;
import org.apache.commons.io.filefilter.IOFileFilter;
import org.apache.commons.lang3.StringUtils;
import org.apache.tools.ant.DirectoryScanner;
import org.apache.tools.ant.types.FileSet;

import com.flowkraft.jobs.models.FileInfo;

public class Utils {

	@FunctionalInterface
	public interface CheckedConsumer<T> {
		void accept(T t) throws Exception;
	}

	public static <T> Consumer<T> uncheckedConsumer(CheckedConsumer<T> consumer) {
		return t -> {
			try {
				consumer.accept(t);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		};
	}

	public interface CallBackMethod<T extends Object> {
		void handle(T input) throws Exception;
	}

	public static IOFileFilter filesWhichCanBeProcessedFilter = FileFilterUtils.asFileFilter((file) -> {

		String lowerCaseFileName = file.getName().toLowerCase();
		String extension = FilenameUtils.getExtension(lowerCaseFileName);
		return extension.equals("pdf") || extension.equals("xls") || extension.equals("xlsx");

	});

	public static void emptyFile(String filePath) throws Exception {
		FileUtils.write(new File(filePath), "", Charset.defaultCharset());
	}

	public static String encodeURIComponent(String s) throws Exception {

		return URLEncoder.encode(s, "UTF-8").replaceAll("\\+", "%20").replaceAll("\\%21", "!").replaceAll("\\%27", "'")
				.replaceAll("\\%28", "(").replaceAll("\\%29", ")").replaceAll("\\%7E", "~");

	}

	public static String getProductName() {

		if ((new File("startServer.bat").exists()) || (new File("startServer.sh").exists()))
			return Constants.SERVER_DB_NAME;
		else
			return Constants.DB_NAME;

	}

	/**
	 * The product's key on the products server — the same value the licence client
	 * sends, so both halves ask about the same thing.
	 *
	 * <p>
	 * Kept identical to {@code documentburster.utils.Utils.getProductPermalink()};
	 * see that one for why these are {@code datapallas*} and not
	 * {@code documentburster*}.
	 */
	public static String getProductPermalink() {

		if ((new File("startServer.bat").exists()) || (new File("startServer.sh").exists()))
			return "datapallas-server";
		else
			return "datapallas";

	}

	public static List<FileInfo> getFilesToProcess(String transactionId, String folderPath) {

		FileSet fs = new FileSet();

		fs.setDir(new File(folderPath));
		fs.setIncludes(transactionId + "/*.*");

		DirectoryScanner ds = fs.getDirectoryScanner(Ant.proj);

		List<String> dsFiles = Arrays.asList(ds.getIncludedFiles());

		List<FileInfo> filesToProcess = new ArrayList<FileInfo>();

		dsFiles.forEach(fName -> {
			FileInfo fileInfo = new FileInfo(fName, StringUtils.EMPTY, false);
			fileInfo.filePath = folderPath + "/" + fName;
			filesToProcess.add(fileInfo);
		});

		return filesToProcess;

	}

	public static String getJvmArgumentValue(String argumentId) {
		String value = StringUtils.EMPTY;
		RuntimeMXBean runtimeMxBean = ManagementFactory.getRuntimeMXBean();
		for (String argument : runtimeMxBean.getInputArguments()) {
			// System.out.println("jvmArgument = " + argument);
			if (StringUtils.isBlank(value) && argument.startsWith(argumentId)) {
				value = argument.substring(argumentId.length());
			}
		}
		return value;
	}

	public static List<Long> getPidsOfProcessesOfExecutableRunning(String executableName) throws Exception {
		List<Long> pids = new ArrayList<>();
		ProcessBuilder processBuilder = new ProcessBuilder("wmic", "process", "where",
				"(ExecutablePath like '%" + executableName + "')", "get", "ExecutablePath,ProcessId");
		Process process = processBuilder.start();
		try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
			String line;
			while ((line = reader.readLine()) != null) {
				line = line.trim();
				if (!line.isEmpty() && !line.equalsIgnoreCase("ExecutablePath  ProcessId")) {
					String[] parts = line.split("\\s+");
					if (parts.length == 2 && parts[0].toLowerCase().endsWith(executableName.toLowerCase())) {
						pids.add(Long.parseLong(parts[1]));
					}
				}
			}
		}
		return pids;
	}

	public static String getProcessExecutablePath(Long pid) throws Exception {
		Process process = Runtime.getRuntime().exec("wmic process where processid=" + pid + " get ExecutablePath");
		BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
		String line;
		while ((line = reader.readLine()) != null) {
			if (!line.trim().isEmpty() && !line.trim().equals("ExecutablePath")) {
				// This line should contain the executable path of the process
				String executablePath = line.trim();
				return executablePath;
			}
		}

		return StringUtils.EMPTY;
	}

	public static String getProcessCreationDate(long pid) throws Exception {
		Process process = Runtime.getRuntime().exec("wmic process where processid=" + pid + " get CreationDate");
		BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
		String line;
		while ((line = reader.readLine()) != null) {
			line = line.trim();
			if (!line.isEmpty() && !line.equals("CreationDate")) {
				// This line should contain the start time of the process
				return line;
			}
		}
		return StringUtils.EMPTY;
	}

}
