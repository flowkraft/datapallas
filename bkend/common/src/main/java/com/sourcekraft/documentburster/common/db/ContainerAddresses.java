package com.sourcekraft.documentburster.common.db;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.BiFunction;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.zeroturnaround.exec.ProcessExecutor;
import org.zeroturnaround.exec.ProcessResult;

import com.sourcekraft.documentburster.utils.Utils;

/**
 * Where a service saved as "localhost:&lt;port&gt;" really is, seen from where this JVM runs.
 *
 * On the desktop, and on a Server started on the host JVM, the answer is always "localhost:&lt;port&gt;" -
 * nothing here runs. Inside the shipped Docker server localhost is the container itself, so a connection
 * the user saved against their own machine has to be re-addressed. Two ways out, in this order:
 *
 * 1. the container that publishes that port is on the shared 'datapallas' network, so it can be reached
 *    by name on its own port ("rb-northwind-mariadb:3306"). Nothing leaves the Docker networks, so no
 *    firewall on the host - the customer's or a CI host's - is in the way (plan §4 F2n);
 * 2. nothing publishes it, so it is a service of the customer's own machine: "host.docker.internal:&lt;port&gt;",
 *    the route that has always been used. That one does pass the host's firewall, as any host service does.
 */
public class ContainerAddresses {

	private static final Logger log = LoggerFactory.getLogger(ContainerAddresses.class);

	public static final String HOST_GATEWAY = "host.docker.internal";
	/** The network every DataPallas compose file joins (plan §4 F2n). */
	public static final String SHARED_NETWORK = "datapallas";

	/** `docker ps` is cheap but not free, and a report opens a connection per run. */
	private static final long CACHE_MILLIS = 30_000;
	/**
	 * A port nobody publishes is asked about again sooner: the container behind it is often started a moment
	 * later (the test email server, a sample database), and it must be found then, not half a minute on.
	 */
	private static final long MISS_CACHE_MILLIS = 2_000;
	private static final Map<String, Cached> cache = new ConcurrentHashMap<>();

	private static class Cached {
		final String value;
		final long at;

		Cached(String value) {
			this.value = value;
			this.at = System.currentTimeMillis();
		}
	}

	private ContainerAddresses() {
	}

	/**
	 * The address to dial for a service saved as host:port. Returns host unchanged unless this JVM runs in
	 * the Docker server and the host is localhost.
	 */
	public static String[] resolve(String host, String port) {
		if (!Utils.isRunningInDocker())
			return new String[] { host, port };
		return resolveForContainer(host, port);
	}

	/** scheme://[user@]localhost:port - the only part of a URL that can point at the wrong machine. */
	private static final Pattern LOCAL_URL = Pattern
			.compile("(?i)(\\b[a-z][a-z0-9+.-]*://(?:[^/@\\s\"']*@)?)(localhost|127\\.0\\.0\\.1):(\\d+)");

	/**
	 * Every localhost URL in a command line (an upload's curl command, for instance), each re-addressed as
	 * resolve() does. A command saved against localhost - the billing portal's push to
	 * http://localhost:8500/api/invoices - means the user's machine; in the Docker server that is another
	 * container. Unchanged anywhere else. URLs without an explicit port are left alone.
	 */
	public static String resolveUrlsIn(String command) {
		return resolveUrlsIn(command, ContainerAddresses::resolve);
	}

	static String resolveUrlsIn(String command, BiFunction<String, String, String[]> resolver) {
		if (command == null)
			return null;
		Matcher m = LOCAL_URL.matcher(command);
		StringBuilder out = new StringBuilder();
		while (m.find()) {
			String[] address = resolver.apply(m.group(2), m.group(3));
			m.appendReplacement(out, Matcher.quoteReplacement(m.group(1) + address[0] + ":" + address[1]));
		}
		m.appendTail(out);
		return out.toString();
	}

	/**
	 * The same, for an address that will be dialled from INSIDE a container whatever this JVM is - the JDBC
	 * URL DataPallas hands to the JasperReports renderer, for instance. There localhost is never the user's
	 * machine, so the translation applies on the desktop too.
	 */
	public static String[] resolveForContainer(String host, String port) {
		if (!isLocalhost(host) || port == null || port.trim().isEmpty())
			return new String[] { host, port };

		String published = port.trim();
		Cached hit = cache.get(published);
		if (hit == null || System.currentTimeMillis() - hit.at > (hit.value == null ? MISS_CACHE_MILLIS : CACHE_MILLIS)) {
			hit = new Cached(containerPublishing(published));
			cache.put(published, hit);
		}

		if (hit.value == null)
			return new String[] { HOST_GATEWAY, published };

		String[] parts = hit.value.split(":", 2);
		log.debug("{}:{} is {} on the {} network - connecting to it there", host, published, hit.value,
				SHARED_NETWORK);
		return new String[] { parts[0], parts[1] };
	}

	/** "name:containerPort" of the container publishing this host port, or null if there is none. */
	private static String containerPublishing(String publishedPort) {
		try {
			ProcessResult result = new ProcessExecutor()
					.command("docker", "ps", "--format", "{{.Names}}\t{{.Ports}}\t{{.Networks}}")
					.readOutput(true).timeout(20, TimeUnit.SECONDS).execute();
			if (result.getExitValue() != 0) {
				log.warn("docker ps failed (exit code {}) while looking for the container publishing port {}",
						result.getExitValue(), publishedPort);
				return null;
			}
			return parse(result.getOutput().getString(), publishedPort);
		} catch (Exception e) {
			log.warn("Could not ask Docker which container publishes port {}: {}", publishedPort, e.getMessage());
			return null;
		}
	}

	/**
	 * Reads `docker ps --format "{{.Names}}\t{{.Ports}}"`. A ports column looks like
	 * "0.0.0.0:3307-&gt;3306/tcp, [::]:3307-&gt;3306/tcp"; the IPv4 and IPv6 entries of one mapping say the
	 * same thing, so the first match wins.
	 */
	static String parse(String dockerPsOutput, String publishedPort) {
		if (dockerPsOutput == null)
			return null;
		for (String line : dockerPsOutput.split("\\R")) {
			String[] columns = line.split("\t");
			// name, ports, networks - a container on no network of ours cannot be reached by name, so it is
			// left to the host gateway even when it publishes the port we are after.
			if (columns.length != 3 || !onSharedNetwork(columns[2]))
				continue;
			for (String mapping : columns[1].split(",")) {
				String m = mapping.trim();
				int arrow = m.indexOf("->");
				if (arrow < 0)
					continue;
				String left = m.substring(0, arrow);
				String right = m.substring(arrow + 2);
				String hostPort = left.substring(left.lastIndexOf(':') + 1);
				if (!hostPort.equals(publishedPort))
					continue;
				String containerPort = right.contains("/") ? right.substring(0, right.indexOf('/')) : right;
				return columns[0].trim() + ":" + containerPort.trim();
			}
		}
		return null;
	}

	private static boolean onSharedNetwork(String networksColumn) {
		for (String network : networksColumn.split(","))
			if (SHARED_NETWORK.equals(network.trim()))
				return true;
		return false;
	}

	private static boolean isLocalhost(String host) {
		if (host == null)
			return false;
		String h = host.trim();
		return "localhost".equalsIgnoreCase(h) || "127.0.0.1".equals(h);
	}

	/** Only for tests: the next resolve() asks Docker again. */
	static void forgetEverything() {
		cache.clear();
	}
}
