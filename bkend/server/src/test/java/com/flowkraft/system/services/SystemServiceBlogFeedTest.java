package com.flowkraft.system.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;

import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.LoggerContext;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.LoggerConfig;
import org.apache.logging.log4j.core.config.Property;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import reactor.core.publisher.Flux;

/**
 * {@link SystemService#getBlogPosts}: the What's New blog feed is a nice-to-have.
 *
 * <p>
 * A feed that cannot be read used to come back as an error, which the server logged as an ERROR; a
 * non-empty errors.log then blocked the user's next job (run A). Every way the feed can fail must
 * give the empty feed instead, with nothing logged at ERROR, by {@code com.flowkraft} or by the root
 * logger (where Reactor logs an error it dropped): nothing listening, a server that never answers
 * (the 5 s timeout), an HTTP 500, a body that is not XML, and answers arriving as the time limit ends.
 * </p>
 */
class SystemServiceBlogFeedTest {

	private final List<LogEvent> errors = new CopyOnWriteArrayList<>();

	private AbstractAppender capture;

	private LoggerConfig flowkraft;

	private LoggerConfig root;

	@BeforeEach
	void captureErrors() {
		LoggerContext context = (LoggerContext) LogManager.getContext(false);
		flowkraft = context.getConfiguration().getLoggerConfig("com.flowkraft");
		capture = new AbstractAppender("blog-feed-test", null, null, true, Property.EMPTY_ARRAY) {
			@Override
			public void append(LogEvent event) {
				if (event.getLevel().isMoreSpecificThan(Level.ERROR))
					errors.add(event.toImmutable());
			}
		};
		capture.start();
		flowkraft.addAppender(capture, Level.ALL, null);
		root = context.getConfiguration().getRootLogger();
		root.addAppender(capture, Level.ALL, null);
		context.updateLoggers();
	}

	@AfterEach
	void stopCapturing() {
		flowkraft.removeAppender(capture.getName());
		root.removeAppender(capture.getName());
		((LoggerContext) LogManager.getContext(false)).updateLoggers();
		capture.stop();
	}

	@Test
	void nothingListening_emptyFeed() throws Exception {
		int port;
		try (ServerSocket socket = new ServerSocket(0)) {
			port = socket.getLocalPort();
		}
		assertEmptyFeed("http://127.0.0.1:" + port + "/feed/");
	}

	@Test
	void serverThatNeverAnswers_emptyFeedAfterTheTimeout() throws Exception {
		// The connection is accepted (the socket's backlog) and the request is never read.
		try (ServerSocket silent = new ServerSocket(0)) {
			long started = System.nanoTime();
			assertEmptyFeed("http://127.0.0.1:" + silent.getLocalPort() + "/feed/");
			long seconds = Duration.ofNanos(System.nanoTime() - started).toSeconds();
			assertTrue(seconds < 15, "the 5 s timeout ends the wait, not the test's own bound: " + seconds + " s");
		}
	}

	@Test
	void http500_emptyFeed() throws Exception {
		assertEmptyFeedFrom(500, "<html><body>Internal Server Error</body></html>");
	}

	@Test
	void bodyThatIsNotXml_emptyFeed() throws Exception {
		assertEmptyFeedFrom(200, "{\"this is\": \"not XML\"");
	}

	@Test
	void answersArrivingAsTheLimitEnds_theFeedOrTheEmptyFeed_neverAnError() throws Exception {
		// Reactor's timeout() cancelled some calls just as their answer arrived: Reactor dropped the body's error
		// and logged it as an ERROR (33 of 1000 calls, 2026-11-01). The first round warms the client up, so that
		// answers do arrive at the limit in the second.
		Duration limit = Duration.ofMillis(200);
		ExecutorService answering = Executors.newFixedThreadPool(100);
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 200);
		server.setExecutor(answering);
		server.createContext("/", exchange -> {
			try {
				Thread.sleep(limit.toMillis() - 5 + ThreadLocalRandom.current().nextInt(10));
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			byte[] bytes = "<rss><channel><item><title>a post</title></item></channel></rss>".getBytes(StandardCharsets.UTF_8);
			exchange.sendResponseHeaders(200, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		server.start();
		try {
			String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/feed/";
			for (int round = 1; round <= 2; round++) {
				List<String> feeds = Flux.range(0, 1000).flatMap(i -> new SystemService().getBlogPosts(url, limit), 100)
						.collectList().block(Duration.ofSeconds(60));
				assertEquals(1000, feeds.size(), "every call of round " + round + " answered");
				assertTrue(feeds.stream().allMatch(f -> f.equals(SystemService.EMPTY_BLOG_FEED) || f.contains("a post")),
						"the feed or the empty feed, round " + round);
			}
			// an answer still on its way when its call ended arrives within one more limit, and a dropped error with it
			Thread.sleep(limit.toMillis());
			assertTrue(errors.isEmpty(), "nothing logged at ERROR: " + errors.stream()
					.map(e -> e.getLoggerName() + " " + e.getMessage().getFormattedMessage()).toList());
		} finally {
			server.stop(0);
			answering.shutdownNow();
		}
	}

	/** A local server answering every request with {@code status} and {@code body}. */
	private void assertEmptyFeedFrom(int status, String body) throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", exchange -> {
			byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
			exchange.sendResponseHeaders(status, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		server.start();
		try {
			assertEmptyFeed("http://127.0.0.1:" + server.getAddress().getPort() + "/feed/");
		} finally {
			server.stop(0);
		}
	}

	private void assertEmptyFeed(String url) {
		String feed = new SystemService().getBlogPosts(url).block(Duration.ofSeconds(30));
		assertEquals(SystemService.EMPTY_BLOG_FEED, feed, "the empty feed");
		assertTrue(errors.isEmpty(), "nothing logged at ERROR: " + errors.stream()
				.map(e -> e.getLoggerName() + " " + e.getMessage().getFormattedMessage()).toList());
	}
}
