package flowkraft.frend

import grails.util.Holders
import java.nio.file.Files
import java.nio.file.Paths

/**
 * Simple helper class with static utility methods for DataPallas.
 *
 * Usage in GSP:
 *   <%@ page import="flowkraft.frend.RbUtils" %>
 *
 *   <rb-tabulator
 *       api-base-url="${RbUtils.apiBaseUrl}"
 *       api-key="${RbUtils.apiKey}"
 *   ></rb-tabulator>
 */
class RbUtils {

    private static String cachedApiKey = null

    /**
     * Returns the backend API base URL for DataPallas.
     * Web components append /reports/{reportId}/config and /reports/{reportId}/data
     * to this base URL, so this must end at /api to match the ReportsController at /api/reports.
     */
    static String getApiBaseUrl() {
        def config = Holders.grailsApplication?.config
        String baseUrl = config?.getProperty('datapallas.backend.baseUrl', String, 'http://localhost:9090')
        return "${baseUrl}/api"
    }

    /**
     * Returns the API key from /app/config/api-key.txt, falls back to "123" in dev.
     */
    static String getApiKey() {
        if (cachedApiKey != null) {
            return cachedApiKey
        }

        try {
            def apiKeyPath = Paths.get('/app/config/api-key.txt')
            if (Files.exists(apiKeyPath)) {
                cachedApiKey = Files.readString(apiKeyPath).trim()
                return cachedApiKey
            }
        } catch (Exception e) {
            // Ignore - will use dev fallback
        }

        cachedApiKey = '123'
        return cachedApiKey
    }

    /**
     * Returns the backend base URL without the /api suffix.
     */
    static String getBackendBaseUrl() {
        def config = Holders.grailsApplication?.config
        return config?.getProperty('datapallas.backend.baseUrl', String, 'http://localhost:9090')
    }

    /**
     * Clear the cached API key (useful if the key file is regenerated).
     */
    static void clearCache() {
        cachedApiKey = null
    }
}
