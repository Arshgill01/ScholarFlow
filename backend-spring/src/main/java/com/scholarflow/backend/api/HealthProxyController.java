package com.scholarflow.backend.api;

import com.scholarflow.backend.bridge.PythonBackendBridge;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthProxyController {

    private final PythonBackendBridge pythonBackendBridge;

    public HealthProxyController(PythonBackendBridge pythonBackendBridge) {
        this.pythonBackendBridge = pythonBackendBridge;
    }

    @GetMapping("/health")
    public ResponseEntity<byte[]> health() {
        return pythonBackendBridge.get("/health");
    }
}
