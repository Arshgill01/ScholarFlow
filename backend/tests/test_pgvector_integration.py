import asyncio
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from models import Base, Document, DocumentChunk
from services.rag_service import RagService


def _require_pgvector_env():
    if os.getenv("RUN_PGVECTOR_TESTS") != "1":
        pytest.skip("Set RUN_PGVECTOR_TESTS=1 to run pgvector integration tests.")

    database_url = os.getenv("DATABASE_URL")
    if not database_url or database_url.startswith("sqlite"):
        pytest.skip("Set DATABASE_URL to a Postgres/pgvector database for integration tests.")

    return database_url


def _embedding(seed):
    values = [0.0] * 3072
    values[0] = seed
    values[1] = seed / 2
    return values


class IntegrationEmbeddings:
    def embed_query(self, query):
        assert query == "What does the paper say?"
        return _embedding(1.0)


class IntegrationLlmResponse:
    def __init__(self, content):
        self.content = content


class IntegrationLlm:
    def invoke(self, prompt):
        return IntegrationLlmResponse(
            '{"synthesis":"Integrated synthesis [paper.pdf, Page 1]","key_data_points":["Integrated point [paper.pdf, Page 1]"]}'
        )


@pytest.mark.integration
def test_pgvector_document_round_trip_and_chat_query():
    database_url = _require_pgvector_env()
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        Base.metadata.drop_all(bind=conn)
        Base.metadata.create_all(bind=conn)

    session = Session()
    try:
        document = Document(filename="paper.pdf", s3_key="temp_uploads/paper.pdf")
        session.add(document)
        session.commit()
        session.refresh(document)

        session.add(DocumentChunk(
            document_id=document.id,
            page_number=1,
            chunk_index=0,
            text_content="Important finding",
            embedding=_embedding(1.0),
        ))
        session.commit()

        listed_documents = session.query(Document).all()
        assert [doc.filename for doc in listed_documents] == ["paper.pdf"]

        service = RagService.__new__(RagService)
        service.db = session
        service.embeddings = IntegrationEmbeddings()
        service.llm = IntegrationLlm()

        response = asyncio.run(service.query_knowledge_base("What does the paper say?"))

        assert response.status == "ok"
        assert response.sources == ["paper.pdf, Page 1"]
        assert response.chunks[0].text == "Important finding"
        assert response.sections[0].body == "Integrated synthesis [paper.pdf, Page 1]"
    finally:
        session.close()
        engine.dispose()
