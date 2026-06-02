package com.flowkraft.ai;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.ai.prompts.AiPromptRegistry;
import com.flowkraft.ai.prompts.PromptDefinition;

import reactor.core.publisher.Mono;

/**
 * Serves AI prompt templates from {@link AiPromptRegistry} at startup.
 *
 * Both Angular and Next.js consume the same prompts from this endpoint so
 * there is a single source of truth.
 */
@RestController
@RequestMapping(value = "/api/system/ai-prompts", produces = MediaType.APPLICATION_JSON_VALUE)
public class AiPromptController {

    private static final Logger log = LoggerFactory.getLogger(AiPromptController.class);

    /** Ordered map: promptId → { id, title, description, tags, category, promptText } */
    private final Map<String, Map<String, Object>> promptsById = new LinkedHashMap<>();

    @PostConstruct
    private void loadPrompts() {
        for (PromptDefinition p : AiPromptRegistry.all()) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", p.id());
            entry.put("title", p.title());
            entry.put("description", p.description());
            entry.put("tags", p.tags());
            entry.put("category", p.category());
            entry.put("promptText", p.promptText());
            promptsById.put(p.id(), entry);
        }
        log.info("Loaded {} AI prompt templates from AiPromptRegistry", promptsById.size());
    }

    // ────────────────────────────────────────────────────────────────────────
    // Endpoints
    // ────────────────────────────────────────────────────────────────────────

    /** GET /api/system/ai-prompts — list all prompts (metadata only, no promptText) */
    @GetMapping(value = "", consumes = MediaType.ALL_VALUE)
    public Mono<List<Map<String, Object>>> listPrompts() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> p : promptsById.values()) {
            Map<String, Object> meta = new LinkedHashMap<>(p);
            meta.remove("promptText");
            list.add(meta);
        }
        return Mono.just(list);
    }

    /** GET /api/system/ai-prompts/{id} — get a single prompt including its text */
    @GetMapping(value = "/{id}", consumes = MediaType.ALL_VALUE)
    public Mono<ResponseEntity<Map<String, Object>>> getPrompt(@PathVariable String id) {
        Map<String, Object> prompt = promptsById.get(id);
        if (prompt == null) {
            return Mono.just(ResponseEntity.status(HttpStatus.NOT_FOUND).<Map<String, Object>>build());
        }
        return Mono.just(ResponseEntity.ok(prompt));
    }
}
