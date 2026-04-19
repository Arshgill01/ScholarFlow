import os
import shutil
import time
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import UploadFile, HTTPException
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from models import Document, DocumentChunk

class RagService:
    def __init__(self, db: Session):
        self.db = db
        api_key = os.getenv("GOOGLE_API_KEY")
        
        if not api_key or api_key == "your_google_api_key_here":
            print("WARNING: GOOGLE_API_KEY is not set correctly.")
            self.embeddings = None
            self.llm = None
        else:
            self.embeddings = GoogleGenerativeAIEmbeddings(
                model="models/gemini-embedding-001",
                google_api_key=api_key
            )
            self.llm = ChatGoogleGenerativeAI(
                model="gemma-4-31b-it",
                google_api_key=api_key,
                temperature=0.3
            )

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

            # Extract contents to embed in batch
            texts = [chunk.page_content for chunk in chunks]
            
            # Batch embed to save time and API quota limits
            try:
                embeddings_list = self.embeddings.embed_documents(texts)
            except Exception as embed_err:
                print(f"Embedding failed: {embed_err}")
                raise embed_err

            for i, chunk in enumerate(chunks):
                page_number = chunk.metadata.get('page', 0) + 1
                embedding_vector = embeddings_list[i]

                db_chunk = DocumentChunk(
                    document_id=db_document.id,
                    page_number=page_number,
                    chunk_index=i,
                    text_content=chunk.page_content,
                    embedding=embedding_vector
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

    async def query_knowledge_base(self, query: str):
        if not self.embeddings or not self.llm:
            raise HTTPException(status_code=500, detail="Google API Key is missing.")

        # 1. Embed query
        query_embedding = self.embeddings.embed_query(query)

        # 2. Similarity search using PGVector cosine similarity (<=>)
        # We limit to top 5 most relevant chunks
        results = self.db.query(DocumentChunk, Document.filename).join(
            Document, DocumentChunk.document_id == Document.id
        ).order_by(
            DocumentChunk.embedding.cosine_distance(query_embedding)
        ).limit(5).all()

        if not results:
            return "No documents uploaded yet to answer this query.", []

        # 3. Build context and sources
        context_parts = []
        sources = []
        retrieved_chunks = []
        
        for chunk, filename in results:
            source_info = f"{filename}, Page {chunk.page_number}"
            context_parts.append(f"--- Source: {source_info} ---\n{chunk.text_content}\n")
            
            retrieved_chunks.append({
                "text": chunk.text_content,
                "source": source_info
            })
            
            # Add to sources list uniquely
            if source_info not in sources:
                sources.append(source_info)

        context_text = "\n".join(context_parts)

        # 4. Generate answer using Gemini
        prompt_template = PromptTemplate.from_template(
            "You are an expert academic research synthesizer.\n"
            "Analyze the following retrieved document chunks to answer the user's query.\n\n"
            "STRICT RULES:\n"
            "1. Do NOT use conversational filler (e.g., 'Here is the answer', 'Based on the documents').\n"
            "2. Do NOT repeat the same information multiple times.\n"
            "3. Use a highly structured format with headings: '### Synthesis', '### Key Data Points', and '### Sources'.\n"
            "4. Every factual claim MUST end with an inline citation exactly matching the provided source string (e.g., [Doc.pdf, Page 4]).\n"
            "5. If the context does not contain the answer, output exactly: 'Insufficient data in the current knowledge base to answer this query.'\n\n"
            "CONTEXT CHUNKS:\n{context}\n\n"
            "USER QUERY: {question}\n\n"
            "STRUCTURED ANALYSIS:"
        )

        prompt = prompt_template.format(context=context_text, question=query)
        
        response = self.llm.invoke(prompt)
        
        answer = response.content
        if isinstance(answer, list):
            answer = "\n".join([str(item) for item in answer])
            
        return answer, sources, retrieved_chunks
