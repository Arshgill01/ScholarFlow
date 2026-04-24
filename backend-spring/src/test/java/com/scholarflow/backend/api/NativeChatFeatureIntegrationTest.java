package com.scholarflow.backend.api;

import com.scholarflow.backend.nativechat.NativeChatService;
import com.scholarflow.backend.nativechat.NativeChatResult;
import com.scholarflow.backend.nativechat.NativeChatUnavailableException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NativeChatFeatureIntegrationTest {

    private static final AtomicReference<Mode> mode = new AtomicReference<>(Mode.SUCCESS);

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("scholarflow.native-chat.enabled", () -> true);
        registry.add("scholarflow.native-chat.fallback-to-python", () -> false);
        registry.add("scholarflow.migration.python-backend-url", () -> "http://localhost:65535");
    }

    @Test
    void chatReturnsNativePayloadWhenNativeModeIsEnabled() {
        mode.set(Mode.SUCCESS);

        ResponseEntity<String> response = postChat("Summarize natively");

        assertEquals(HttpStatus.OK, response.getStatusCode());

        try {
            JsonNode payload = objectMapper.readTree(response.getBody());
            assertEquals("ok", payload.get("status").asText());
            assertTrue(payload.get("sources").toString().contains("native-spring"));
        } catch (Exception exception) {
            throw new AssertionError("Failed to parse native chat JSON payload", exception);
        }
    }

    @Test
    void chatReturnsServiceUnavailableWhenNativeModeFailsWithoutFallback() {
        mode.set(Mode.FAILURE);

        ResponseEntity<String> response = postChat("Summarize natively");

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        assertTrue(response.getBody().contains("Injected native failure"));
    }

    private ResponseEntity<String> postChat(String query) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<String> request = new HttpEntity<>("{\"query\":\"" + query + "\"}", headers);

        return restTemplate.exchange("/chat/", HttpMethod.POST, request, String.class);
    }

    enum Mode {
        SUCCESS,
        FAILURE
    }

    @TestConfiguration
    static class NativeChatTestConfig {

        @Bean
        @Primary
        NativeChatService nativeChatService() {
            return query -> {
                if (mode.get() == Mode.FAILURE) {
                    throw new NativeChatUnavailableException("Injected native failure");
                }
                return new NativeChatResult(200, ("""
                        {
                          "status": "ok",
                          "answer": "### Synthesis\\nNative feature integration response",
                          "sources": ["native-spring"],
                          "chunks": [{"text":"Native chunk","source":"native-spring"}],
                          "sections": [
                            {"key":"synthesis","title":"Synthesis","body":"Native feature integration response","items":[]},
                            {"key":"key_data_points","title":"Key Data Points","body":null,"items":["Native point"]},
                            {"key":"sources","title":"Sources","body":null,"items":["native-spring"]}
                          ]
                        }
                        """).trim().getBytes());
            };
        }
    }
}
