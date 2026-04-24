# ScholarFlow Python Backend

## Runtime

This backend is standardized on Python 3.12.

## Local setup

```bash
python3.12 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```

## Commands

Run the unit test suite:

```bash
./venv/bin/python -m pytest -q
```

Run a focused RAG structured-contract regression lane:

```bash
./venv/bin/python -m pytest -q backend/tests/test_rag_service.py
```

Smoke test the application import path:

```bash
./venv/bin/python -c "import main; print('app import ok')"
```

Initialize the database schema and pgvector extension when Postgres is available:

```bash
./venv/bin/python init_db.py
```

Start the API:

```bash
INIT_DB_ON_STARTUP=true ./venv/bin/uvicorn main:app --reload
```

The Python backend is the internal bridge target and serves on port `8000` by default.

## Full-stack smoke check

From the repository root, run:

```bash
./scripts/full-stack-smoke.sh
```

Options:

- `SKIP_CHAT_SMOKE=1` skips the live `/chat/` call
- `SMOKE_PDF_PATH=/absolute/path/to/file.pdf` overrides the sample PDF used for upload

## Chat model configuration

The chat pipeline uses Google Generative Language and enforces a JSON response schema for:

- `synthesis` (string)
- `key_data_points` (string array)

Environment variables:

- `GOOGLE_CHAT_MODEL` (default: `models/gemma-4-31b-it`)
- `GOOGLE_CHAT_TIMEOUT_SECONDS` (default: `45`)

If the model returns invalid JSON twice (initial + repair attempt), `/chat/` returns a structured payload with `status="error"` and HTTP 500.

## Integration tests

The default test suite uses SQLite for fast feedback.

To run the real pgvector lane, point `DATABASE_URL` at a Postgres instance with the `vector` extension and enable the integration flag:

```bash
RUN_PGVECTOR_TESTS=1 ./venv/bin/python -m pytest -q -m integration
```
