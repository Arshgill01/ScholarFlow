package com.scholarflow.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.scholarflow.backend.config.NativeChatProperties;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableConfigurationProperties(NativeChatProperties.class)
public class ScholarFlowSpringApplication {

    public static void main(String[] args) {
        SpringApplication.run(ScholarFlowSpringApplication.class, args);
    }
}
