package com.flowkraft.jobs.services;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.flowkraft.jobs.models.JobRecord;

/**
 * In-memory job registry. Bounded to MAX_JOBS most-recent entries.
 * Per C9 design: in-memory is intentional for the current single-user scale.
 */
@Service
public class JobStore {

    private static final int MAX_JOBS = 100;

    private final ConcurrentHashMap<String, JobRecord> records = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, SseEmitter> emitters = new ConcurrentHashMap<>();
    private final Deque<String> insertionOrder = new LinkedList<>();

    public JobRecord create(String type, Map<String, Object> params, String jobSignalBaseName) {
        String id = UUID.randomUUID().toString();
        JobRecord rec = new JobRecord(id, type, params, jobSignalBaseName);
        synchronized (insertionOrder) {
            records.put(id, rec);
            insertionOrder.addLast(id);
            while (insertionOrder.size() > MAX_JOBS) {
                String oldest = insertionOrder.removeFirst();
                records.remove(oldest);
                SseEmitter old = emitters.remove(oldest);
                if (old != null) { try { old.complete(); } catch (Exception ignored) {} }
            }
        }
        return rec;
    }

    public Optional<JobRecord> find(String id) {
        return Optional.ofNullable(records.get(id));
    }

    /** Returns up to {@code limit} most-recent records, optionally filtered by status. */
    public List<JobRecord> list(String statusFilter, int limit) {
        List<JobRecord> result = new ArrayList<>();
        synchronized (insertionOrder) {
            String[] ids = insertionOrder.toArray(new String[0]);
            for (int i = ids.length - 1; i >= 0 && result.size() < limit; i--) {
                JobRecord r = records.get(ids[i]);
                if (r == null) continue;
                if (statusFilter == null || statusFilter.equals(r.status)) result.add(r);
            }
        }
        return result;
    }

    /** Update status; emits SSE event; completes emitter on terminal states. */
    public void updateStatus(String id, String newStatus) {
        JobRecord rec = records.get(id);
        if (rec == null) return;
        rec.status = newStatus;
        if ("done".equals(newStatus) || "failed".equals(newStatus)) {
            rec.completedAt = Instant.now();
        }
        SseEmitter emitter = emitters.get(id);
        if (emitter != null) {
            try {
                emitter.send(SseEmitter.event().name("status").data(Map.of("status", newStatus, "id", id)));
                if ("done".equals(newStatus) || "failed".equals(newStatus)) {
                    emitter.complete();
                    emitters.remove(id);
                }
            } catch (Exception ignored) {}
        }
    }

    /** Create and register a new SSE emitter for a job that is still running. */
    public SseEmitter createEmitter(String id) {
        SseEmitter emitter = new SseEmitter(10L * 60 * 1000); // 10-min timeout
        emitter.onCompletion(() -> emitters.remove(id));
        emitter.onTimeout(() -> emitters.remove(id));
        emitter.onError(e -> emitters.remove(id));
        emitters.put(id, emitter);
        return emitter;
    }

    public SseEmitter getEmitter(String id) {
        return emitters.get(id);
    }
}
