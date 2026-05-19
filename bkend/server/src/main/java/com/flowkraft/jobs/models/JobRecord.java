package com.flowkraft.jobs.models;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

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
     * Base name used to build .pause / .cancel signal files that the running
     * CliJob picks up. Derived from the primary input of each job type:
     * burst → basename(inputFile), generate → reportId, merge → basename(listFile).
     */
    public final String jobSignalBaseName;

    public JobRecord(String id, String type, Map<String, Object> params, String jobSignalBaseName) {
        this.id = id;
        this.type = type;
        this.status = "queued";
        this.params = params != null ? new LinkedHashMap<>(params) : Map.of();
        this.startedAt = Instant.now();
        this.jobSignalBaseName = jobSignalBaseName != null ? jobSignalBaseName : "";
        this.resultMetadata = new LinkedHashMap<>();
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
