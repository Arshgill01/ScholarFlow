# ScholarFlow

**Your AI-Powered Second Brain for Research & Learning**

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12+-blue?style=flat&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/React-Next.js_16-blue?style=flat&logo=react" alt="React">
  <img src="https://img.shields.io/badge/Spring_Boot-3.5+-green?style=flat&logo=spring" alt="Spring">
  <img src="https://img.shields.io/badge/PostgreSQL-pgvector+-blue?style=flat&logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat" alt="License">
</p>

---

## What is ScholarFlow?

ScholarFlow transforms your PDF documents — lecture notes, research papers, books — into an **interactive knowledge base** you can query in natural language.

> **"Explain the difference between TCP and UDP based on my notes"**

Instead of just storing your PDFs, ScholarFlow understands them. Ask questions and get answers backed by citations from your own documents.

---

## The Problem

- Traditional PDFs are **static** — you have to manually search, skim, and scroll
- Note-taking apps store text but don't **understand** context
- Standard chatbots have no memory of your materials

## The Solution

ScholarFlow uses **Retrieval-Augmented Generation (RAG)** to:

1. **Ingest** PDFs → chunk → embed → store in vector database
2. **Retrieve** relevant context via semantic similarity search  
3. **Synthesize** answers using your documents as context

Your documents become a searchable, queryable brain.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INGESTION PIPELINE                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────────────┐   │
│  │  Upload  │──▶│  Parse   │──▶│  Chunk   │──▶│    Embed      │   │
│  │   PDF    │   │   PDF    │   │   Text   │   │  (3072-dim)   │   │
│  └──────────┘   └──────────┘   └──────────┘   └───────┬────────┘   │
│                                                      │             │
│                                                      ▼             │
│                                          ┌────────────────────┐   │
│                                          │   pgvector DB       │   │
│                                          │  (text + vector)    │   │
│                                          └────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         RETRIEVAL PIPELINE                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────────────┐   │
│  │  User    │──▶│  Embed   │──▶│  Vector  │──▶│ Retrieve Top-K │   │
│  │ question │   │  Query  │   │  Search  │   │    Chunks      │   │
│  └──────────┘   └──────────┘   └──────────┘   └───────┬────────┘   │
│                                                      │             │
│                                                      ▼             │
│                                          ┌────────────────────┐   │
│                                          │  Send to Gemini     │   │
│                                          │  (context + query)  │   │
│                                          └───────┬────────────┘   │
│                                                  │                 │
│                                                  ▼                 │
│                                          ┌────────────────────┐   │
│                                          │   Response with    │   │
│                                          │     Citations      │   │
│                                          └────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Technical Details

| Component | Details |
|-----------|---------|
| **Embedding Model** | Google `gemini-embedding-001` (3072 dimensions) |
| **Chunk Size** | 1000 characters per chunk |
| **Retrieval** | Top 5 most similar chunks |
| **LLM** | Google Gemini (configurable, default: `gemma-4-31b-it`) |
| **Vector DB** | PostgreSQL 16 + pgvector extension |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React, Next.js 16, Tailwind CSS, Framer Motion |
| **Backend API** | FastAPI (Python) + Spring Boot (Java) |
| **Database** | PostgreSQL 16 + pgvector |
| **AI** | Google Gemini API (LLM + Embeddings) |
| **Container** | Docker |

---

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- Java 21+
- Docker Desktop

### 1. Clone & Setup

```bash
git clone https://github.com/yourusername/ScholarFlow.git
cd ScholarFlow
```

### 2. Start Database

```bash
docker compose up -d
```

### 3. Start Backends

```bash
# Python backend (port 8000)
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000

# Spring backend (port 8080) - in another terminal
cd backend-spring
mvn spring-boot:run
```

### 4. Start Frontend

```bash
# In another terminal
cd frontend
npm run dev
```

### 5. Open Browser

```
http://localhost:3000
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/documents/upload` | Upload a PDF document |
| `GET` | `/documents` | List all documents |
| `GET` | `/documents/{id}` | Get document details |
| `POST` | `/chat` | Ask a question |

### Chat Request Example

```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is TCP vs UDP?", "include_sources": true}'
```

### Chat Response

```json
{
  "synthesis": "TCP and UDP are both transport layer protocols...",
  "sources": [
    {"document_id": 1, "chunk_index": 3, "page": 12}
  ]
}
```

---

## Project Structure

```
ScholarFlow/
├── backend/              # Python FastAPI backend
│   ├── main.py          # Application entry point
│   ��── models.py       # SQLAlchemy models (Document, Chunk)
│   ├── services/       # RAG service, embeddings, LLM
│   └── tests/         # Unit & integration tests
├── backend-spring/      # Spring Boot Java backend
│   └── src/
│       └── main/java/  # Spring controllers
├── frontend/           # Next.js React frontend
│   └── src/app/       # Pages & components
├── docker-compose.yml   # PostgreSQL + pgvector
├── System-Design.md   # Technical design doc
└── README.md         # This file
```

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string (format: `postgresql://user:pass@host:port/db`) |
| `GOOGLE_API_KEY` | Yes | - | Google AI API key from [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GOOGLE_CHAT_MODEL` | No | `models/gemma-4-31b-it` | Gemini model for chat synthesis |
| `GOOGLE_EMBEDDING_MODEL` | No | `models/gemma-embedding-001` | Embedding model for vectorization |
| `GOOGLE_CHAT_TIMEOUT_SECONDS` | No | `45` | Timeout for chat API calls |
| `INIT_DB_ON_STARTUP` | No | `false` | Initialize database schema on startup |
| `RUN_PGVECTOR_TESTS` | No | - | Enable pgvector integration tests (`1` to enable) |
| `NEXT_PUBLIC_API_BASE_URL` | No | `http://localhost:8080` | Frontend proxy to backend |

### RAG Configuration (Code)

| Setting | Default | Location |
|---------|---------|---------|
| Chunk size | `1000` | `backend/services/rag_service.py` |
| Top-K retrieval | `5` | `backend/services/rag_service.py` |
| Embedding dimensions | `3072` | `backend/models.py` |

### Docker Configuration

```yaml
# docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg16
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER=scholar
      POSTGRES_PASSWORD=scholar_pass
      POSTGRES_DB=scholarflow
    volumes:
      postgres_data:/var/lib/postgresql/data
```

### PostgreSQL vs pgvector

| Feature | PostgreSQL | pgvector |
|---------|----------|---------|
| Vector storage | ✗ | ✓ |
| Semantic search | ✗ | ✓ |
| Metadata storage | ✓ | ✓ |
| Use case | User data, auth | Document embeddings |

**Enable pgvector extension:**

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Why This Architecture?

1. **Dual Backends** — Python handles heavy RAG/vector work; Spring serves as the API gateway
2. **pgvector** — Scales to millions of embeddings, unlimited brain size
3. **No context limits** — Unlike LLM context windows, your brain grows with your documents

---

## Development

### Run Tests

```bash
# Python backend tests
cd backend
./venv/bin/python -m pytest -q

# Smoke test (skips live API)
SKIP_CHAT_SMOKE=1 ./scripts/full-stack-smoke.sh
```

### Initialize Database

```bash
cd backend
./venv/bin/python init_db.py
```

---

## License

MIT License — see LICENSE file for details.

---

## Credits

- [LangChain](https://langchain.dev) for RAG abstractions
- [Google Gemini](https://deepmind.google/technologies/gemini) for LLM + embeddings
- [pgvector](https://github.com/pgvector/pgvector) for vector search in PostgreSQL