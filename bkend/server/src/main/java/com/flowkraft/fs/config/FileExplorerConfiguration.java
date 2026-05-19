package com.flowkraft.fs.config;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

import jakarta.annotation.PostConstruct;

import org.springframework.stereotype.Component;

import com.flowkraft.common.AppPaths;
import com.sourcekraft.documentburster.utils.Utils;

@Component
public class FileExplorerConfiguration {
	public final static String DEFAULT_TITLE = "";
	public final static String DEFAULT_DESCRIPTION = "";

	private String title;
	private String description;
	private Map<String, String> quickLinks;
	private String baseDirPath;
	private Boolean restrictToBaseDir;

	@PostConstruct
	public void init() {
		this.title = DEFAULT_TITLE;
		this.description = DEFAULT_DESCRIPTION;

		// Normalize base directory path
		this.baseDirPath = Utils.resolvePathAgainstPortableDir("db");

		this.restrictToBaseDir = true;

		// Initialize quick links with relative paths
		this.quickLinks = new HashMap<>();
		this.quickLinks.put("Northwind Sample (SQLite)", "/db/sample-northwind-sqlite/northwind.db");
	}

	// Getters and setters remain the same
	public String getBaseDirPath() {
		return baseDirPath;
	}

	public void setBaseDirPath(String baseDirPath) {
		this.baseDirPath = baseDirPath;
	}

	public Boolean getRestrictToBaseDir() {
		return restrictToBaseDir;
	}

	public void setRestrictToBaseDir(Boolean restrictToBaseDir) {
		this.restrictToBaseDir = restrictToBaseDir;
	}

	public String getTitle() {
		return title;
	}

	public void setTitle(String title) {
		this.title = title;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public Map<String, String> getQuickLinks() {
		return quickLinks;
	}

	public void setQuickLinks(Map<String, String> quickLinks) {
		this.quickLinks = quickLinks;
	}
}