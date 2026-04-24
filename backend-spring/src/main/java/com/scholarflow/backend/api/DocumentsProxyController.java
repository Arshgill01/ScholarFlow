package com.scholarflow.backend.api;

import com.scholarflow.backend.bridge.PythonBackendBridge;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class DocumentsProxyController {

    private final PythonBackendBridge pythonBackendBridge;

    public DocumentsProxyController(PythonBackendBridge pythonBackendBridge) {
        this.pythonBackendBridge = pythonBackendBridge;
    }

    @GetMapping({"/documents", "/documents/"})
    public ResponseEntity<byte[]> listDocuments() {
        return pythonBackendBridge.get("/documents/");
    }

    @PostMapping("/documents/upload")
    public ResponseEntity<byte[]> uploadDocument(@RequestParam("file") MultipartFile file) {
        return pythonBackendBridge.postMultipart("/documents/upload", file);
    }
}
