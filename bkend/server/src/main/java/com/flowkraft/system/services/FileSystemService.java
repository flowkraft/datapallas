package com.flowkraft.system.services;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.CopyOption;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.PathMatcher;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.unix4j.Unix4j;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.common.AppPaths;
import com.flowkraft.jobs.models.FileInfo;
import com.flowkraft.system.dtos.DirCriteriaDto;
import com.flowkraft.system.dtos.FileCriteriaDto;
import com.flowkraft.system.dtos.FindCriteriaDto;
import com.flowkraft.system.dtos.InspectResultDto;

@Service
public class FileSystemService {

	public String unixCliCat(String path) {

		File file = new File(path.trim());

		if (!file.exists()) {
			return StringUtils.EMPTY;
		}

		Stream<String> stream = Unix4j.builder().cd(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH).cat(path).toStringStream();
		return stream.collect(Collectors.joining("\n"));
	}

	public List<String> unixCliFind(String path, FindCriteriaDto criteria) throws Exception {

		Stream<Path> stream;

		if (criteria.isRecursive()) {
			stream = Files.walk(Paths.get(path));
		} else {
			stream = Files.list(Paths.get(path));
		}

		if (criteria.isFiles()) {
			stream = stream.filter(Files::isRegularFile);
		}

		if (criteria.isDirectories()) {
			stream = stream.filter(Files::isDirectory);
		}

		if (criteria.getMatching() != null) {
			stream = stream.filter(filePath -> {
				String fileName = filePath.getFileName().toString();
				return criteria.getMatching().stream().anyMatch(pattern -> {
					String regexPattern = pattern.replace(".", "\\.").replace("*", ".*").replace("?", ".");
					if (criteria.isIgnoreCase()) {
						regexPattern = "(?i)" + regexPattern;
					}
					return fileName.matches(regexPattern);
				});
			});
		}

		List<String> list = stream.map(Path::toAbsolutePath).map(Path::normalize).map(Path::toString)
				.map(p -> p.replace("\\", "/")).map(p -> p.replace(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, ""))
				.collect(Collectors.toList());

		return list;
	}

	public String fsResolvePath(String path) {
		Path base = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH).toAbsolutePath();
		Path pathToResolve = Paths.get(path);

		Path relative = base.relativize(base.resolve(pathToResolve));
		Path resolved = base.resolve(relative);

