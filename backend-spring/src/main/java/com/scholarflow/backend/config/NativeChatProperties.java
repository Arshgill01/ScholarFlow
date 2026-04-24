package com.scholarflow.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "scholarflow.native-chat")
public record NativeChatProperties(
        boolean enabled,
        boolean fallbackToPython,
        String googleApiKey,
        String googleChatModel,
        String googleEmbeddingModel,
        int googleTimeoutMs,
        String databaseUrl,
        String databaseUsername,
        String databasePassword
) {
}
