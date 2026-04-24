package com.scholarflow.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class PythonBackendClientConfig {

    @Bean
    public RestClient pythonBackendRestClient(MigrationProperties migrationProperties, RestClient.Builder builder) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(migrationProperties.connectTimeoutMs());
        requestFactory.setReadTimeout(migrationProperties.readTimeoutMs());

        return builder
                .baseUrl(migrationProperties.pythonBackendUrl())
                .requestFactory(requestFactory)
                .build();
    }
}