		return resolved.toAbsolutePath().normalize().toString();
	}

	public void fsWriteStringToFile(String path, Optional<String> content) throws Exception {
		Path filePath = Paths.get(path);

		Files.createDirectories(filePath.getParent());

		if (content.isPresent())
			Files.write(filePath, content.get().getBytes(StandardCharsets.UTF_8));
		else
			Files.write(filePath, StringUtils.EMPTY.getBytes(StandardCharsets.UTF_8));
	}

	public boolean fsDelete(String path) throws Exception {

		Path filePath = Paths.get(path);
		if (Files.isDirectory(filePath)) {
			FileUtils.deleteDirectory(new File(path));
			return true;
		} else
			return Files.deleteIfExists(filePath);

	}

	public void fsCopy(String from, String to, boolean overwrite, String[] matching, boolean ignoreCase)
			throws Exception {

		Path sourcePath = Paths.get(from);
		Path destinationPath = Paths.get(to);

		CopyOption[] options = overwrite ? new CopyOption[] { StandardCopyOption.REPLACE_EXISTING }
				: new CopyOption[] {};

		FileSystem fs = FileSystems.getDefault();
		PathMatcher[] matchers;
		if (!Objects.isNull(matching)) {
			matchers = Stream.of(matching)
					.map(pattern -> fs.getPathMatcher("glob:" + (ignoreCase ? pattern.toLowerCase() : pattern)))
					.toArray(PathMatcher[]::new);
		} else {
			matchers = new PathMatcher[0];
		}

		List<Path> sources = Files.walk(sourcePath).filter(
				source -> matchers.length == 0 || Stream.of(matchers).anyMatch(matcher -> matcher.matches(source)))
				.collect(java.util.stream.Collectors.toList());
		for (Path source : sources) {
			Files.copy(source, destinationPath.resolve(sourcePath.relativize(source)), options);
		}
	}

	public static class MoveOptions {
		public boolean overwrite = false;
	}

	public void fsMove(Path from, Path to, boolean overwrite) throws Exception {

		MoveOptions options = new FileSystemService.MoveOptions();
		options.overwrite = overwrite;

		CopyOption[] copyOptions = options.overwrite ? new CopyOption[] { StandardCopyOption.REPLACE_EXISTING }
				: new CopyOption[] {};

		Files.move(from, to, copyOptions);
	}

	public String fsExists(String path) throws Exception {

		Path filePath = Paths.get(path);
		if (!Files.exists(filePath)) {
			return "false";
		} else if (Files.isDirectory(filePath)) {
			return "dir";
		} else if (Files.isRegularFile(filePath)) {
			return "file";
		} else {
			return "other";
		}
	}

	public String fsDir(String path, Optional<DirCriteriaDto> criteria) throws Exception {
		Path dirPath = Paths.get(path);
		if (Files.exists(dirPath)) {
			if (!Files.isDirectory(dirPath)) {
				throw new RuntimeException("Path exists but is not a directory");
			}

			if (criteria.isPresent()) {

				DirCriteriaDto c = criteria.get();

				if (c.isEmpty() && dirPath.toFile().list().length > 0) {
					try (Stream<Path> paths = Files.walk(dirPath)) {
						paths.filter(p -> !p.equals(dirPath)).sorted(Comparator.reverseOrder()).map(Path::toFile)
								.forEach(File::delete);
					}
				}

				if (!StringUtils.isBlank(c.getMode())) {
					Set<PosixFilePermission> perms = PosixFilePermissions.fromString(c.getMode());
					Files.setPosixFilePermissions(dirPath, perms);
				}
			}
		} else {
			Files.createDirectories(dirPath);
		}

		return dirPath.toString().replace("\\", "/");
	}

	public String fsFile(String path, Optional<FileCriteriaDto> criteria) throws Exception {
		Path filePath = Paths.get(path);
		if (!Files.exists(filePath)) {
			Files.createDirectories(filePath.getParent());
			Files.createFile(filePath);
		}

		if (criteria.isPresent()) {
			FileCriteriaDto c = criteria.get();
			if (!Objects.isNull(c.getContent())) {
				if (c.getContent() instanceof String) {
					Files.write(filePath, ((String) c.getContent()).getBytes(StandardCharsets.UTF_8));
				} else if (c.getContent() instanceof byte[]) {
					Files.write(filePath, (byte[]) c.getContent());
				} else if (c.getContent() instanceof ByteBuffer) {
					Files.write(filePath, ((ByteBuffer) c.getContent()).array());
				} else {
					ObjectMapper objectMapper = new ObjectMapper();
					objectMapper.writerWithDefaultPrettyPrinter().writeValue(filePath.toFile(), c.getContent());
				}
			}

			if (!Objects.isNull(c.getMode())) {
				Set<PosixFilePermission> perms = PosixFilePermissions.fromString(c.getMode());
				Files.setPosixFilePermissions(filePath, perms);
			}
		}

		return path;
	}

	public List<FileInfo> fsList(String fullPath) {
		File directory = new File(fullPath);
		if (!directory.exists() || !directory.isDirectory()) {
			return java.util.Collections.emptyList();
		}
		return java.util.Arrays.stream(directory.listFiles())
			.map(file -> {
				FileInfo info = new FileInfo(file.getName(), StringUtils.EMPTY, false);
				info.filePath = file.getAbsolutePath();
				info.fileSize = file.length();
				info.isDirectory = file.isDirectory();
				info.lastModified = file.lastModified();
				return info;
			})
			.collect(Collectors.toList());
	}

	public Optional<InspectResultDto> fsInspect(String path, Optional<String> checksum, Optional<Boolean> mode,
			Optional<Boolean> times, Optional<Boolean> absolutePath, Optional<String> symlinks) throws Exception {
		Path filePath;

		if (absolutePath.isPresent() && absolutePath.get()) {
			filePath = Paths.get(path).toAbsolutePath();
		} else {
			filePath = Paths.get(path);
		}

		if (!Files.exists(filePath)) {
			return Optional.empty();
		}

		InspectResultDto result = new InspectResultDto();
		result.setName(filePath.getFileName().toString());
		result.setType(Files.isDirectory(filePath) ? "dir" : "file");

		if (Files.isRegularFile(filePath)) {
			result.setSize(Files.size(filePath));
		}

		if (mode.isPresent()) {
			if (mode.get()) {
				result.setMode((int) Files.getAttribute(filePath, "unix:mode"));
			}
		}

		if (times.isPresent()) {
			if (times.get()) {
				BasicFileAttributes attrs = Files.readAttributes(filePath, BasicFileAttributes.class);
				result.setAccessTime(Instant.ofEpochMilli(attrs.lastAccessTime().toMillis()));
				result.setModifyTime(Instant.ofEpochMilli(attrs.lastModifiedTime().toMillis()));
				result.setChangeTime(Instant.ofEpochMilli(attrs.creationTime().toMillis()));
			}

		}

		return Optional.of(result);
	}

}
