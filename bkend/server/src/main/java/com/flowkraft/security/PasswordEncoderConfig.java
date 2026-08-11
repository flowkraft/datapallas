package com.flowkraft.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * How passwords are hashed — deliberately apart from {@link SecurityConfig}.
 *
 * <p>It looks like it belongs there, and it must not go back. {@code IamService} takes a
 * {@link PasswordEncoder} in its constructor, so if this bean is declared on {@code SecurityConfig},
 * Spring has to instantiate {@code SecurityConfig} in order to create {@code IamService} — and
 * {@code SecurityConfig} injects {@code IamService} to decide the shape of the filter chain. That is an
 * unbreakable cycle through a constructor argument, and the whole application refuses to start with
 * "the dependencies of some of the beans in the application context form a cycle". Not a subtle
 * degradation: nothing boots, in every deployment mode.
 *
 * <p>A configuration class holding nothing but the encoder has no dependencies of its own, so the cycle
 * cannot form.
 */
@Configuration
public class PasswordEncoderConfig {

	@Bean
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}
}
