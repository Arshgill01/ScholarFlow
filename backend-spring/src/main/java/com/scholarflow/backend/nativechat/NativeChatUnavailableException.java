package com.scholarflow.backend.nativechat;

public class NativeChatUnavailableException extends RuntimeException {
    public NativeChatUnavailableException(String message) {
        super(message);
    }

    public NativeChatUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
