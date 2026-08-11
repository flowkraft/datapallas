package com.flowkraft.security;

import java.io.IOException;
import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Authentication filter for API key-based access (Electron, Grails, WordPress).
 * 
 * This filter handles machine-to-machine authentication where the client
 * reads the API key from the file system (config/_internal/api-key.txt)
 * and sends it as X-API-Key header.
 * 
 * This is used alongside Spring Security's standard session-based auth:
 * - Angular web mode: Uses session + CSRF (standard Spring pattern)
 * - Electron/Grails/WordPress: Uses API key (this filter)
 * 
 * If X-API-Key header is present and valid, this filter authenticates the request.
 * For WebSocket endpoints, also checks access_token query parameter (SockJS pattern).
 * If not present, the request continues to standard session-based authentication.
 */
public class ApiKeyAuthenticationFilter extends OncePerRequestFilter {
    
    private static final String API_KEY_HEADER = "X-API-Key";
    private static final String ACCESS_TOKEN_PARAM = "access_token";
    
    private final ApiKeyManager apiKeyManager;
    
    public ApiKeyAuthenticationFilter(ApiKeyManager apiKeyManager) {
        this.apiKeyManager = apiKeyManager;
    }
    
    @Override
    protected void doFilterInternal(HttpServletRequest request, 
                                    HttpServletResponse response, 
                                    FilterChain filterChain) 
            throws ServletException, IOException {
        
        String path = request.getRequestURI();

        // 1) Fast-pass for frontend static assets (important: add all needed patterns)
        if (path.startsWith("/lib/frend/") || path.startsWith("/assets/") ||
            path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".map") ||
            path.endsWith(".png") || path.endsWith(".svg") || path.endsWith(".woff") ||
            path.endsWith(".woff2") || path.endsWith(".eot") || path.endsWith(".ttf")) {
            filterChain.doFilter(request, response);
            return;
        }
        
        try {
            String apiKey = request.getHeader(API_KEY_HEADER);

            // SockJS cannot set headers on its handshake, so the WebSocket endpoint accepts the key as
            // a query parameter instead.
            if ((apiKey == null || apiKey.isEmpty()) && request.getRequestURI().contains("/ws")) {
                apiKey = request.getParameter(ACCESS_TOKEN_PARAM);
            }

            if (apiKey != null && !apiKey.isEmpty() && apiKeyManager.isValidApiKey(apiKey)) {
                // A valid installation key identifies a machine caller, not a person. It is granted
                // ADMIN because that is what the callers holding it need — the AI Hub proxy and
                // the embedding apps read and write configuration. A per-user token is the finer-grained
                // alternative, issued from the api_token table.
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        "api-key-user", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"),
                                new SimpleGrantedAuthority("ROLE_REPORT_AUTHOR"),
                                new SimpleGrantedAuthority("ROLE_JOB_OPERATOR")));

                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
            // An absent or invalid key is not an error here — the request simply continues
            // unauthenticated and the filter chain refuses it if the endpoint needs a principal.

            filterChain.doFilter(request, response);
        } catch (Exception ex) {
            logger.error("API key authentication failed for request " + path, ex);
            response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
        }
    }
}
