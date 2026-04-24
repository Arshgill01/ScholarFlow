package com.scholarflow.backend.nativechat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scholarflow.backend.config.NativeChatProperties;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoogleNativeChatServiceTest {

    @Test
    void generateChatResponseReturnsStructuredOkPayloadWhenRetrievalAndModelSucceed() throws Exception {
        String dbUrl = "jdbc:postgresql://localhost:5433/scholarflow";
        NativeChatProperties properties = new NativeChatProperties(
                true,
                true,
                "fake-key",
                "models/gemini-2.5-flash",
                "models/gemini-embedding-001",
                10000,
                dbUrl,
                "scholar",
                "scholar_pass"
        );

        TestableGoogleNativeChatService service = new TestableGoogleNativeChatService(
                properties,
                RestClient.builder(),
                new ObjectMapper()
        );
        service.setEmbeddingValues(List.of("0.1", "0.2", "0.3"));
        service.setRetrievedChunks(List.of(
                new GoogleNativeChatService.RetrievedChunk("Important finding", "paper.pdf, Page 1")
        ));
        service.setSynthesis("Native synthesized answer [paper.pdf, Page 1]");

        NativeChatResult result = service.generateChatResponse("What is the finding?");
        assertEquals(200, result.statusCode());

        JsonNode payload = new ObjectMapper().readTree(result.body());
        assertEquals("ok", payload.get("status").asText());
        assertTrue(payload.get("sources").toString().contains("paper.pdf, Page 1"));
        assertTrue(payload.get("chunks").toString().contains("Important finding"));
    }

    @Test
    void generateChatResponseReturnsInsufficientDataWhenNoChunksAreRetrieved() throws Exception {
        NativeChatProperties properties = new NativeChatProperties(
                true,
                true,
                "fake-key",
                "models/gemini-2.5-flash",
                "models/gemini-embedding-001",
                10000,
                "jdbc:postgresql://localhost:5433/scholarflow",
                "scholar",
                "scholar_pass"
        );

        TestableGoogleNativeChatService service = new TestableGoogleNativeChatService(
                properties,
                RestClient.builder(),
                new ObjectMapper()
        );
        service.setEmbeddingValues(List.of("0.1", "0.2"));
        service.setRetrievedChunks(List.of());
        service.setSynthesis(null);

        NativeChatResult result = service.generateChatResponse("No docs?");
        JsonNode payload = new ObjectMapper().readTree(result.body());
        assertEquals("insufficient_data", payload.get("status").asText());
    }

    private static final class TestableGoogleNativeChatService extends GoogleNativeChatService {
        private List<String> embeddingValues = List.of();
        private List<RetrievedChunk> retrievedChunks = List.of();
        private String synthesis;

        private TestableGoogleNativeChatService(
                NativeChatProperties properties,
                RestClient.Builder restClientBuilder,
                ObjectMapper objectMapper
        ) {
            super(properties, restClientBuilder, objectMapper);
        }

        void setEmbeddingValues(List<String> embeddingValues) {
            this.embeddingValues = embeddingValues;
        }

        void setRetrievedChunks(List<RetrievedChunk> retrievedChunks) {
            this.retrievedChunks = retrievedChunks;
        }

        void setSynthesis(String synthesis) {
            this.synthesis = synthesis;
        }

        @Override
        protected List<String> embedQuery(String query) {
            return embeddingValues;
        }

        @Override
        protected List<RetrievedChunk> retrieveTopChunks(List<String> queryEmbedding, int limit) {
            return retrievedChunks;
        }

        @Override
        protected String tryGenerateWithGoogle(String query, String contextText) {
            return synthesis;
        }
    }
}
