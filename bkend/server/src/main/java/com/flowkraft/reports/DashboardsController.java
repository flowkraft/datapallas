package com.flowkraft.reports;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Mono;

/**
 * V4.4 /api/dashboards/* domain — paginated-vs-interactive split (R1).
 * Storage is shared with /api/reports/* (same XML configs under config/reports/).
 * Only the API surface differs: /api/reports/* for configuration management,
 * /api/dashboards/* for interactive rendering.
 *
 * V4.5: GET /api/dashboards/{id}/render replaces root-path /dashboard/{reportCode}.
 *       DashboardController at /dashboard/{reportCode} is kept for backward-compat
 *       browser bookmarks until V6 cleanup.
 */
@RestController
@RequestMapping(value = "/api/dashboards")
public class DashboardsController {

	@GetMapping(consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Void>> listDashboards() {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build());
	}

	@GetMapping(value = "/{id}", consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Void>> getDashboard(@PathVariable String id) {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build());
	}

	@PostMapping
	public Mono<ResponseEntity<Void>> createDashboard() {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build());
	}

	@PutMapping(value = "/{id}")
	public Mono<ResponseEntity<Void>> updateDashboard(@PathVariable String id) {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build());
	}

	@DeleteMapping(value = "/{id}")
	public Mono<ResponseEntity<Void>> deleteDashboard(@PathVariable String id) {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build());
	}

	@PostMapping(value = "/{id}/duplicate")
	public Mono<ResponseEntity<Void>> duplicateDashboard(@PathVariable String id) {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build());
	}

	// V4.5: replaces root-path /dashboard/{reportCode} from DashboardController
	@GetMapping(value = "/{id}/render", produces = MediaType.TEXT_HTML_VALUE)
	public Mono<ResponseEntity<Void>> renderDashboard(@PathVariable String id) {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build());
	}

	@GetMapping(value = "/{id}/data", consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Void>> getDashboardData(@PathVariable String id) {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build());
	}

	@GetMapping(value = "/{id}/embed/{component}", consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Void>> embedComponent(@PathVariable String id, @PathVariable String component) {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build());
	}
}
