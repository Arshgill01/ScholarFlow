package com.scholarflow.backend.nativechat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.scholarflow.backend.config.NativeChatProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@ConditionalOnProperty(prefix = "scholarflow.native-chat", name = "enabled", havingValue = "true")
public class GoogleNativeChatService implements NativeChatService {

    private static final String INSUFFICIENT_DATA_MESSAGE = "Insufficient data in the current knowledge base to answer this query.";

    private final NativeChatProperties properties;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public GoogleNativeChatService(NativeChatProperties properties, RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        int timeoutMs = properties.googleTimeoutMs() > 0 ? properties.googleTimeoutMs() : 45000;
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);

        this.restClient = restClientBuilder
                .baseUrl("https://generativelanguage.googleapis.com")
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public NativeChatResult generateChatResponse(String query) {
        if (isBlank(properties.googleApiKey())) {
            throw new NativeChatUnavailableException("Native chat is enabled but GOOGLE_API_KEY is not configured.");
        }

        List<String> queryEmbedding = embedQuery(query);
        List<RetrievedChunk> retrievedChunks = retrieveTopChunks(queryEmbedding, 5);

        if (retrievedChunks.isEmpty()) {
            return new NativeChatResult(
                    HttpStatus.OK.value(),
                    serializeResponse(
                            "insufficient_data",
                            INSUFFICIENT_DATA_MESSAGE,
                            List.of(),
                            List.of(),
                            List.of()
                    )
            );
        }

        List<String> sources = uniqueSources(retrievedChunks);
        String contextText = buildContextText(retrievedChunks);
        String synthesis = tryGenerateWithGoogle(query, contextText);

        if (isBlank(synthesis)) {
            return new NativeChatResult(
                    HttpStatus.OK.value(),
                    serializeResponse(
                            "insufficient_data",
                            INSUFFICIENT_DATA_MESSAGE,
                            List.of(),
                            List.of(),
                            List.of()
                    )
            );
        }

        List<String> keyPoints = List.of(
                "Native Spring path retrieved pgvector evidence chunks and synthesized a response [native-spring]"
        );

        return new NativeChatResult(
                HttpStatus.OK.value(),
                serializeResponse("ok", synthesis, keyPoints, sources, toChunkMaps(retrievedChunks))
        );
    }

