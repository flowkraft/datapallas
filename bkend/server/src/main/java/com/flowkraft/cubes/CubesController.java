package com.flowkraft.cubes;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.queries.ConnectionFactory;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

import reactor.core.publisher.Mono;

/**
 * REST API for managing cube definitions.
 *
 * CRUD operations for cube definitions stored as:
 *   config/cubes/{cubeId}/{cubeId}-cube-config.groovy   (DSL code)
 *   config/cubes/{cubeId}/cube.xml                       (metadata)
 *
 * Plus DSL parsing and SQL generation endpoints.
 */
@RestController
@RequestMapping(value = "/api/cubes", produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('REPORT_AUTHOR')")
public class CubesController {

	private static final Logger log = LoggerFactory.getLogger(CubesController.class);

	@Autowired
	private CubesService cubesService;

	// ═══════════════════════════════════════════════════════════════════════════
	// CRUD
	// ═══════════════════════════════════════════════════════════════════════════

	/** List all cube definitions */
	@GetMapping(consumes = MediaType.ALL_VALUE)
	public Mono<List<Map<String, String>>> listAll() throws Exception {
		return Mono.just(cubesService.listAll());
	}

	/** Load a cube definition (metadata + DSL code) */
	@GetMapping(value = "/{cubeId}", consumes = MediaType.ALL_VALUE)
	public Mono<Map<String, Object>> load(@PathVariable String cubeId) throws Exception {
		return Mono.just(cubesService.load(cubeId));
	}

	/** Save a cube definition (metadata + DSL code) */
	@PutMapping(value = "/{cubeId}", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<Void> save(
			@PathVariable String cubeId,
			@RequestBody Map<String, String> request) throws Exception {
		cubesService.save(cubeId,
				request.getOrDefault("name", cubeId),
				request.getOrDefault("description", ""),
				request.getOrDefault("connectionId", ""),
				request.getOrDefault("dslCode", ""));
		return Mono.empty();
	}

	/** Create a new cube definition */
	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, Object>>> create(@RequestBody Map<String, String> request) throws Exception {
		String cubeId = request.get("cubeId");
		String name = request.getOrDefault("name", cubeId);
		Map<String, Object> created = cubesService.create(cubeId, name);
		return Mono.just(ResponseEntity.status(HttpStatus.CREATED).body(created));
	}

	/** Delete a cube definition */
	@DeleteMapping("/{cubeId}")
	public Mono<Void> delete(@PathVariable String cubeId) throws Exception {
		cubesService.delete(cubeId);
		return Mono.empty();
	}

	/** Duplicate a cube definition */
	@PostMapping(value = "/{cubeId}/duplicate", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, Object>>> duplicate(
			@PathVariable String cubeId,
			@RequestBody Map<String, String> request) throws Exception {
		String targetId = request.get("targetCubeId");
		String targetName = request.getOrDefault("targetName", targetId);
		Map<String, Object> duplicated = cubesService.duplicate(cubeId, targetId, targetName);
		return Mono.just(ResponseEntity.status(HttpStatus.CREATED).body(duplicated));
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// DSL Parsing
	// ═══════════════════════════════════════════════════════════════════════════

	/** Parse DSL code and return structured CubeOptions JSON */
	@PostMapping(value = "/parse-dsl", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<CubeOptions> parseDsl(@RequestBody Map<String, String> request) throws Exception {
		String dslCode = request.get("dslCode");
		return Mono.just(cubesService.parseDsl(dslCode));
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// SQL Generation
	// ═══════════════════════════════════════════════════════════════════════════

	/** Generate SQL directly from DSL code (no saved cube needed — for live preview) */
	@SuppressWarnings("unchecked")
	@PostMapping(value = "/generate-sql", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<Map<String, Object>> generateSqlFromDsl(@RequestBody Map<String, Object> request) throws Exception {
		String dslCode = (String) request.get("dslCode");
		CubeOptions cube = cubesService.parseDsl(dslCode);
		return generateSqlInternal(cube, request);
	}

	/** Generate vendor-specific SQL from cube metadata + user field selections */
	@PostMapping(value = "/{cubeId}/generate-sql", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<Map<String, Object>> generateSql(
			@PathVariable String cubeId,
			@RequestBody Map<String, Object> request) throws Exception {
		Map<String, Object> cubeData = cubesService.load(cubeId);
		String dslCode = (String) cubeData.get("dslCode");
		CubeOptions cube = cubesService.parseDsl(dslCode);
		return generateSqlInternal(cube, request);
	}

	/**
	 * Shared core for both SQL-generation endpoints. Resolves the DB vendor from the
	 * connection (so dialect-specific SQL can be emitted) and runs the generator.
	 * The DSL parsing is the only step that differs between the two endpoints —
	 * see {@link #getSql} (inline DSL) and {@link #generateSql} (saved cube).
	 */
	@SuppressWarnings("unchecked")
	private Mono<Map<String, Object>> generateSqlInternal(CubeOptions cube, Map<String, Object> request) throws Exception {
		String connectionId = (String) request.get("connectionId");
		List<String> selectedDimensions = (List<String>) request.getOrDefault("selectedDimensions", List.of());
		List<String> selectedMeasures = (List<String>) request.getOrDefault("selectedMeasures", List.of());
		List<String> selectedSegments = (List<String>) request.getOrDefault("selectedSegments", List.of());

		String dbVendor = "default";
		if (connectionId != null && !connectionId.isBlank()) {
			DatabaseConnectionManager dbManager = ConnectionFactory.newConnectionManager();
			try {
				ServerDatabaseSettings dbs = dbManager.getServerDatabaseSettings(connectionId);
				if (dbs != null && dbs.type != null) {
					dbVendor = dbs.type;
				}
			} finally {
				dbManager.close();
			}
		}

		String sql = CubeSqlGenerator.generateSql(cube, selectedDimensions, selectedMeasures, selectedSegments, dbVendor);
		return Mono.just(Map.<String, Object>of("sql", sql, "dialect", dbVendor));
	}
}
