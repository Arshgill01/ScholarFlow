package com.scholarflow.backend.bridge;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;

@Service
public class PythonBackendBridge {

    private final RestClient restClient;

    public PythonBackendBridge(RestClient pythonBackendRestClient) {
        this.restClient = pythonBackendRestClient;
    }

    public ResponseEntity<byte[]> get(String path) {
        return restClient.get()
                .uri(path)
                .exchange((request, response) -> toResponseEntity(response.getStatusCode().value(), response.getHeaders(), response.getBody().readAllBytes()));
    }

    public ResponseEntity<byte[]> postJson(String path, Object body) {
        return restClient.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, response) -> toResponseEntity(response.getStatusCode().value(), response.getHeaders(), response.getBody().readAllBytes()));
    }

    public ResponseEntity<byte[]> postMultipart(String path, MultipartFile file) {
        LinkedMultiValueMap<String, Object> body = new LinkedMultiValueMap<>();

        try {
            body.add("file", new NamedByteArrayResource(file.getBytes(), file.getOriginalFilename()));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }

        return restClient.post()
                .uri(path)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .exchange((request, response) -> toResponseEntity(response.getStatusCode().value(), response.getHeaders(), response.getBody().readAllBytes()));
    }

    private ResponseEntity<byte[]> toResponseEntity(int statusCode, HttpHeaders headers, byte[] body) {
        HttpHeaders forwardedHeaders = new HttpHeaders();
        forwardedHeaders.putAll(headers);
        return ResponseEntity.status(statusCode).headers(forwardedHeaders).body(body);
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
