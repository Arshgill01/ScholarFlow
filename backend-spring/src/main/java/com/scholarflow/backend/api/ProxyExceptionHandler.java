package com.scholarflow.backend.api;

import com.scholarflow.backend.nativechat.NativeChatUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.ResourceAccessException;

import java.net.SocketTimeoutException;

@RestControllerAdvice
public class ProxyExceptionHandler {

    @ExceptionHandler(ResourceAccessException.class)
    public ResponseEntity<ErrorResponse> handleResourceAccessException(ResourceAccessException exception) {
        Throwable rootCause = getRootCause(exception);
        if (rootCause instanceof SocketTimeoutException) {
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                    .body(new ErrorResponse("Python backend request timed out."));
        }

        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ErrorResponse("Python backend is unavailable."));
    }

    @ExceptionHandler(NativeChatUnavailableException.class)
    public ResponseEntity<ErrorResponse> handleNativeChatUnavailableException(NativeChatUnavailableException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ErrorResponse(exception.getMessage()));
    }

    private Throwable getRootCause(Throwable throwable) {
        Throwable current = throwable;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current;
    }

    public record ErrorResponse(String detail) {
    }
}
