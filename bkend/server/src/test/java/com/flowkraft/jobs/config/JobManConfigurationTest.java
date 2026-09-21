package com.flowkraft.jobs.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;

/**
 * The CORS rules have to let through every HTTP method the UI uses. A method missing here does
 * not fail loudly: the browser's request is refused with 403 "Invalid CORS request" before any
 * controller runs, and the feature behind it simply does nothing (Pause/Resume, which use PATCH).
 */
public class JobManConfigurationTest {

	@Test
	void everyMethodTheUiSendsIsAllowed() {
		CorsConfiguration cors = new JobManConfiguration().corsConfigurationSource()
				.getCorsConfigurations().get("/**");

		// ApiService: get, post, put, patch (pause/resume a job), delete (cancel a job)
		assertThat(cors.getAllowedMethods()).contains("GET", "POST", "PUT", "PATCH", "DELETE");
	}
}