    protected List<String> embedQuery(String query) {
        String model = isBlank(properties.googleEmbeddingModel())
                ? "models/gemini-embedding-001"
                : properties.googleEmbeddingModel();

        Map<String, Object> body = Map.of(
                "model", model,
                "content", Map.of(
                        "parts", List.of(Map.of("text", query))
                )
        );

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.post()
                    .uri("/v1beta/models/{model}:embedContent?key={apiKey}", model, properties.googleApiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);

            if (response == null || !(response.get("embedding") instanceof Map<?, ?> embeddingMap)) {
                throw new NativeChatUnavailableException("Google embedding response did not include an embedding payload.");
            }

            Object valuesObject = embeddingMap.get("values");
            if (!(valuesObject instanceof List<?> values) || values.isEmpty()) {
                throw new NativeChatUnavailableException("Google embedding response did not include embedding values.");
            }

            List<String> result = new ArrayList<>(values.size());
            for (Object value : values) {
                result.add(String.valueOf(value));
            }
            return result;
        } catch (NativeChatUnavailableException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new NativeChatUnavailableException("Native chat embedding call failed.", exception);
        }
    }

    protected List<RetrievedChunk> retrieveTopChunks(List<String> queryEmbedding, int limit) {
        if (isBlank(properties.databaseUrl())) {
            throw new NativeChatUnavailableException("Native chat requires DATABASE_URL for pgvector retrieval.");
        }

        String vectorLiteral = toPgVectorLiteral(queryEmbedding);
        String sql = """
                SELECT dc.text_content, d.filename, dc.page_number
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                ORDER BY dc.embedding <=> CAST(? AS vector)
                LIMIT ?
                """;

        try (Connection connection = DriverManager.getConnection(
                properties.databaseUrl(),
                defaultString(properties.databaseUsername()),
                defaultString(properties.databasePassword())
        );
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, vectorLiteral);
            statement.setInt(2, limit);

            try (ResultSet resultSet = statement.executeQuery()) {
                List<RetrievedChunk> chunks = new ArrayList<>();
                while (resultSet.next()) {
                    String text = resultSet.getString("text_content");
                    String filename = resultSet.getString("filename");
                    int pageNumber = resultSet.getInt("page_number");
                    chunks.add(new RetrievedChunk(text, filename + ", Page " + pageNumber));
                }
                return chunks;
            }
        } catch (Exception exception) {
            throw new NativeChatUnavailableException("Native chat retrieval query failed.", exception);
        }
    }

    protected String tryGenerateWithGoogle(String query, String contextText) {
        String model = isBlank(properties.googleChatModel()) ? "models/gemini-2.5-flash" : properties.googleChatModel();
        String prompt = """
                You are an academic research synthesizer.
                Use only the provided context to answer the query.
                Return one concise synthesis paragraph with inline citations.

                CONTEXT:
                %s

                QUERY:
                %s
                """.formatted(contextText, query);

        Map<String, Object> requestBody = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt))))
        );

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.post()
                    .uri("/v1beta/{model}:generateContent?key={apiKey}", model, properties.googleApiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(Map.class);

            if (response == null) {
                return null;
            }

            Object candidatesObject = response.get("candidates");
            if (!(candidatesObject instanceof List<?> candidates) || candidates.isEmpty()) {
                return null;
            }

            Object firstCandidate = candidates.get(0);
            if (!(firstCandidate instanceof Map<?, ?> candidateMap)) {
                return null;
            }

            Object contentObject = candidateMap.get("content");
            if (!(contentObject instanceof Map<?, ?> contentMap)) {
                return null;
            }

            Object partsObject = contentMap.get("parts");
            if (!(partsObject instanceof List<?> parts) || parts.isEmpty()) {
                return null;
            }

            Object firstPart = parts.get(0);
            if (!(firstPart instanceof Map<?, ?> partMap)) {
                return null;
            }

            Object textObject = partMap.get("text");
            return textObject instanceof String text ? text.trim() : null;
        } catch (Exception exception) {
            throw new NativeChatUnavailableException("Native chat call to Google failed.", exception);
        }
    }

    private byte[] serializeResponse(
            String status,
            String synthesis,
            List<String> keyPoints,
            List<String> sources,
            List<Map<String, String>> chunks
    ) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("status", status);
        response.put("answer", renderAnswer(synthesis, keyPoints, sources));
        response.put("sources", sources);
        response.put("chunks", chunks);

        List<Map<String, Object>> sections = new ArrayList<>();
        sections.add(section("synthesis", "Synthesis", synthesis, List.of()));
        sections.add(section("key_data_points", "Key Data Points", null, keyPoints));
        sections.add(section("sources", "Sources", null, sources));
        response.put("sections", sections);

        try {
            return objectMapper.writeValueAsBytes(response);
        } catch (Exception exception) {
            throw new NativeChatUnavailableException("Failed to encode native chat response.", exception);
        }
    }

    private List<Map<String, String>> toChunkMaps(List<RetrievedChunk> chunks) {
        List<Map<String, String>> mapped = new ArrayList<>();
        for (RetrievedChunk chunk : chunks) {
            mapped.add(Map.of("text", chunk.text(), "source", chunk.source()));
        }
        return mapped;
    }

    private String toPgVectorLiteral(List<String> embedding) {
        return "[" + String.join(",", embedding) + "]";
    }

    private List<String> uniqueSources(List<RetrievedChunk> chunks) {
        List<String> sources = new ArrayList<>();
        for (RetrievedChunk chunk : chunks) {
            if (!sources.contains(chunk.source())) {
                sources.add(chunk.source());
            }
        }
        return sources;
    }

    private String buildContextText(List<RetrievedChunk> chunks) {
        StringBuilder builder = new StringBuilder();
        for (RetrievedChunk chunk : chunks) {
            builder
                    .append("--- Source: ")
                    .append(chunk.source())
                    .append(" ---\n")
                    .append(chunk.text())
                    .append("\n\n");
        }
        return builder.toString().trim();
    }

    private String renderAnswer(String synthesis, List<String> keyPoints, List<String> sources) {
        StringBuilder builder = new StringBuilder();
        builder.append("### Synthesis\n").append(synthesis).append("\n\n");
        builder.append("### Key Data Points\n");
        for (String point : keyPoints) {
            builder.append("- ").append(point).append("\n");
        }
        builder.append("\n### Sources\n");
        for (String source : sources) {
            builder.append("- ").append(source).append("\n");
        }
        return builder.toString().trim();
    }

    private Map<String, Object> section(String key, String title, String body, List<String> items) {
        Map<String, Object> section = new LinkedHashMap<>();
        section.put("key", key);
        section.put("title", title);
        section.put("body", body);
        section.put("items", items);
        return section;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    protected record RetrievedChunk(String text, String source) {
    }
}
