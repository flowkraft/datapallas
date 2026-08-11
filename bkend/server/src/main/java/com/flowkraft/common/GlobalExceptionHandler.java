package com.flowkraft.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.sourcekraft.documentburster.utils.PathOutsidePortableDirException;

import java.util.Map;

/**
 * The ONE catch for the Spring Boot REST server.
 *
 * <h2>Exception handling philosophy</h2>
 * Controllers and services NEVER catch. Every {@code Throwable} propagates up
 * the request chain and lands here — the single {@code @RestControllerAdvice}
 * for the app. This handler does three things:
 * <ol>
 *   <li>log the full stack trace via SLF4J — the {@code com.flowkraft} logger
 *       is wired to both the Console appender (stdout) and the error-out
 *       appender ({@code errors.log}), so every unhandled exception is
 *       visible in the server console AND persisted to disk with the
 *       offending HTTP method + path as a prefix;</li>
 *   <li>return HTTP 500 with a compact JSON body ({@code {"error": "..."}})
 *       so the client gets a structured response instead of Spring's default
 *       HTML error page;</li>
 *   <li>the server process keeps running — unlike a CLI, a long-lived REST
 *       server must survive one bad request and serve the next one cleanly.</li>
 * </ol>
 * This mirrors the discipline in {@code bkend/reporting}'s
 * {@link com.sourcekraft.documentburster.DocumentBurster} — single
 * top-level handler, full stack on every exception — but DocumentBurster
 * rethrows (because the JVM is about to exit after the run), whereas this
 * handler returns a {@code ResponseEntity} (because the JVM must stay alive).
 * Same philosophy, different termination semantics.
 *
 * <p><b>Note:</b> this is the DEFAULT general approach, not an absolute rule.
 * A handful of scattered {@code catch} blocks still exist across controllers,
 * services, and schedulers, and each remaining one is there for a specific
 * reason:
 * <ul>
 *   <li><b>Business-logic-justified</b> — the catch site is where the
 *       recovery/fallback actually belongs (e.g. {@code DockerService}'s
 *       "Docker not installed → mark unavailable and continue"; a probe that
 *       must return a safe default when the target resource is missing;
 *       a best-effort cleanup that must not mask the original failure);</li>
 *   <li><b>Technical obligation</b> — background schedulers
 *       ({@code PollScheduler}, {@code JobExecutionService},
 *       {@code StarterPacksManagementService}) run outside the HTTP request
 *       lifecycle, so {@code @RestControllerAdvice} never fires for them and
 *       they MUST catch locally (still logging with the full stack via
 *       {@code log.error("...", e)} — never just {@code e.getMessage()}).
 *       Similarly, framework callback signatures sometimes don't allow
 *       propagation across the boundary.</li>
 * </ul>
 * No {@code catch} block should exist just because leaving one in was the
 * path of least resistance. Every surviving catch needs to be justifiable
 * under one of the two rules above; if it isn't, delete it and let the
 * exception reach this handler.
 *
 * <p>Such exceptions to the rule should be <b>very few and genuinely
 * exceptional</b> — if you find yourself reaching for a catch in new code,
 * assume the default rule applies and push back hard on any attempt to
 * introduce another one. The further this codebase drifts from "one catch
 * per layer", the harder it becomes to see what actually went wrong.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * A path parameter that resolves outside the installation directory is a bad request,
     * not a server failure — answer 400 without echoing whether the target exists.
     */
    @ExceptionHandler(PathOutsidePortableDirException.class)
    public ResponseEntity<Map<String, String>> handlePathOutsidePortableDir(
            PathOutsidePortableDirException ex, HttpServletRequest request) {
        log.warn("Rejected path outside the installation directory [{} {}]: {}",
                request.getMethod(), request.getRequestURI(), ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", ex.getMessage()));
    }

    /**
     * Authorization decisions belong to Spring Security, not here.
     *
     * <p>Without this, the catch-all below swallows {@code AccessDeniedException} and answers 500 —
     * so a refusal is indistinguishable from a crash. The caller cannot react to it (the frontend
     * routes to the login screen on 401 and shows "you do not have permission" on 403, and gets
     * neither), and errors.log fills with stack traces for what is simply the rules working. Letting
     * it propagate hands it back to {@code ExceptionTranslationFilter}, which answers 403 for a
     * signed-in user and 401 for an anonymous one.
     */
    @ExceptionHandler({ AccessDeniedException.class, AuthenticationException.class })
    public void handleAuthorization(RuntimeException ex) throws RuntimeException {
        throw ex;
    }

    /**
     * A static file that does not exist is a 404, and Spring already knew that.
     *
     * <p>{@code ExceptionHandlerExceptionResolver} runs ahead of Spring's own
     * {@code DefaultHandlerExceptionResolver}, so without this the catch-all below intercepts
     * {@link NoResourceFoundException} — an exception the framework raises to MEAN "404" — and
     * turns it into a 500 with a seventy-line stack trace in errors.log.
     *
     * <p>The one that shows up constantly is {@code GET /favicon.ico}: a published dashboard page
     * declares no icon, so every browser asks for it, and a desktop install has no {@code lib/frend}
     * to answer from (that is the web bundle, shipped with Server). Logging it as an error puts a
     * red badge in the UI for a browser doing something entirely routine, and buries the failures
     * that are real.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, String>> handleNoResourceFound(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(Throwable.class)
    public ResponseEntity<Map<String, String>> handleAll(Throwable ex, HttpServletRequest request) {
        if (!isExpectedNetworkNoise(ex)) {
            log.error("Exception [{} {}]",
                    request.getMethod(),
                    request.getRequestURI(), ex);
        }
        // Console appender on com.flowkraft logger = already on stdout.
        // Return HTTP 500 so server stays up (unlike DocumentBurster which rethrows and exits JVM).
        String message = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", message));
    }

    /**
     * Returns true for exceptions that are expected network noise and must NOT be logged.
     *
     * <p>This list must stay very short. Every entry here is a deliberate decision to suppress
     * a class of errors that would otherwise pollute errors.log with false positives, making
     * real problems harder to spot. Each entry below documents exactly why it qualifies.
     *
     * <p>Walk the full cause chain — exceptions are often wrapped by the framework before
     * reaching this handler (e.g. WebClientRequestException wrapping PrematureCloseException).
     */
    private static boolean isExpectedNetworkNoise(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            String name = t.getClass().getName();

            // WHY: outgoing WebClient calls to external servers (pdfburst.com changelog, RSS feed)
            // sometimes close the TCP connection before sending a response — this is a transient
            // remote-side behaviour, not a server bug. The calling code already handles the
            // absence of a response gracefully. Logging full stack traces for every such event
            // would bury real errors in noise.
            if ("reactor.netty.http.client.PrematureCloseException".equals(name)) {
                return true;
            }

            // WHY: GET /api/system/blog-posts fetches the pdfburst.com RSS feed on startup.
            // If the remote server resets the TCP connection before sending a response,
            // WebFlux wraps SocketException as WebClientRequestException("Connection reset"),
            // and the XML→JSON converter then throws RuntimeException("Error converting XML
            // to JSON"). The app returns an empty list gracefully — the stack trace is
            // transient network noise, not a server bug. The check is intentionally tight:
            // only a RuntimeException with this exact message wrapping a WebClientRequestException
            // that itself contains "Connection reset" — nothing broader.
            if (t instanceof RuntimeException
                    && "Error converting XML to JSON".equals(t.getMessage())) {
                for (Throwable c = t.getCause(); c != null; c = c.getCause()) {
                    if (c.getClass().getName().equals(
                            "org.springframework.web.reactive.function.client.WebClientRequestException")
                            && c.getMessage() != null
                            && c.getMessage().contains("Connection reset")) {
                        return true;
                    }
                }
            }

            // WHY: the Angular frontend navigates away from a screen while the server is still
            // streaming a response (e.g. GET /api/system/changelog, which is fetched in the
            // background on screen load). Navigation cancels the pending HTTP request, closing
            // the TCP socket. The server then tries to write the next chunk and gets an
            // IOException ("connection forcibly closed"). Spring wraps this as
            // AsyncRequestNotUsableException. There is no bug — the response was partially
            // delivered and the client no longer needs the rest. Logging it as an error would
            // make every fast navigation during e2e tests produce a false alarm in errors.log.
            if ("org.springframework.web.context.request.async.AsyncRequestNotUsableException".equals(name)) {
                return true;
            }
        }
        return false;
    }
}
