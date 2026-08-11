package com.flowkraft.jobs.controllers;

import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.flowkraft.common.AppPaths;
import com.flowkraft.common.Utils;
import com.flowkraft.jobs.models.FileInfo;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping(value = "/api/jobs", produces = MediaType.APPLICATION_JSON_VALUE, consumes = {
		MediaType.MULTIPART_FORM_DATA_VALUE })
@PreAuthorize("hasRole('JOB_OPERATOR')")
public class UploadController {

	@PostMapping("/upload-and-burst-many")
	public Flux<FileInfo> handleUploadProcessMultipleFiles(@RequestPart("files") MultipartFile[] files)
			throws Exception {

		// System.out.println("UploadController - handleMultipleFilesUpload");
		List<FileInfo> filesToProcess = new ArrayList<FileInfo>();

		String directoryName = UUID.randomUUID().toString();

		for (MultipartFile filePart : files) {

			String originalFilename = filePart.getOriginalFilename();

			// Generate a random UUID and use it as a directory name
			String uploadedFilePath = AppPaths.UPLOADS_DIR_PATH + "/" + directoryName + "/" + originalFilename;

			File uploadedFile = new File(uploadedFilePath);

			FileUtils.createParentDirectories(uploadedFile);

			try (InputStream in = filePart.getInputStream()) { // <-- Close stream
				Files.copy(in, uploadedFile.toPath());
			}

			FileInfo fileInfo = new FileInfo(originalFilename, StringUtils.EMPTY, false);
			fileInfo.filePath = uploadedFilePath;
			filesToProcess.add(fileInfo);

		}

		return Flux.fromStream(filesToProcess.stream());

	}

	@PostMapping("/upload-and-burst")
	public Flux<FileInfo> handleUploadProcessSingleFile(@RequestPart("file") MultipartFile multipPartFile)
			throws Exception {

		// System.out.println("UploadController - handleSingleFileUpload");

		String originalFilename = multipPartFile.getOriginalFilename();

		// Generate a random UUID and use it as a directory name
		String directoryName = UUID.randomUUID().toString();
		String uploadedFilePath = AppPaths.UPLOADS_DIR_PATH + "/" + directoryName + "/" + originalFilename;

		File uploadedFile = new File(uploadedFilePath);
		FileUtils.createParentDirectories(uploadedFile);

		// Use try-with-resources to ensure stream is closed
		try (InputStream in = multipPartFile.getInputStream()) {
			Files.copy(in, uploadedFile.toPath());
		}

		// System.out.println("uploadedFilePath: " + uploadedFilePath);

		List<FileInfo> uploadedFiles = Utils.getFilesToProcess(directoryName, AppPaths.UPLOADS_DIR_PATH);

		return Flux.fromStream(uploadedFiles.stream());
	}

	@PostMapping("/upload-and-qa")
	public Flux<FileInfo> handleUploadQa(@RequestPart("file") MultipartFile multipPartFile) throws Exception {

		// System.out.println("UploadController - handleUploadQa");

		String originalFilename = multipPartFile.getOriginalFilename();

		// Generate a random UUID and use it as a directory name
		String directoryName = UUID.randomUUID().toString();
		String uploadedFilePath = AppPaths.UPLOADS_DIR_PATH + "/" + directoryName + "/" + originalFilename;

		File uploadedFile = new File(uploadedFilePath);
		FileUtils.createParentDirectories(uploadedFile);

		try (InputStream in = multipPartFile.getInputStream()) { // <-- Close stream
			Files.copy(in, uploadedFile.toPath());
		}

		// System.out.println("/upload/process-qa uploadedFilePath: " +
		// uploadedFilePath);

		List<FileInfo> uploadedFiles = Utils.getFilesToProcess(directoryName, AppPaths.UPLOADS_DIR_PATH);

		return Flux.fromStream(uploadedFiles.stream());
	}

}
