package com.flowkraft.common;

import java.util.List;

public class Constants {

	public static final String FRONTEND_URL = "http://localhost:4200";

	/**
	 * The only origins allowed to call the API from a browser — used for both CORS and the
	 * STOMP handshake so the two can never drift apart.
	 *
	 * <p>Everything that legitimately talks to this server is either same-origin or runs on
	 * the same machine: the packaged Angular app loaded from {@code file://} in Electron, the
	 * Angular dev server, and the AI Hub UI. A wildcard would additionally let any web page
	 * the user happens to open drive the API on their behalf, which — with credentials
	 * allowed — is a working attack, not a theoretical one.
	 */
	public static final List<String> ALLOWED_ORIGIN_PATTERNS = List.of(
			"http://localhost:[*]",
			"http://127.0.0.1:[*]",
			"https://localhost:[*]",
			"file://");
	
	public static final Object NULLL_OBJ = null;
	
	public static final String COMMAND_BURST = "burst";
	//public static final String PROCESSING_DIR_NAME = "heinhslqypajpus";
	
	public static final String DB_NAME = "DocumentBurster";
	public static final String SERVER_DB_NAME = "DocumentBurster Server";
	public static final String PDFBURST_WEBSITE = "https://www.pdfburst.com";


	public static final String MAGIC_STRING_CLEAR_ALL_LOG_FILES = "8807842127";

	public static final String WS_ENDPOINT = "/api/ws";

	public static final String WS_TOPIC_EXECUTION_STATS = "/topic/execution-stats";
	public static final String WS_TOPIC_TAILER = "/topic/tailer";


	public static final String PORTABLE_EXECUTABLE_DIR = "PORTABLE_EXECUTABLE_DIR";
	
	public static int KEEP_FIRST_N_CHARACTERS = 10;

	public static final String LICENSE_STATUS_DEMO = "DEMO";
	public static final String LICENSE_STATUS_VALID = "VALID";
	public static final String LICENSE_STATUS_EXPIRED = "EXPIRED";

	public static final String EXTENTION_JOB_FILE = ".job";
	public static final String EXTENTION_PROGRESS_FILE = ".progress";

}
