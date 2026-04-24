package com.scholarflow.backend.api;

import com.scholarflow.backend.bridge.PythonBackendBridge;
import com.scholarflow.backend.config.NativeChatProperties;
import com.scholarflow.backend.nativechat.NativeChatResult;
import com.scholarflow.backend.nativechat.NativeChatService;
import com.scholarflow.backend.nativechat.NativeChatUnavailableException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.ResourceAccessException;

import java.net.SocketTimeoutException;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({
        HealthProxyController.class,
        DocumentsProxyController.class,
        ChatProxyController.class,
        ProxyExceptionHandler.class
})
class ProxyControllersTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PythonBackendBridge pythonBackendBridge;

    @MockBean
    private NativeChatProperties nativeChatProperties;

    @MockBean
    private NativeChatService nativeChatService;

    @Test
    void healthEndpointReturnsPythonBackendPayload() throws Exception {
        when(pythonBackendBridge.get("/health"))
                .thenReturn(ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"status\":\"healthy\"}".getBytes()));

        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("healthy"));
    }

    @Test
    void listDocumentsEndpointReturnsPythonBackendPayload() throws Exception {
        when(pythonBackendBridge.get("/documents/"))
                .thenReturn(ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("[{\"id\":1,\"filename\":\"paper.pdf\"}]".getBytes()));

        mockMvc.perform(get("/documents/"))
                .andExpect(status().isOk())
                .andExpect(content().json("[{\"id\":1,\"filename\":\"paper.pdf\"}]"));
    }

    @Test
    void uploadEndpointForwardsMultipartRequests() throws Exception {
        when(pythonBackendBridge.postMultipart(eq("/documents/upload"), any()))
                .thenReturn(ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"message\":\"ok\"}".getBytes()));

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "paper.pdf",
                "application/pdf",
                "%PDF-1.4".getBytes()
        );

        mockMvc.perform(multipart("/documents/upload").file(file))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"message\":\"ok\"}"));

        verify(pythonBackendBridge).postMultipart(eq("/documents/upload"), any());
    }

    @Test
    void chatEndpointReturnsStructuredPayload() throws Exception {
        when(nativeChatProperties.enabled()).thenReturn(false);

        when(pythonBackendBridge.postJson(eq("/chat/"), any()))
                .thenReturn(ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(("""
                                {
                                  "status": "ok",
                                  "answer": "### Synthesis\\nStructured answer",
                                  "sources": ["paper.pdf, Page 1"],
                                  "chunks": [{"text": "evidence", "source": "paper.pdf, Page 1"}],
                                  "sections": [{"key": "synthesis", "title": "Synthesis", "body": "Structured answer", "items": []}]
                                }
                                """).getBytes()));

        mockMvc.perform(post("/chat/")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"Summarize the paper\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.sections[0].key").value("synthesis"));
    }

    @Test
    void chatEndpointReturnsGatewayTimeoutWhenBridgeReadTimesOut() throws Exception {
        when(nativeChatProperties.enabled()).thenReturn(false);

        when(pythonBackendBridge.postJson(eq("/chat/"), any()))
                .thenThrow(new ResourceAccessException("Read timed out", new SocketTimeoutException("Read timed out")));

        mockMvc.perform(post("/chat/")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"Summarize the paper\"}"))
                .andExpect(status().isGatewayTimeout())
                .andExpect(jsonPath("$.detail").value("Python backend request timed out."));
    }

    @Test
    void chatEndpointReturnsServiceUnavailableWhenBridgeIsUnavailable() throws Exception {
        when(nativeChatProperties.enabled()).thenReturn(false);

        when(pythonBackendBridge.postJson(eq("/chat/"), any()))
                .thenThrow(new ResourceAccessException("Connection refused"));

        mockMvc.perform(post("/chat/")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"Summarize the paper\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value("Python backend is unavailable."));
    }

    @Test
    void chatEndpointUsesNativeServiceWhenEnabled() throws Exception {
        when(nativeChatProperties.enabled()).thenReturn(true);

        when(nativeChatService.generateChatResponse("Summarize the paper"))
                .thenReturn(new NativeChatResult(200, """
                        {
                          "status": "ok",
                          "answer": "### Synthesis\\nNative answer",
                          "sources": ["native-spring"],
                          "chunks": [],
                          "sections": [{"key": "synthesis", "title": "Synthesis", "body": "Native answer", "items": []}]
                        }
                        """.trim().getBytes()));

        mockMvc.perform(post("/chat/")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"Summarize the paper\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.sources[0]").value("native-spring"));
    }

    @Test
    void chatEndpointFallsBackToPythonWhenNativeFailsAndFallbackEnabled() throws Exception {
        when(nativeChatProperties.enabled()).thenReturn(true);
        when(nativeChatProperties.fallbackToPython()).thenReturn(true);

        when(nativeChatService.generateChatResponse("Summarize the paper"))
                .thenThrow(new NativeChatUnavailableException("Native path unavailable"));

        when(pythonBackendBridge.postJson(eq("/chat/"), any()))
                .thenReturn(ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("""
                                {
                                  "status": "ok",
                                  "answer": "### Synthesis\\nPython fallback",
                                  "sources": ["paper.pdf, Page 1"],
                                  "chunks": [],
                                  "sections": [{"key": "synthesis", "title": "Synthesis", "body": "Python fallback", "items": []}]
                                }
                                """.trim().getBytes()));

        mockMvc.perform(post("/chat/")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"Summarize the paper\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value("### Synthesis\nPython fallback"));
    }

    @Test
    void chatEndpointReturnsServiceUnavailableWhenNativeFailsWithoutFallback() throws Exception {
        when(nativeChatProperties.enabled()).thenReturn(true);
        when(nativeChatProperties.fallbackToPython()).thenReturn(false);

        when(nativeChatService.generateChatResponse("Summarize the paper"))
                .thenThrow(new NativeChatUnavailableException("Native path unavailable"));

        mockMvc.perform(post("/chat/")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"Summarize the paper\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value("Native path unavailable"));
    }
}
