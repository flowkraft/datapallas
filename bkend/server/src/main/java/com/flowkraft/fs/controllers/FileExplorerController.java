package com.flowkraft.fs.controllers;

import java.io.File;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.common.MimeTypeUtils;
import com.flowkraft.fs.config.FileExplorerConfiguration;
import com.flowkraft.fs.models.FileTreeVO;
import com.flowkraft.fs.services.FileExplorerService;
import com.flowkraft.system.services.FileSystemService;

import reactor.core.publisher.Mono;

@RestController
@RequestMapping(value = "/api/system/fs/explorer")
public class FileExplorerController {

	@Autowired
	private FileSystemService fileSystemService;

	@Autowired
	private FileExplorerService fileExplorerService;

	@Autowired
	private FileExplorerConfiguration fileExplorerConfig;

	/**
	 * Get metadata information about the file explorer
	 */
	@GetMapping("/meta-info")
	public Mono<Map<String, Object>> getMetaInfo() throws Exception {
		Map<String, Object> metaInfo = new HashMap<>();
		metaInfo.put("title", fileExplorerConfig.getTitle());
		metaInfo.put("description", fileExplorerConfig.getDescription());
		metaInfo.put("quickLinks", fileExplorerConfig.getQuickLinks());
		metaInfo.put("baseDirPath", fileExplorerConfig.getBaseDirPath());
		return Mono.just(metaInfo);
	}

	/**
	 * Get file tree structure for a directory
	 */
	@GetMapping("/file-tree")
	public Mono<FileTreeVO> getFileTree(@RequestParam String dir) throws Exception {
		String decodedPath = URLDecoder.decode(dir, StandardCharsets.UTF_8.toString());
		String fullPath = resolveFullPath(decodedPath);
		return Mono.just(fileExplorerService.buildFileTree(fullPath));
	}

	/**
	 * View file content
	 */
	@GetMapping(value = "/file-viewer", produces = MediaType.TEXT_HTML_VALUE)
	public Mono<ResponseEntity<String>> viewFile(@RequestParam String file) throws Exception {
		String decodedPath = URLDecoder.decode(file, StandardCharsets.UTF_8.toString());
		String fullPath = resolveFullPath(decodedPath);

		File fileObj = new File(fullPath);
		if (!fileObj.exists() || !fileObj.isFile() || !fileObj.canRead()) {
			return Mono.just(ResponseEntity.status(HttpStatus.NOT_FOUND)
					.body("<html><body><h1>404 File Not Found or Not Readable</h1></body></html>"));
		}

		String fileContent = fileSystemService.unixCliCat(fullPath);
		String fileName = fileObj.getName();
		String fileExtension = FilenameUtils.getExtension(fileName).toLowerCase();

		// Create a simple HTML viewer for the file content
		StringBuilder htmlBuilder = new StringBuilder();
		htmlBuilder.append("<!DOCTYPE html>\n<html>\n<head>\n");
		htmlBuilder.append("<title>File Viewer: ").append(fileName).append("</title>\n");
		htmlBuilder.append("<meta charset=\"UTF-8\">\n");
		htmlBuilder.append("<style>\n");
		htmlBuilder.append("body { font-family: Arial, sans-serif; margin: 20px; }\n");
		htmlBuilder.append(
				"pre { background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }\n");
		htmlBuilder.append("h1 { color: #333; }\n");
		htmlBuilder.append("</style>\n");

		// Add syntax highlighting for common code files
		if (Arrays.asList("js", "ts", "java", "py", "html", "xml", "css", "json", "yml", "yaml")
				.contains(fileExtension)) {
			htmlBuilder.append(
					"<link href=\"https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css\" rel=\"stylesheet\">\n");
		}

		htmlBuilder.append("</head>\n<body>\n");
		htmlBuilder.append("<h1>").append(fileName).append("</h1>\n");

		if (Arrays.asList("jpg", "jpeg", "png", "gif", "bmp", "webp").contains(fileExtension)) {
			htmlBuilder.append("<img src=\"/api/fs/file-downloader?file=")
					.append(URLDecoder.decode(file, StandardCharsets.UTF_8.toString()))
					.append("\" style=\"max-width: 100%;\">");
		} else if (fileExtension.equals("pdf")) {
			htmlBuilder.append("<object data=\"/api/fs/file-downloader?file=")
					.append(URLDecoder.decode(file, StandardCharsets.UTF_8.toString()))
					.append("\" type=\"application/pdf\" width=\"100%\" height=\"800px\">")
					.append("<p>Unable to display PDF. <a href=\"/api/fs/file-downloader?file=")
					.append(URLDecoder.decode(file, StandardCharsets.UTF_8.toString()))
					.append("\">Download</a> instead.</p>").append("</object>");
		} else {
			String language = "";
			switch (fileExtension) {
			case "js":      language = "javascript"; break;
			case "ts":      language = "typescript"; break;
			case "java":    language = "java"; break;
			case "py":      language = "python"; break;
			case "html":    language = "html"; break;
			case "xml":     language = "xml"; break;
			case "css":     language = "css"; break;
			case "json":    language = "json"; break;
			case "yml":
			case "yaml":    language = "yaml"; break;
			default:        language = ""; break;
			}

			if (!language.isEmpty()) {
				htmlBuilder.append("<pre><code class=\"language-").append(language).append("\">")
						.append(escapeHtml(fileContent)).append("</code></pre>\n");
			} else {
				htmlBuilder.append("<pre>").append(escapeHtml(fileContent)).append("</pre>\n");
			}

			if (!language.isEmpty()) {
				htmlBuilder.append(
						"<script src=\"https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js\"></script>\n");
				htmlBuilder
						.append("<script src=\"https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-")
						.append(language).append(".min.js\"></script>\n");
			}
		}

		htmlBuilder.append("</body>\n</html>");
		return Mono.just(ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(htmlBuilder.toString()));
	}

