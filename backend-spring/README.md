# ScholarFlow Spring Boot Backend

This module is the parallel Spring Boot entry point for the backend migration.

## Why it exists

The current production behavior still lives in `../backend`, but the long-term migration target is Spring Boot. This module gives us a clean Java service boundary without forcing an unsafe rewrite of the current RAG pipeline.

## Current scope

- Spring Boot frontdoor for `/health`, `/documents`, and `/chat`
- bridge mode to the Python backend on port `8000`
- optional native Spring `/chat/` mode behind a feature flag, with Python fallback
- explicit migration properties for the current Python backend bridge
- build and test coverage for the bridge and pgvector container lane

## Local full-stack order

1. Start Docker Postgres:

```bash
docker compose up -d
```

2. Start the Python backend on port `8000`:

```bash
cd ../backend
INIT_DB_ON_STARTUP=true ./venv/bin/uvicorn main:app --reload
```

3. Start the Spring frontdoor on port `8080`:

```bash
mvn spring-boot:run
```

4. Start the frontend on port `3000`:

```bash
cd ../frontend
npm run dev
```

The browser should only talk to Spring, using `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`.

## Version choices

- Spring Boot `3.5.13`
- Java `21`

These choices are intentional:

- Spring Boot 3.5 is a current stable line.
- Spring AI documentation states support for Spring Boot 3.4.x and 3.5.x.

## Local commands

```bash
mvn test
mvn spring-boot:run
```

## Contract parity checks

Run Spring proxy parity tests against a Python stub contract:

```bash
mvn test -Dtest=ProxyContractParityIntegrationTest
```

Run pgvector integration lane:

```bash
RUN_PGVECTOR_TESTS=1 mvn test
```

Run native chat feature-flag integration checks:

```bash
mvn test -Dtest=NativeChatFeatureIntegrationTest
```

## Native chat feature flag

The `/chat/` route supports an incremental native Spring migration path.

- `SCHOLARFLOW_NATIVE_CHAT_ENABLED=false` (default) keeps pure Python bridge mode.
- `SCHOLARFLOW_NATIVE_CHAT_ENABLED=true` enables native Spring chat orchestration.
- `SCHOLARFLOW_NATIVE_CHAT_FALLBACK_TO_PYTHON=true` (default) falls back to Python if native chat fails.

Related environment variables:

- `GOOGLE_API_KEY`
- `GOOGLE_CHAT_MODEL` (default: `models/gemini-2.5-flash`)
- `GOOGLE_CHAT_TIMEOUT_MS` (default: `45000`)

Current native mode is intentionally limited to chat orchestration and response-shape parity while the vector retrieval pipeline is still bridged.
