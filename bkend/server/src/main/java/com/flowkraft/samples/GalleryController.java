package com.flowkraft.samples;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import reactor.core.publisher.Mono;

import java.util.*;

/**
 * Gallery template endpoints — the frontend uses template IDs, never file paths.
 */
@RestController
@RequestMapping(value = "/api/system/gallery")
@PreAuthorize("hasRole('JOB_OPERATOR')")
public class GalleryController {

    private static final Logger log = LoggerFactory.getLogger(GalleryController.class);

    @Autowired
    private GalleryService galleryService;

    /**
     * Load HTML content for a gallery template variant.
     * Returns JSON with content + assetBaseDir (for resolving relative image/font URLs).
     * GET /api/gallery/templates/{templateId}/content?variant=0
     */
    @GetMapping(value = "/templates/{templateId}/content", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<Map<String, String>>> loadContent(
            @PathVariable String templateId,
            @RequestParam(defaultValue = "0") int variant) throws Exception {

        String content = galleryService.loadContent(templateId, variant);
        if (content == null) {
            return Mono.just(ResponseEntity.notFound().build());
        }

        String assetBaseDir = galleryService.resolveTemplateDir(templateId, variant);

        Map<String, String> response = new LinkedHashMap<>();
        response.put("content", content);
        response.put("assetBaseDir", assetBaseDir);

        return Mono.just(ResponseEntity.ok(response));
    }

    /**
     * Load README for a gallery template variant.
     * GET /api/gallery/templates/{templateId}/readme?variant=0
     */
    @GetMapping(value = "/templates/{templateId}/readme", produces = MediaType.TEXT_PLAIN_VALUE)
    public Mono<ResponseEntity<String>> loadReadme(
            @PathVariable String templateId,
            @RequestParam(defaultValue = "0") int variant) throws Exception {

        String content = galleryService.loadAssociatedFile(templateId, variant, "readme");
        return Mono.just(ResponseEntity.ok(content != null ? content : ""));
    }

    /**
     * Load AI prompt for a gallery template variant.
     * GET /api/gallery/templates/{templateId}/ai-prompt?type=modify&variant=0
     */
    @GetMapping(value = "/templates/{templateId}/ai-prompt", produces = MediaType.TEXT_PLAIN_VALUE)
    public Mono<ResponseEntity<String>> loadAiPrompt(
            @PathVariable String templateId,
            @RequestParam String type,
            @RequestParam(defaultValue = "0") int variant) throws Exception {

        String suffix = "ai_prompt_" + type;
        String content = galleryService.loadAssociatedFile(templateId, variant, suffix);
        return Mono.just(ResponseEntity.ok(content != null ? content : ""));
    }

    /**
     * View a gallery template in the browser with resolved asset URLs.
     * GET /api/gallery/templates/{templateId}/view?variant=0
     */
    @GetMapping(value = "/templates/{templateId}/view", produces = MediaType.TEXT_HTML_VALUE)
    public Mono<ResponseEntity<String>> viewTemplate(
            @PathVariable String templateId,
            @RequestParam(defaultValue = "0") int variant) throws Exception {

        String content = galleryService.loadContent(templateId, variant);
        if (content == null) {
            return Mono.just(ResponseEntity.notFound().build());
        }

        String baseDir = galleryService.resolveTemplateDir(templateId, variant);

        // Rewrite relative asset URLs to use /api/reports/serve-asset
        content = content.replaceAll(
                "(src=[\"'])(?!http|data:|/)([^\"']+)([\"'])",
                "$1/api/reports/serve-asset?path=" + baseDir + "$2$3");
        content = content.replaceAll(
                "(href=[\"'])(?!http|data:|/)([^\"']+\\.css)([\"'])",
                "$1/api/reports/serve-asset?path=" + baseDir + "$2$3");

        return Mono.just(ResponseEntity.ok(content));
    }
}
