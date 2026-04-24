import json
import os
import re
import shutil
import time

from fastapi import HTTPException, UploadFile
from google.ai.generativelanguage_v1beta import (
    Content,
    GenerationConfig,
    GenerateContentRequest,
    GenerativeServiceClient,
    Part,
    Schema,
    Type,
)
from google.api_core.client_options import ClientOptions
from langchain_community.document_loaders import PyPDFLoader
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from models import Document, DocumentChunk
from schemas import ChatResponse, ChatSection, RetrievedChunk

INSUFFICIENT_DATA_MESSAGE = "Insufficient data in the current knowledge base to answer this query."
INVALID_MODEL_RESPONSE_MESSAGE = "The language model returned an invalid structured response."


class StructuredAnswerPayload(BaseModel):
    synthesis: str
    key_data_points: list[str] = Field(default_factory=list)


class RagService:
    def __init__(self, db: Session):
        self.db = db
        api_key = os.getenv("GOOGLE_API_KEY")

        if not api_key or api_key == "your_google_api_key_here":
            print("WARNING: GOOGLE_API_KEY is not set correctly.")
            self.embeddings = None
            self.llm = None
            self.chat_client = None
            self.chat_model = None
        else:
            self.embeddings = GoogleGenerativeAIEmbeddings(
                model="models/gemini-embedding-001",
                google_api_key=api_key,
            )
            self.llm = None
            self.chat_client = GenerativeServiceClient(
                client_options=ClientOptions(api_key=api_key)
            )
            self.chat_model = os.getenv("GOOGLE_CHAT_MODEL", "models/gemma-4-31b-it")

    async def process_and_store_document(self, file: UploadFile) -> Document:
        if not self.embeddings:
            raise HTTPException(status_code=500, detail="Google API Key is missing.")

        os.makedirs("temp_uploads", exist_ok=True)
        unique_filename = f"{int(time.time())}_{file.filename}"
        file_path = f"temp_uploads/{unique_filename}"

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        db_document = Document(filename=file.filename, s3_key=file_path)
        self.db.add(db_document)
        self.db.commit()
        self.db.refresh(db_document)

        try:
            loader = PyPDFLoader(file_path)
            pages = loader.load()

            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200,
                length_function=len,
                is_separator_regex=False,
            )

            chunks = text_splitter.split_documents(pages)
            texts = [chunk.page_content for chunk in chunks]

            try:
                embeddings_list = self.embeddings.embed_documents(texts)
            except Exception as embed_err:
                print(f"Embedding failed: {embed_err}")
                raise embed_err

            for i, chunk in enumerate(chunks):
                page_number = chunk.metadata.get("page", 0) + 1
                embedding_vector = embeddings_list[i]

                db_chunk = DocumentChunk(
                    document_id=db_document.id,
                    page_number=page_number,
                    chunk_index=i,
                    text_content=chunk.page_content,
                    embedding=embedding_vector,
                )
                self.db.add(db_chunk)

            self.db.commit()

        except Exception as e:
            self.db.delete(db_document)
            self.db.commit()
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

        return db_document

    async def query_knowledge_base(self, query: str) -> ChatResponse:
        if not self.embeddings or not (getattr(self, "llm", None) or getattr(self, "chat_client", None)):
            raise HTTPException(status_code=500, detail="Google API Key is missing.")

        query_embedding = self.embeddings.embed_query(query)

        results = self.db.query(DocumentChunk, Document.filename).join(
            Document, DocumentChunk.document_id == Document.id
        ).order_by(
            DocumentChunk.embedding.cosine_distance(query_embedding)
        ).limit(5).all()

        if not results:
            return self._build_chat_response(
                status="insufficient_data",
                synthesis=INSUFFICIENT_DATA_MESSAGE,
                key_data_points=[],
                sources=[],
                retrieved_chunks=[],
            )

        context_parts = []
        sources = []
        retrieved_chunks = []

        for chunk, filename in results:
            source_info = f"{filename}, Page {chunk.page_number}"
            context_parts.append(f"--- Source: {source_info} ---\n{chunk.text_content}\n")
            retrieved_chunks.append({
                "text": chunk.text_content,
                "source": source_info,
            })

            if source_info not in sources:
                sources.append(source_info)

        structured_answer = self._generate_structured_answer("\n".join(context_parts), query)

        if structured_answer.synthesis == INVALID_MODEL_RESPONSE_MESSAGE:
            return self._build_chat_response(
                status="error",
                synthesis=INVALID_MODEL_RESPONSE_MESSAGE,
                key_data_points=[],
                sources=[],
                retrieved_chunks=[],
            )

        status = "insufficient_data" if structured_answer.synthesis == INSUFFICIENT_DATA_MESSAGE else "ok"
        return self._build_chat_response(
            status=status,
            synthesis=structured_answer.synthesis,
            key_data_points=structured_answer.key_data_points,
            sources=sources,
            retrieved_chunks=retrieved_chunks,
        )

    def _build_structured_prompt(self, context_text: str, query: str) -> str:
        return (
            "You are an expert academic research synthesizer.\n"
            "Analyze the following retrieved document chunks to answer the user's query.\n"
            "Return valid JSON only with this exact schema:\n"
            "{\"synthesis\": string, \"key_data_points\": string[]}\n\n"
            "STRICT RULES:\n"
            "1. Output JSON only. No markdown. No code fences.\n"
            "2. The synthesis must be concise and academically written.\n"
            "3. Every factual claim in the synthesis and every key data point must include inline citations using the provided source strings.\n"
            "4. If the context is insufficient, set synthesis exactly to "
            f"\"{INSUFFICIENT_DATA_MESSAGE}\" and return an empty key_data_points array.\n"
            "5. key_data_points must be a flat array of short strings.\n\n"
            f"CONTEXT CHUNKS:\n{context_text}\n\n"
            f"USER QUERY: {query}"
        )

    def _build_repair_prompt(self, raw_response: str) -> str:
        return (
            "Convert the following content into valid JSON with this exact schema:\n"
            "{\"synthesis\": string, \"key_data_points\": string[]}\n"
            "Output JSON only. If the content does not contain a valid answer, set synthesis to "
            f"\"{INSUFFICIENT_DATA_MESSAGE}\" and key_data_points to [].\n\n"
            f"CONTENT:\n{raw_response}"
        )

    def _generate_structured_answer(self, context_text: str, query: str) -> StructuredAnswerPayload:
        prompt = self._build_structured_prompt(context_text, query)
        last_response_text = ""

        for attempt in range(2):
            last_response_text = self._invoke_chat_model(prompt)

            try:
                return self._parse_structured_answer(last_response_text)
            except (json.JSONDecodeError, ValidationError, ValueError):
                if attempt == 0:
                    prompt = self._build_repair_prompt(last_response_text)

        return StructuredAnswerPayload(
            synthesis=INVALID_MODEL_RESPONSE_MESSAGE,
            key_data_points=[],
        )

    def _invoke_chat_model(self, prompt: str) -> str:
        if getattr(self, "llm", None) and hasattr(self.llm, "invoke"):
            response = self.llm.invoke(prompt)
            return self._coerce_response_text(response.content)

        request = GenerateContentRequest(
            model=self.chat_model,
            contents=[Content(parts=[Part(text=prompt)], role="user")],
            generation_config=GenerationConfig(
                response_mime_type="application/json",
                response_schema=Schema(
                    type=Type.OBJECT,
                    properties={
                        "synthesis": Schema(type=Type.STRING),
                        "key_data_points": Schema(type=Type.ARRAY, items=Schema(type=Type.STRING)),
                    },
                    required=["synthesis", "key_data_points"],
                ),
            ),
        )

        response = self.chat_client.generate_content(
            request=request,
            timeout=float(os.getenv("GOOGLE_CHAT_TIMEOUT_SECONDS", "45")),
        )

        if not response.candidates:
            raise ValueError("Model did not return any candidates")

        parts = response.candidates[0].content.parts
        return "\n".join(part.text for part in parts if getattr(part, "text", ""))

    def _parse_structured_answer(self, response_text: str) -> StructuredAnswerPayload:
        json_text = self._extract_json_text(response_text)
        payload = json.loads(json_text)
        if not isinstance(payload, dict):
            raise ValueError("Model response did not produce a JSON object")
        return StructuredAnswerPayload.model_validate(payload)

    def _extract_json_text(self, response_text: str) -> str:
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end < start:
            raise ValueError("No JSON object found in model response")
        return cleaned[start:end + 1]

    def _coerce_response_text(self, content) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict) and "text" in item:
                    parts.append(str(item["text"]))
                else:
                    parts.append(str(item))
            return "\n".join(parts)
        return str(content)

    def _build_chat_response(
        self,
        status: str,
        synthesis: str,
        key_data_points: list[str],
        sources: list[str],
        retrieved_chunks: list[dict],
    ) -> ChatResponse:
        sections = [
            ChatSection(key="synthesis", title="Synthesis", body=synthesis),
            ChatSection(key="key_data_points", title="Key Data Points", items=key_data_points),
            ChatSection(key="sources", title="Sources", items=sources),
        ]
        return ChatResponse(
            status=status,
            answer=self._render_answer(sections),
            sources=sources,
            chunks=[RetrievedChunk.model_validate(chunk) for chunk in retrieved_chunks],
            sections=sections,
        )

    def _render_answer(self, sections: list[ChatSection]) -> str:
        rendered_sections = []

        for section in sections:
            lines = [f"### {section.title}"]
            if section.body:
                lines.append(section.body)
            lines.extend(f"- {item}" for item in section.items)
            rendered_sections.append("\n".join(lines))

        return "\n\n".join(rendered_sections)
