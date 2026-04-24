# ScholarFlow Backend Stabilization and Spring Boot Integration ExecPlan

## Goal

Get the backend green before touching the UI, then introduce Spring Boot in a way that reduces migration risk instead of replacing the current backend blindly.

## Current facts from the codebase

- The current backend is a FastAPI app in `backend/`.
- App import is not safe: `backend/main.py` creates database tables at import time.
- The backend has no test suite and `pytest` is not installed in the checked-in virtualenv.
- The main RAG path has at least one confirmed correctness bug:
  - `backend/services/rag_service.py` returns only two values when no retrieval results exist, but `backend/routers/chat.py` always unpacks three.
- The current "structured" answer is only a prompt instruction to the LLM, not a typed response contract.
- The frontend currently expects mostly free-form text and has formatter issues, so backend structure must become explicit before UI cleanup.
- Local Docker-backed Postgres is not currently reachable in this environment, so tests cannot depend on manual container startup.

## Recommended architecture direction

Do this in two stages.

### Stage 1: Stabilize the existing Python backend

Reason: there is no safe migration baseline yet. Rewriting while the current contract is untested will hide regressions and make Spring Boot parity impossible to verify.

Deliverables:

1. Convert the FastAPI app to an app-factory pattern.
2. Move database initialization out of import time and into explicit startup/init paths.
3. Add test dependencies and a backend test harness.
4. Make core endpoints green under automated tests.
5. Define a typed structured response from the chat pipeline.

### Stage 2: Introduce Spring Boot as a parallel backend

Reason: the repo is currently Python-first, but Spring Boot is a valid target for long-term backend ownership. The safest path is parallel introduction with parity tests, then gradual cutover.

Deliverables:

1. Add a new Spring Boot module, recommended as `backend-spring/`.
2. Mirror the existing external API shape first:
   - `GET /health`
   - `GET /documents`
   - `POST /documents/upload`
   - `POST /chat`
3. Use PostgreSQL and pgvector from day one.
4. Decide whether RAG stays temporarily in Python behind Spring Boot or is ported fully to Java.

## Spring Boot recommendation

Use Spring Boot with Spring AI instead of a custom low-level integration.

Why this is the right fit here:

- Official Spring AI support exists for Google GenAI chat models.
- Official Spring AI support exists for Google GenAI text embeddings.
- Official Spring AI support exists for PGVector.
- Spring Boot officially supports development-time Docker Compose and Testcontainers, which is a cleaner testing story than the current manual setup.

This makes a full Java migration realistic, but only after the current contract is made testable.

## Proposed execution order

### Phase 0: Baseline and safety rails

1. Add backend developer docs for local setup, test commands, and environment variables.
2. Add `pytest`, `pytest-asyncio`, and FastAPI/http client test tooling.
3. Add a dedicated test configuration that does not require production credentials.

Exit criteria:

- Tests can run locally with one command.
- The app can be imported in tests without trying to connect to a live database immediately.

### Phase 1: Fix backend boot and configuration

1. Refactor `backend/main.py` into an app factory.
2. Move table creation into an explicit init path.
3. Make DB/session/config dependency injection testable.
4. Add clear startup failures for missing required configuration.

Exit criteria:

- `GET /health` can be tested without boot crashes.
- App startup behavior is deterministic.

### Phase 2: Add request-level backend tests

Add tests for:

1. `GET /health`
2. `GET /documents` with empty and populated states
3. `POST /chat` with:
   - no indexed chunks
   - RAG success
   - model/config failure
4. `POST /documents/upload` with:
   - non-PDF rejection
   - document processing success via mocked embedding/model pipeline
   - processing failure cleanup

Exit criteria:

- Core backend behavior is covered by automated tests.
- Regressions in the RAG route are caught before UI work.

### Phase 3: Fix confirmed backend bugs

Address the issues already visible from analysis:

1. Fix the `query_knowledge_base()` return-shape mismatch.
2. Replace prompt-only "structure" with a typed backend response model.
3. Normalize source and chunk serialization.
4. Make error handling consistent across routes.
5. Remove hidden coupling to live Google API calls in tests.

Exit criteria:

- All backend tests are green.
- Chat responses have a stable contract.

### Phase 4: Define the structured answer schema

Recommended response contract:

- `answer_markdown`: rendered narrative for current UI compatibility
- `sections`: array of typed sections such as synthesis, key points, caveats
- `sources`: normalized source list
- `chunks`: retrieved evidence list
- `status`: `ok`, `insufficient_data`, or `error`

Reason:

- The current system asks the LLM for markdown headings but does not enforce them.
- The frontend should not have to infer application structure from free-form text.

Exit criteria:

- Backend owns structure, not the UI formatter.

### Phase 5: Scaffold Spring Boot module

1. Create `backend-spring/` using Maven.
2. Target Java 21+ compatibility. Java 22 is already available locally.
3. Add:
   - `spring-boot-starter-web`
   - `spring-boot-starter-validation`
   - PostgreSQL driver
   - Spring AI Google GenAI starter
   - Spring AI PGVector support
4. Add `application.yml` and environment-based configuration.
5. Add `GET /health` first, then documents/chat parity endpoints.

Exit criteria:

- Spring Boot app builds and runs.
- One endpoint reaches parity with the Python service.

### Phase 6: Choose migration mode

Option A, recommended first:

- Spring Boot becomes the main API layer.
- Python remains a temporary RAG worker for document parsing/indexing/chat generation.
- Cut over endpoint-by-endpoint.

Option B, after parity is proven:

- Port document ingestion, embeddings, vector search, and chat orchestration fully to Spring Boot/Spring AI.

Recommendation:

- Start with Option A only if the team needs Spring Boot in place quickly.
- Move to Option B once the Python behavior is covered by tests and the Java service can match it.

## Validation plan

Run in this order:

1. Backend unit/request tests
2. Backend startup smoke test
3. Spring Boot build and controller tests
4. Contract comparison tests between Python and Spring responses

## Known risks

- Current backend behavior depends on live infrastructure and live model APIs.
- Python runtime is 3.9, and installed Google libraries are already warning that it is out of support.
- PGVector-specific behavior makes SQLite-only testing insufficient for full confidence.
- A full rewrite to Spring Boot before stabilizing the Python contract will likely create silent regressions.

## Recommendation summary

Do not replace the current backend with Spring Boot first.

First make the Python backend testable and green. Then add Spring Boot in parallel, using Spring AI plus PGVector as the migration target, and cut over only after the contract is explicit and validated.
