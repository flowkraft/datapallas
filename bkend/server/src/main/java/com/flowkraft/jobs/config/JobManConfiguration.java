package com.flowkraft.jobs.config;

import jakarta.servlet.MultipartConfigElement;

import java.util.Arrays;

import org.springframework.boot.web.servlet.MultipartConfigFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.unit.DataSize;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import com.flowkraft.common.Constants;

@Configuration
public class JobManConfiguration {

	/*
	 * @Bean
	 * 
	 * @Scope(value = "prototype") public MonitoringFileService
	 * monitorFileService(String fileName) throws Exception { return new
	 * MonitoringFileService(fileName); }
	 * 
	 * 
	 */

	// private static final String FRONTEND_LOCALHOST = "http://localhost:4200";
	// private static final String FRONTEND_STAGING = "https://somehost.github.io";

	@Bean
	MultipartConfigElement multipartConfigElement() {
		MultipartConfigFactory factory = new MultipartConfigFactory();
		factory.setMaxFileSize(DataSize.ofBytes(120000000L));
		factory.setMaxRequestSize(DataSize.ofBytes(120000000L));
		return factory.createMultipartConfig();
	}

	/*
	Provide CORS configuration as a bean so Spring Security and the servlet filter pick it up.
	*/
	@Bean
	public UrlBasedCorsConfigurationSource corsConfigurationSource() {
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();

		CorsConfiguration config = new CorsConfiguration().applyPermitDefaultValues();
		// Credentials are allowed, so the origin list has to be a real list — see
		// Constants.ALLOWED_ORIGIN_PATTERNS for why a wildcard is not an option here.
		config.setAllowCredentials(true);
		config.setAllowedOriginPatterns(Constants.ALLOWED_ORIGIN_PATTERNS);
		config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
		// Headers stay open deliberately. CORS allowed-headers only constrains what a BROWSER will
		// send cross-origin — it protects nothing on the server, since any non-browser client sends
		// whatever it likes. The controls that actually matter here are the origin list above,
		// allowCredentials, and authentication. Enumerating headers instead would add a way for an
		// embedding page to break (rb-webcomponents in Grails/WordPress send their own) in exchange
		// for no security.
		config.setAllowedHeaders(Arrays.asList("*"));
		source.registerCorsConfiguration("/**", config);
		return source;
	}

	@Bean
	public CorsFilter corsFilter(UrlBasedCorsConfigurationSource corsConfigurationSource) {
		return new CorsFilter(corsConfigurationSource);
	}
}
