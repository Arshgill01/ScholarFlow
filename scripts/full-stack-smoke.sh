#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
SPRING_DIR="$ROOT_DIR/backend-spring"
LOG_DIR="$ROOT_DIR/.tmp/smoke"

BACKEND_LOG="$LOG_DIR/backend.log"
SPRING_LOG="$LOG_DIR/spring.log"
SPRING_CHAT_BODY="$LOG_DIR/spring-chat.json"

BACKEND_PID=""
SPRING_PID=""

mkdir -p "$LOG_DIR"

cleanup() {
  local exit_code=$?

  if [[ -n "$SPRING_PID" ]] && kill -0 "$SPRING_PID" 2>/dev/null; then
    kill "$SPRING_PID" || true
  fi

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" || true
  fi

  wait || true

  if [[ $exit_code -ne 0 ]]; then
    printf "\nSmoke test failed. Logs:\n"
    printf "- Python backend: %s\n" "$BACKEND_LOG"
    printf "- Spring backend: %s\n" "$SPRING_LOG"
  fi
}

trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local attempts="${2:-60}"

  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done

  printf "Timed out waiting for %s\n" "$url"
  return 1
}

assert_json_has_keys() {
  local file_path="$1"
  local keys_csv="$2"

  python3 - "$file_path" "$keys_csv" <<'PY'
import json
import sys

file_path = sys.argv[1]
keys = [k.strip() for k in sys.argv[2].split(",") if k.strip()]

with open(file_path, "r", encoding="utf-8") as fp:
    payload = json.load(fp)

missing = [k for k in keys if k not in payload]
if missing:
    raise SystemExit(f"Missing JSON keys: {missing}")
PY
}

printf "[1/8] Bringing up Docker Postgres...\n"
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d

printf "[2/8] Initializing database schema and pgvector extension...\n"
(
  cd "$BACKEND_DIR"
  ./venv/bin/python init_db.py
)

printf "[3/8] Starting Python backend on :8000...\n"
(
  cd "$BACKEND_DIR"
  INIT_DB_ON_STARTUP=true ./venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 >"$BACKEND_LOG" 2>&1
) &
BACKEND_PID=$!

wait_for_url "http://127.0.0.1:8000/health"

printf "[4/8] Starting Spring backend on :8080...\n"
(
  cd "$SPRING_DIR"
  mvn -q -DskipTests spring-boot:run >"$SPRING_LOG" 2>&1
) &
SPRING_PID=$!

wait_for_url "http://127.0.0.1:8080/health"

printf "[5/8] Verifying /health parity between Python and Spring...\n"
PY_HEALTH="$(curl -fsS "http://127.0.0.1:8000/health")"
SPRING_HEALTH="$(curl -fsS "http://127.0.0.1:8080/health")"
[[ "$PY_HEALTH" == "$SPRING_HEALTH" ]]

printf "[6/8] Verifying /documents/ parity between Python and Spring...\n"
PY_DOCS="$(curl -fsS "http://127.0.0.1:8000/documents/")"
SPRING_DOCS="$(curl -fsS "http://127.0.0.1:8080/documents/")"
[[ "$PY_DOCS" == "$SPRING_DOCS" ]]

PDF_PATH="${SMOKE_PDF_PATH:-$ROOT_DIR/Arshdeep_Singh_OOD_Social_Media_Case_Study_Final-1.pdf}"

if [[ -f "$PDF_PATH" ]]; then
  printf "[7/8] Uploading sample PDF via Spring...\n"
  UPLOAD_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:8080/documents/upload" -F "file=@$PDF_PATH;type=application/pdf")"
  python3 - "$UPLOAD_RESPONSE" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
for key in ("message", "document_id", "filename"):
    if key not in payload:
        raise SystemExit(f"Upload response missing key: {key}")
PY
else
  printf "[7/8] Skipping upload (sample PDF not found at %s)...\n" "$PDF_PATH"
fi

if [[ "${SKIP_CHAT_SMOKE:-0}" != "1" ]]; then
  API_KEY_LINE=""
  if [[ -f "$BACKEND_DIR/.env" ]]; then
    API_KEY_LINE="$(grep '^GOOGLE_API_KEY=' "$BACKEND_DIR/.env" || true)"
  fi
  API_KEY_VALUE="${API_KEY_LINE#GOOGLE_API_KEY=}"

  if [[ -z "$API_KEY_VALUE" || "$API_KEY_VALUE" == "your_google_api_key_here" ]]; then
    printf "[8/8] Skipping /chat/ smoke (GOOGLE_API_KEY unavailable)...\n"
  else
    printf "[8/8] Validating /chat/ structured contract via Spring...\n"
    CHAT_STATUS="$(curl -sS -o "$SPRING_CHAT_BODY" -w '%{http_code}' "http://127.0.0.1:8080/chat/" -H 'Content-Type: application/json' -d '{"query":"Summarize the architecture and cite sources."}')"

    if [[ "$CHAT_STATUS" != "200" && "$CHAT_STATUS" != "500" ]]; then
      printf "Unexpected /chat/ status: %s\n" "$CHAT_STATUS"
      exit 1
    fi

    assert_json_has_keys "$SPRING_CHAT_BODY" "status,answer,sources,chunks,sections"
  fi
else
  printf "[8/8] Skipping /chat/ smoke (SKIP_CHAT_SMOKE=1)...\n"
fi

printf "\nFull-stack smoke check passed.\n"
