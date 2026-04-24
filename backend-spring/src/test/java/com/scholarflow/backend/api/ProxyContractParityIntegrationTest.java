package com.scholarflow.backend.api;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProxyContractParityIntegrationTest {

    private static HttpServer pythonStub;

    private static final AtomicReference<ResponseSpec> healthResponse = new AtomicReference<>(defaultHealthResponse());
    private static final AtomicReference<ResponseSpec> documentsResponse = new AtomicReference<>(defaultDocumentsResponse());
    private static final AtomicReference<ResponseSpec> uploadResponse = new AtomicReference<>(defaultUploadResponse());
    private static final AtomicReference<ResponseSpec> chatResponse = new AtomicReference<>(defaultChatResponse());
    private static final AtomicReference<String> lastUploadContentType = new AtomicReference<>("");
    private static final AtomicReference<String> lastUploadBody = new AtomicReference<>("");

    @LocalServerPort
    private int springPort;

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("scholarflow.migration.python-backend-url", ProxyContractParityIntegrationTest::pythonStubBaseUrl);
        registry.add("scholarflow.migration.connect-timeout-ms", () -> 5000);
        registry.add("scholarflow.migration.read-timeout-ms", () -> 60000);
    }

    @BeforeEach
    void resetSpecs() {
        healthResponse.set(defaultHealthResponse());
        documentsResponse.set(defaultDocumentsResponse());
        uploadResponse.set(defaultUploadResponse());
        chatResponse.set(defaultChatResponse());
        lastUploadContentType.set("");
        lastUploadBody.set("");
    }

    @AfterAll
    static void tearDown() {
        if (pythonStub != null) {
            pythonStub.stop(0);
            pythonStub = null;
        }
    }

    @Test
    void springProxyMatchesPythonContractForSuccessScenarios() {
        HttpResult directHealth = get(pythonStubBaseUrl(), "/health");
        HttpResult springHealth = get(springBaseUrl(), "/health");
        assertSameContract(directHealth, springHealth);

        HttpResult directDocuments = get(pythonStubBaseUrl(), "/documents/");
        HttpResult springDocuments = get(springBaseUrl(), "/documents/");
        assertSameContract(directDocuments, springDocuments);

        HttpResult directUpload = postMultipart(pythonStubBaseUrl(), "/documents/upload");
        HttpResult springUpload = postMultipart(springBaseUrl(), "/documents/upload");
        assertSameContract(directUpload, springUpload);
        assertTrue(lastUploadContentType.get().startsWith("multipart/form-data"));
        assertTrue(lastUploadBody.get().contains("paper.pdf"));

        String chatBody = "{\"query\":\"Summarize the paper\"}";
        HttpResult directChat = postJson(pythonStubBaseUrl(), "/chat/", chatBody);
        HttpResult springChat = postJson(springBaseUrl(), "/chat/", chatBody);
        assertSameContract(directChat, springChat);
    }

    @Test
    void springProxyMatchesPythonContractForDownstreamErrorScenario() {
        chatResponse.set(new ResponseSpec(503, "{\"detail\":\"RAG unavailable\"}", MediaType.APPLICATION_JSON_VALUE));

        String chatBody = "{\"query\":\"Summarize the paper\"}";
        HttpResult directChat = postJson(pythonStubBaseUrl(), "/chat/", chatBody);
        HttpResult springChat = postJson(springBaseUrl(), "/chat/", chatBody);
        assertSameContract(directChat, springChat);
    }

    private static synchronized String pythonStubBaseUrl() {
        if (pythonStub == null) {
            startPythonStub();
        }
        return "http://localhost:" + pythonStub.getAddress().getPort();
    }

    private String springBaseUrl() {
        return "http://localhost:" + springPort;
    }

    private static void startPythonStub() {
        try {
            pythonStub = HttpServer.create(new InetSocketAddress(0), 0);
            pythonStub.createContext("/health", exchange -> respond(exchange, healthResponse.get()));
            pythonStub.createContext("/documents/", exchange -> respond(exchange, documentsResponse.get()));
            pythonStub.createContext("/chat/", exchange -> respond(exchange, chatResponse.get()));
            pythonStub.createContext("/documents/upload", exchange -> {
                lastUploadContentType.set(exchange.getRequestHeaders().getFirst("Content-type"));
                lastUploadBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, uploadResponse.get());
            });
            pythonStub.start();
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private static ResponseSpec defaultHealthResponse() {
        return new ResponseSpec(200, "{\"status\":\"healthy\"}", MediaType.APPLICATION_JSON_VALUE);
    }

    private static ResponseSpec defaultDocumentsResponse() {
        return new ResponseSpec(200, "[{\"id\":1,\"filename\":\"paper.pdf\"}]", MediaType.APPLICATION_JSON_VALUE);
    }

    private static ResponseSpec defaultUploadResponse() {
        return new ResponseSpec(
                200,
                "{\"message\":\"Document uploaded and processed successfully\",\"document_id\":42,\"filename\":\"paper.pdf\"}",
                MediaType.APPLICATION_JSON_VALUE
        );
    }

    private static ResponseSpec defaultChatResponse() {
        return new ResponseSpec(
                200,
                """
                        {
                          "status": "ok",
                          "answer": "### Synthesis\\nStructured answer",
                          "sources": ["paper.pdf, Page 1"],
                          "chunks": [{"text": "Evidence", "source": "paper.pdf, Page 1"}],
                          "sections": [
                            {"key": "synthesis", "title": "Synthesis", "body": "Structured answer", "items": []},
                            {"key": "key_data_points", "title": "Key Data Points", "body": null, "items": ["Point 1"]},
                            {"key": "sources", "title": "Sources", "body": null, "items": ["paper.pdf, Page 1"]}
                          ]
                        }
                        """.trim(),
                MediaType.APPLICATION_JSON_VALUE
        );
    }

    private HttpResult get(String baseUrl, String path) {
        RestClient restClient = RestClient.builder().baseUrl(baseUrl).build();
        return restClient.get()
                .uri(path)
                .exchange((request, response) -> toHttpResult(response.getStatusCode().value(), response.getBody().readAllBytes()));
    }

    private HttpResult postJson(String baseUrl, String path, String body) {
        RestClient restClient = RestClient.builder().baseUrl(baseUrl).build();
        return restClient.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, response) -> toHttpResult(response.getStatusCode().value(), response.getBody().readAllBytes()));
    }

    private HttpResult postMultipart(String baseUrl, String path) {
        RestClient restClient = RestClient.builder().baseUrl(baseUrl).build();
        LinkedMultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new NamedByteArrayResource("%PDF-1.4".getBytes(StandardCharsets.UTF_8), "paper.pdf"));

        return restClient.post()
                .uri(path)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .exchange((request, response) -> toHttpResult(response.getStatusCode().value(), response.getBody().readAllBytes()));
    }

    private HttpResult toHttpResult(int statusCode, byte[] body) {
        return new HttpResult(statusCode, new String(body, StandardCharsets.UTF_8));
    }

    private void assertSameContract(HttpResult expected, HttpResult actual) {
        assertEquals(expected.statusCode(), actual.statusCode());
        assertEquals(expected.body(), actual.body());
    }

    private static void respond(HttpExchange exchange, ResponseSpec spec) throws IOException {
        byte[] bytes = spec.body().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", spec.contentType());
        exchange.sendResponseHeaders(spec.statusCode(), bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }

    private record ResponseSpec(int statusCode, String body, String contentType) {
    }

    private record HttpResult(int statusCode, String body) {
    }

    private static final class NamedByteArrayResource extends ByteArrayResource {
        private final String filename;

        private NamedByteArrayResource(byte[] byteArray, String filename) {
            super(byteArray);
            this.filename = filename;
        }

        @Override
        public String getFilename() {
            return filename;
        }
    }
}
