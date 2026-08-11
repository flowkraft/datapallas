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
@groovy.util.logging.Slf4j
class RbUtils {

    private static String cachedApiKey = null

    /** reportId -> the token last minted for it, reused until shortly before it expires. */
    private static final Map<String, CachedToken> tokenCache = new java.util.concurrent.ConcurrentHashMap<>()

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
     * This application's own long-lived credential for talking to DataPallas.
     *
     * <p>Read from the DataPallas installation itself, which docker-compose mounts read-only at
     * /app/config. Reading the file rather than copying the key into an environment variable means
     * there is one source of truth and nothing for an administrator to keep in sync — the two
     * applications run on the same machine, so the file is right there.
     *
     * <p><b>Server-side only.</b> It authenticates as an administrator, so it must never reach a
     * rendered page — use {@link #embedToken(String)} in markup instead.
     */
    static String getApiKey() {
        if (cachedApiKey != null) {
            return cachedApiKey
        }

        try {
            // Must match ApiKeyManager, which writes config/_internal/api-key.txt.
            def apiKeyPath = Paths.get('/app/config/_internal/api-key.txt')
            if (Files.exists(apiKeyPath)) {
                cachedApiKey = Files.readString(apiKeyPath).trim()
                return cachedApiKey
            }
            log.warn("No DataPallas API key at ${apiKeyPath} — is config/ mounted? " +
                     "Falling back to the dev key, which a real server will reject.")
        } catch (Exception e) {
            log.warn("Could not read the DataPallas API key: ${e.message}")
        }

        // Matches the dev server's -DAPI_KEY=123. Useless against a packaged server, which
        // generates a random key — hence the warning above.
        cachedApiKey = '123'
        return cachedApiKey
    }

    /**
     * Returns a short-lived token that lets the embedded components on this page read ONE report.
     *
     * <p>This is what belongs in the markup — never {@link #getApiKey()}. The API key is this
     * application's own long-lived credential and authenticates as an administrator; anything placed
     * in a page is visible in view-source to every visitor. The token minted here expires within the
     * hour and unlocks exactly the report the page is already displaying, so finding it in view-source
     * gains an attacker nothing.
     *
     * <p>The visitor authenticates with nothing and never sees a login — this app signs on their
     * behalf, which is the whole point of signed embedding and why the demo portals stay
     * friction-free even against a secured DataPallas Server.
     *
     * <p>Tokens are cached per report until shortly before they expire, so this costs one extra HTTP
     * call roughly every fifty minutes across all visitors, not one per page render.
     *
     * Usage in GSP:
     *   &lt;rb-chart report-id="charts-examples"
     *             api-base-url="${RbUtils.apiBaseUrl}"
     *             embed-token="${RbUtils.embedToken('charts-examples')}"&gt;&lt;/rb-chart&gt;
     */
    static String embedToken(String reportId) {

        if (!reportId) return ''

        CachedToken cached = tokenCache[reportId]
        if (cached != null && cached.expiresAtMillis > System.currentTimeMillis()) {
            return cached.token
        }

        try {
            def connection = new URL("${apiBaseUrl}/embed/token").openConnection()
            connection.requestMethod = 'POST'
            connection.doOutput = true
            connection.setRequestProperty('Content-Type', 'application/json')
            connection.setRequestProperty('X-API-Key', getApiKey())
            connection.connectTimeout = 5000
            connection.readTimeout = 5000

            connection.outputStream.withWriter('UTF-8') { it << "{\"reportId\":\"${reportId}\"}" }

            if (connection.responseCode != 200) {
                log.warn("Could not mint an embed token for '${reportId}': HTTP ${connection.responseCode}")
                return ''
            }

            def body = new groovy.json.JsonSlurper().parse(connection.inputStream, 'UTF-8')
            String token = body?.token
            if (!token) return ''

            // Re-mint a few minutes early so a visitor never receives a token that is about to die.
            long ttlSeconds = (body?.expiresInSeconds ?: 3600) as long
            tokenCache[reportId] = new CachedToken(
                    token: token,
                    expiresAtMillis: System.currentTimeMillis() + Math.max(ttlSeconds - 300, 60) * 1000)

            return token

        } catch (Exception e) {
            // A DataPallas that is down or unsecured must not break the page: the components simply
            // send no token, which is exactly right on DataPallas Desktop where none is needed.
            log.warn("Could not mint an embed token for '${reportId}': ${e.message}")
            return ''
        }
    }

    private static class CachedToken {
        String token
        long expiresAtMillis
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
