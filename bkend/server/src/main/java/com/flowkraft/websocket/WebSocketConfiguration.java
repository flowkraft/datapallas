package com.flowkraft.websocket;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import com.flowkraft.common.Constants;
import com.flowkraft.security.ApiKeyManager;
import com.flowkraft.security.WebSocketHandshakeInterceptor;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfiguration implements WebSocketMessageBrokerConfigurer {

	@Autowired
	private ApiKeyManager apiKeyManager;

	@Value("${DataPallas.security.enabled:true}")
	private boolean securityEnabled;

	@Override
	public void configureMessageBroker(MessageBrokerRegistry config) {
		config.enableSimpleBroker(Constants.WS_TOPIC_EXECUTION_STATS, Constants.WS_TOPIC_TAILER);

		config.setApplicationDestinationPrefixes("/api");
	}

	@Override
	public void registerStompEndpoints(StompEndpointRegistry registry) {
		registry.addEndpoint(Constants.WS_ENDPOINT)
			.setAllowedOriginPatterns(Constants.ALLOWED_ORIGIN_PATTERNS.toArray(new String[0]))
			.addInterceptors(new WebSocketHandshakeInterceptor(apiKeyManager, false)) // TEMP: disable API key handshake validation during rollback
			.withSockJS();
	}

}
