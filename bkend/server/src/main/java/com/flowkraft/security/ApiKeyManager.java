package com.flowkraft.security;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.flowkraft.common.AppPaths;
import com.flowkraft.common.Utils;
import jakarta.annotation.PostConstruct;

/**
 * Manages API key generation, storage, and validation.
 * 
 * The API key is stored in config/_internal/api-key.txt and is:
 * - Auto-generated on first startup if it doesn't exist
 * - Read by Angular, Grails, WordPress apps for auto-discovery
 * - Used to protect the API from unauthorized access
 * 
 * Security model:
 * - Internal apps (Angular/Grails/WordPress) have file system access to read the key
 * - External apps cannot access the file system, so they can't call the API
 */
@Component
public class ApiKeyManager {
    
    private static final Logger log = LoggerFactory.getLogger(ApiKeyManager.class);
    
    private static final String API_KEY_FILENAME = "api-key.txt";
    private static final int API_KEY_LENGTH = 32; // 256 bits of entropy
    
    private String apiKey;

    @PostConstruct
    public void init() {
        // Check for API_KEY environment variable first
        String envApiKey = Utils.getJvmArgumentValue("-DAPI_KEY=");
        if (envApiKey != null && !envApiKey.isEmpty()) {
            apiKey = envApiKey;
            log.info("Using API key from environment variable");
            return;
        }
        
        try {
            Path apiKeyPath = getApiKeyPath();
            
            if (Files.exists(apiKeyPath)) {
                // Read existing API key
                apiKey = Files.readString(apiKeyPath).trim();
                log.info("Loaded API key from {}", apiKeyPath);
            } else {
                // Generate new API key
                apiKey = generateApiKey();
                Files.createDirectories(apiKeyPath.getParent());
                Files.writeString(apiKeyPath, apiKey);
                log.info("Generated new API key and saved to {}", apiKeyPath);
            }
        } catch (IOException e) {
            log.error("Failed to initialize API key", e);
            // Generate a session-only key as fallback
            apiKey = generateApiKey();
            log.warn("Using session-only API key (not persisted)");
        }
    }
    
    /**
     * Get the path to the API key file.
     */
    public Path getApiKeyPath() {
        return Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "_internal", API_KEY_FILENAME);
    }
    
    /**
     * Get the current API key.
     */
    public String getApiKey() {
        return apiKey;
    }
    
    /**
     * Validate an API key.
     * @param providedKey The key to validate
     * @return true if the key matches
     */
    public boolean isValidApiKey(String providedKey) {
        if (apiKey == null || providedKey == null) {
            return false;
        }
        // Use constant-time comparison to prevent timing attacks
        return java.security.MessageDigest.isEqual(
            apiKey.getBytes(), 
            providedKey.getBytes()
        );
    }
    
    /**
     * Generate a cryptographically secure random API key.
     */
    private String generateApiKey() {
        SecureRandom random = new SecureRandom();
        byte[] bytes = new byte[API_KEY_LENGTH];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    
    /**
     * Regenerate the API key (for security rotation).
     * @return The new API key
     */
    public String regenerateApiKey() throws IOException {
        apiKey = generateApiKey();
        Path apiKeyPath = getApiKeyPath();
        Files.createDirectories(apiKeyPath.getParent());
        Files.writeString(apiKeyPath, apiKey);
        log.info("Regenerated API key");
        return apiKey;
    }
}
