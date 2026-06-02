package com.flowkraft.jobs.models;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.commons.io.FilenameUtils;

/**
 * Tracks an async job submitted via POST /api/jobs.
 * status lifecycle: queued → running → done | failed
 * paused is reachable from running via PATCH {action:"pause"}.
 */
public class JobRecord {

    public final String id;
    public final String type;
    public volatile String status; // queued|running|paused|done|failed
    public final Map<String, Object> params;
    public final Instant startedAt;
    public volatile Instant completedAt;
    public volatile Map<String, Object> resultMetadata;

    /**
     * Initial best-guess base name used to build .pause / .cancel signal
     * files. Derived from the primary input of each job type:
     * burst → basename(inputFile), generate → reportId, merge → basename(listFile).
     *
     * For in-process burst jobs the worker copies the input to a temp file and
     * processes THAT — its actual basename diverges from this initial value.
     * The worker reports its real basename via ACTIVE_JOB_BASENAME_SINK on
     * startup, and {@link #activeJobFilePath} is updated. Pause/cancel handlers
     * prefer {@link #activeJobFilePath} when set, falling back here otherwise.
     */
    public final String jobSignalBaseName;

    /**
     * Actual jobFilePath (full path to the worker's temp file) reported back
     * from CliJob via ACTIVE_JOB_FILE_PATH_SINK once it is established. Used
     * for pause/cancel signal-file basenames and as the CLI arg for resume.
     * Empty until the worker reports.
     */
    public volatile String activeJobFilePath;

    public JobRecord(String id, String type, Map<String, Object> params, String jobSignalBaseName) {
        this.id = id;
        this.type = type;
        this.status = "queued";
        this.params = params != null ? new LinkedHashMap<>(params) : Map.of();
        this.startedAt = Instant.now();
        this.jobSignalBaseName = jobSignalBaseName != null ? jobSignalBaseName : "";
        this.activeJobFilePath = "";
        this.resultMetadata = new LinkedHashMap<>();
    }

    /** Returns the basename to use for pause/cancel signal files. */
    public String effectiveSignalBaseName() {
        return activeJobFilePath != null && !activeJobFilePath.isBlank()
                ? FilenameUtils.getBaseName(activeJobFilePath)
                : jobSignalBaseName;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("type", type);
        m.put("status", status);
        m.put("startedAt", startedAt.toString());
        if (completedAt != null) m.put("completedAt", completedAt.toString());
        if (!resultMetadata.isEmpty()) m.put("resultMetadata", resultMetadata);
        return m;
    }
}