	/**
	 * Download a file
	 */
	@GetMapping("/file-downloader")
	public Mono<ResponseEntity<FileSystemResource>> downloadFile(@RequestParam String file) throws Exception {
		String decodedPath = URLDecoder.decode(file, StandardCharsets.UTF_8.toString());
		String fullPath = resolveFullPath(decodedPath);

		File fileObj = new File(fullPath);
		if (!fileObj.exists() || !fileObj.isFile() || !fileObj.canRead()) {
			return Mono.just(ResponseEntity.notFound().build());
		}

		String fileName = fileObj.getName();
		String contentType = MimeTypeUtils.determineContentType(fileName);

		HttpHeaders headers = new HttpHeaders();
		headers.setContentDisposition(ContentDisposition.builder("attachment").filename(fileName).build());
		headers.setContentType(MediaType.parseMediaType(contentType));
		headers.setContentLength(fileObj.length());

		return Mono.just(ResponseEntity.ok().headers(headers).body(new FileSystemResource(fileObj)));
	}

	/**
	 * Upload a file
	 */
	@PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public Mono<Boolean> upload(@RequestPart("file") FilePart filePart, @RequestParam String dir) throws Exception {
		String decodedDir = URLDecoder.decode(dir, StandardCharsets.UTF_8.toString());
		String fullDir = resolveFullPath(decodedDir);

		File targetDir = new File(fullDir);
		if (!targetDir.exists() || !targetDir.isDirectory() || !targetDir.canWrite()) {
			return Mono.just(false);
		}

		Path tempFile = Files.createTempFile("upload-", "-temp");

		return filePart.transferTo(tempFile).then(Mono.fromCallable(() -> {
			File targetFile = new File(targetDir, filePart.filename());
			Files.copy(tempFile, targetFile.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
			Files.deleteIfExists(tempFile);
			return true;
		}));
	}

	private String resolveFullPath(String path) {
		if (path == null || path.trim().isEmpty()) {
			return fileExplorerConfig.getBaseDirPath();
		}

		// Fix Windows paths that start with a slash before the drive letter
		if (path.matches("^/[A-Za-z]:.*")) {
			path = path.substring(1);
		}

		// If the path is relative (doesn't start with a drive letter on Windows or / on Unix)
		if (!path.matches("^[A-Za-z]:.*") && !path.startsWith("/")) {
			return fileExplorerConfig.getBaseDirPath() + "/" + path;
		}

		// Check if we need to restrict to base directory
		if (fileExplorerConfig.getRestrictToBaseDir()) {
			try {
				File requestedFile = new File(path);
				File baseDir = new File(fileExplorerConfig.getBaseDirPath());
				String canonicalRequestedPath = requestedFile.getCanonicalPath();
				String canonicalBasePath = baseDir.getCanonicalPath();
				if (!canonicalRequestedPath.startsWith(canonicalBasePath)) {
					return fileExplorerConfig.getBaseDirPath();
				}
			} catch (Exception e) {
				return fileExplorerConfig.getBaseDirPath();
			}
		}

		return path;
	}

	private String escapeHtml(String input) {
		if (input == null) return "";
		return input.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
				.replace("\"", "&quot;").replace("'", "&#39;");
	}
}
