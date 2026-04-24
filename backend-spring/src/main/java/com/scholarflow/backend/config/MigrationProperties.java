package com.scholarflow.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "scholarflow.migration")
public record MigrationProperties(
        String mode,
        String pythonBackendUrl,
        int connectTimeoutMs,
        int readTimeoutMs
) {
}
