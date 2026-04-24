from fastapi import HTTPException

from database import SessionLocal
from models import Document
from routers import chat as chat_router
from routers import documents as documents_router
from schemas import ChatResponse, ChatSection, RetrievedChunk


def test_health_check_returns_healthy(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_list_documents_returns_empty_state(client):
    response = client.get("/documents/")

    assert response.status_code == 200
    assert response.json() == []


def test_list_documents_returns_saved_documents(client):
    db = SessionLocal()
    db.add(Document(filename="paper.pdf", s3_key="temp_uploads/paper.pdf"))
    db.commit()
    db.close()

    response = client.get("/documents/")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["filename"] == "paper.pdf"


def test_chat_returns_service_payload(client, monkeypatch):
    class FakeRagService:
        def __init__(self, db):
            self.db = db

        async def query_knowledge_base(self, query):
            assert query == "Summarize the paper"
            return ChatResponse(
                status="ok",
                answer="### Synthesis\nStructured answer",
                sources=["paper.pdf, Page 1"],
                chunks=[RetrievedChunk(text="evidence", source="paper.pdf, Page 1")],
                sections=[
                    ChatSection(key="synthesis", title="Synthesis", body="Structured answer"),
                    ChatSection(key="key_data_points", title="Key Data Points", items=["point"]),
                    ChatSection(key="sources", title="Sources", items=["paper.pdf, Page 1"]),
                ],
            )

    monkeypatch.setattr(chat_router.rag_service, "RagService", FakeRagService)

    response = client.post("/chat/", json={"query": "Summarize the paper"})

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["answer"] == "### Synthesis\nStructured answer"
    assert response.json()["sources"] == ["paper.pdf, Page 1"]
    assert response.json()["chunks"] == [{"text": "evidence", "source": "paper.pdf, Page 1"}]
    assert response.json()["sections"][0]["key"] == "synthesis"


def test_chat_preserves_http_errors(client, monkeypatch):
    class FakeRagService:
        def __init__(self, db):
            self.db = db

        async def query_knowledge_base(self, query):
            raise HTTPException(status_code=503, detail="RAG unavailable")

    monkeypatch.setattr(chat_router.rag_service, "RagService", FakeRagService)

    response = client.post("/chat/", json={"query": "Hello"})

    assert response.status_code == 503
    assert response.json() == {"detail": "RAG unavailable"}


def test_chat_returns_structured_error_payload_with_http_500(client, monkeypatch):
    class FakeRagService:
        def __init__(self, db):
            self.db = db

        async def query_knowledge_base(self, query):
            return ChatResponse(
                status="error",
                answer="### Synthesis\nThe language model returned an invalid structured response.",
                sources=[],
                chunks=[],
                sections=[
                    ChatSection(
                        key="synthesis",
                        title="Synthesis",
                        body="The language model returned an invalid structured response.",
                    ),
                    ChatSection(key="key_data_points", title="Key Data Points", items=[]),
                    ChatSection(key="sources", title="Sources", items=[]),
                ],
            )

    monkeypatch.setattr(chat_router.rag_service, "RagService", FakeRagService)

    response = client.post("/chat/", json={"query": "Hello"})

    assert response.status_code == 500
    assert response.json()["status"] == "error"
    assert response.json()["sections"][0]["body"] == "The language model returned an invalid structured response."


def test_document_upload_rejects_non_pdf(client):
    response = client.post(
        "/documents/upload",
        files={"file": ("notes.txt", b"plain text", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Only PDF files are supported."}


def test_document_upload_returns_created_document(client, monkeypatch):
    class FakeDocument:
        id = 42
        filename = "paper.pdf"

    class FakeRagService:
        def __init__(self, db):
            self.db = db

        async def process_and_store_document(self, file):
            assert file.filename == "paper.pdf"
            return FakeDocument()

    monkeypatch.setattr(documents_router.rag_service, "RagService", FakeRagService)

    response = client.post(
        "/documents/upload",
        files={"file": ("paper.pdf", b"%PDF-1.4\n", "application/pdf")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Document uploaded and processed successfully",
        "document_id": 42,
        "filename": "paper.pdf",
    }


def test_document_upload_preserves_service_error(client, monkeypatch):
    class FakeRagService:
        def __init__(self, db):
            self.db = db

        async def process_and_store_document(self, file):
            raise HTTPException(status_code=500, detail="Failed to process document")

    monkeypatch.setattr(documents_router.rag_service, "RagService", FakeRagService)

    response = client.post(
        "/documents/upload",
        files={"file": ("paper.pdf", b"%PDF-1.4\n", "application/pdf")},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to process document"}
