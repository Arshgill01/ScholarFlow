package com.scholarflow.backend.bridge;

import com.scholarflow.backend.config.MigrationProperties;
import com.scholarflow.backend.config.PythonBackendClientConfig;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PythonBackendBridgeTest {

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void getPreservesStatusAndBody() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/health", exchange -> respond(exchange, 200, "{\"status\":\"healthy\"}", MediaType.APPLICATION_JSON_VALUE));
        server.start();

        PythonBackendBridge bridge = buildBridge();
        var response = bridge.get("/health");

        assertEquals(200, response.getStatusCode().value());
        assertEquals("{\"status\":\"healthy\"}", new String(response.getBody(), StandardCharsets.UTF_8));
    }

    @Test
    void postJsonPreservesDownstreamFailures() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/chat/", exchange -> respond(exchange, 503, "{\"detail\":\"RAG unavailable\"}", MediaType.APPLICATION_JSON_VALUE));
        server.start();

        PythonBackendBridge bridge = buildBridge();
        var response = bridge.postJson("/chat/", new ChatPayload("Hello"));

        assertEquals(503, response.getStatusCode().value());
        assertEquals("{\"detail\":\"RAG unavailable\"}", new String(response.getBody(), StandardCharsets.UTF_8));
    }

    @Test
    void postMultipartForwardsFilePayload() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>("");
        AtomicReference<String> contentType = new AtomicReference<>("");

        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/documents/upload", exchange -> {
            contentType.set(exchange.getRequestHeaders().getFirst("Content-type"));
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, 200, "{\"message\":\"ok\"}", MediaType.APPLICATION_JSON_VALUE);
        });
        server.start();

        PythonBackendBridge bridge = buildBridge();
        MockMultipartFile file = new MockMultipartFile("file", "paper.pdf", "application/pdf", "%PDF-1.4".getBytes());
        var response = bridge.postMultipart("/documents/upload", file);

        assertEquals(200, response.getStatusCode().value());
        assertTrue(contentType.get().startsWith("multipart/form-data"));
        assertTrue(requestBody.get().contains("paper.pdf"));
    }

    private PythonBackendBridge buildBridge() {
        String baseUrl = "http://localhost:" + server.getAddress().getPort();
        MigrationProperties migrationProperties = new MigrationProperties("parallel-scaffold", baseUrl, 5000, 60000);
        RestClient restClient = new PythonBackendClientConfig().pythonBackendRestClient(migrationProperties, RestClient.builder());
        return new PythonBackendBridge(restClient);
    }

    private void respond(HttpExchange exchange, int statusCode, String body, String contentType) throws IOException {
        exchange.getResponseHeaders().add("Content-Type", contentType);
        exchange.sendResponseHeaders(statusCode, body.getBytes(StandardCharsets.UTF_8).length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(body.getBytes(StandardCharsets.UTF_8));
        }
    }

    private record ChatPayload(String query) {
    }
}
