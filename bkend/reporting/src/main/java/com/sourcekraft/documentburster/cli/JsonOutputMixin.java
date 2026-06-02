package com.sourcekraft.documentburster.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import picocli.CommandLine.Option;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Picocli mixin that adds a --json flag to any command.
 * When --json is active, output is a JSON object on stdout.
 * Standard envelope: {"status":"ok","details":{...}} or {"status":"error","message":"...","details":{...}}
 */
public class JsonOutputMixin {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Option(names = "--json", description = "Emit machine-readable JSON instead of human text")
    public boolean json = false;

    public void emit(Object payload) throws Exception {
        if (json) {
            System.out.println(OBJECT_MAPPER.writeValueAsString(payload));
        }
    }

    public void emitOk(Map<String, Object> details) throws Exception {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("status", "ok");
        envelope.put("details", details);
        emit(envelope);
    }

    public void emitError(String message, Map<String, Object> details) throws Exception {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("status", "error");
        envelope.put("message", message);
        envelope.put("details", details != null ? details : Map.of());
        emit(envelope);
    }
}
