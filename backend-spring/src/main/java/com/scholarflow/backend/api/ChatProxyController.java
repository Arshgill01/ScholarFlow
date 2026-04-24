package com.scholarflow.backend.api;

import com.scholarflow.backend.bridge.PythonBackendBridge;
import com.scholarflow.backend.config.NativeChatProperties;
import com.scholarflow.backend.nativechat.NativeChatResult;
import com.scholarflow.backend.nativechat.NativeChatService;
import com.scholarflow.backend.nativechat.NativeChatUnavailableException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ChatProxyController {

    private final PythonBackendBridge pythonBackendBridge;
    private final NativeChatProperties nativeChatProperties;
    private final ObjectProvider<NativeChatService> nativeChatServiceProvider;

    public ChatProxyController(
            PythonBackendBridge pythonBackendBridge,
            NativeChatProperties nativeChatProperties,
            ObjectProvider<NativeChatService> nativeChatServiceProvider
    ) {
        this.pythonBackendBridge = pythonBackendBridge;
        this.nativeChatProperties = nativeChatProperties;
        this.nativeChatServiceProvider = nativeChatServiceProvider;
    }

    @PostMapping("/chat/")
    public ResponseEntity<byte[]> chat(@RequestBody ChatRequest request) {
        if (nativeChatProperties.enabled()) {
            NativeChatService nativeChatService = nativeChatServiceProvider.getIfAvailable();

            if (nativeChatService == null) {
                if (nativeChatProperties.fallbackToPython()) {
                    return pythonBackendBridge.postJson("/chat/", request);
                }
                throw new NativeChatUnavailableException("Native chat is enabled but no native chat service is available.");
            }

            try {
                NativeChatResult response = nativeChatService.generateChatResponse(request.query());
                return ResponseEntity.status(response.statusCode())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(response.body());
            } catch (NativeChatUnavailableException exception) {
                if (nativeChatProperties.fallbackToPython()) {
                    return pythonBackendBridge.postJson("/chat/", request);
                }
                throw exception;
            }
        }

        return pythonBackendBridge.postJson("/chat/", request);
    }
}
