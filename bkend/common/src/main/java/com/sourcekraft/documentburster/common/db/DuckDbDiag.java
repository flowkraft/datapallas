package com.sourcekraft.documentburster.common.db;

import java.io.File;
import java.time.Instant;

/** TEMPORARY instrument (file 9, WAL replay failure): what a DuckDB file's folder holds, and when. */
public final class DuckDbDiag {

	private DuckDbDiag() {
	}

	public static String describe(String jdbcUrl) {
		try {
			if (jdbcUrl == null || !jdbcUrl.startsWith("jdbc:duckdb:"))
				return "not a duckdb url";
			String path = jdbcUrl.substring("jdbc:duckdb:".length());
			int cut = path.indexOf(';');
			if (cut >= 0)
				path = path.substring(0, cut);
			File[] files = new File(path).getAbsoluteFile().getParentFile().listFiles();
			StringBuilder out = new StringBuilder("at " + Instant.now() + " in " + new File(path).getParent() + ":");
			if (files != null)
				for (File f : files)
					out.append(" [").append(f.getName()).append(' ').append(f.length()).append("B ")
							.append(Instant.ofEpochMilli(f.lastModified())).append(']');
			return out.toString();
		} catch (Exception e) {
			return "diag failed: " + e;
		}
	}
}
