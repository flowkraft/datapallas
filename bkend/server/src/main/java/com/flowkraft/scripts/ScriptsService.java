package com.flowkraft.scripts;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.flowkraft.queries.services.QueriesService;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

/**
 * Executes inline Groovy scripts for the data canvas Script mode.
 * Scripts receive a minimal ctx with ctx.dbSql wired to the connection,
 * and should return List<Map> (or assign it to a variable and use return).
 *
 * Example script:
 *   def data = ctx.dbSql.rows('SELECT ShipCountry, SUM(Freight) AS total FROM Orders GROUP BY ShipCountry')
 *   return data
 */
@Service
public class ScriptsService {

    private static final Logger log = LoggerFactory.getLogger(ScriptsService.class);

    @Autowired
    private QueriesService queriesService;

    /** Binding names the script itself relies on — a filter value may not take them over. */
    private static final Set<String> RESERVED_BINDING_NAMES = Set.of("ctx", "log");

    @Value("${DataPallas.scripts.timeout-seconds:60}")
    private int timeoutSeconds;

    private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "inline-script");
        t.setDaemon(true);
        return t;
    });

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> executeScript(
            String connectionId, String script, Map<String, Object> filterValues) throws Exception {
        DbSqlProxy dbSqlProxy = new DbSqlProxy(connectionId, queriesService);
        ScriptContext ctx = new ScriptContext(dbSqlProxy);

        Binding binding = new Binding();
        binding.setVariable("ctx", ctx);
        binding.setVariable("log", LoggerFactory.getLogger("ScriptExecution"));
        // Bind each filter value as a named Groovy variable so ${paramName} resolves
        // naturally in Groovy GStrings (e.g. "WHERE col = ${shipper}").
        if (filterValues != null) {
            for (Map.Entry<String, Object> entry : filterValues.entrySet()) {
                if (RESERVED_BINDING_NAMES.contains(entry.getKey()))
                    throw new IllegalArgumentException(
                            "Filter name '" + entry.getKey() + "' is reserved and cannot be used");
                binding.setVariable(entry.getKey(), entry.getValue());
            }
        }

        GroovyShell shell = new GroovyShell(binding);

        log.debug("Executing inline script on connection '{}': {}",
                connectionId,
                script.length() > 120 ? script.substring(0, 120) + "..." : script);

        Object result = evaluateWithTimeout(shell, script);

        if (result instanceof List) {
            return (List<Map<String, Object>>) result;
        }

        log.debug("Script returned non-List result ({}); returning empty", result == null ? "null" : result.getClass().getName());
        return Collections.emptyList();
    }

    /**
     * Run the script off the HTTP thread so a slow or looping script releases the request
     * instead of pinning a Tomcat worker until it finishes.
     *
     * <p>This bounds the <em>request</em>, not the script: Groovy does not have to honour
     * the interrupt, so a tight loop keeps burning its own thread after we give up on it.
     * That is deliberate — an inline script is authored by a trusted user of this
     * installation, and the containment that actually matters is the installation itself,
     * not a timer.
     */
    private Object evaluateWithTimeout(GroovyShell shell, String script) throws Exception {
        Future<Object> future = executor.submit(() -> shell.evaluate(script));
        try {
            return future.get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new IllegalStateException("Script did not finish within " + timeoutSeconds + " seconds");
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception)
                throw (Exception) cause;
            throw new IllegalStateException(cause);
        }
    }
}
