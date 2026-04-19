import os
import shutil
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

        import time
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

            for i, chunk in enumerate(chunks):
                page_number = chunk.metadata.get('page', 0) + 1

                embedding_vector = self.embeddings.embed_query(chunk.page_content)

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
        
        for chunk, filename in results:
            source_info = f"{filename}, Page {chunk.page_number}"
            context_parts.append(f"--- Source: {source_info} ---\n{chunk.text_content}\n")
            
            # Add to sources list uniquely
            if source_info not in sources:
                sources.append(source_info)

        context_text = "\n".join(context_parts)

        # 4. Generate answer using Gemini
        prompt_template = PromptTemplate.from_template(
            "You are ScholarFlow, an intelligent research assistant.\n"
            "Use the following pieces of retrieved context from the user's documents to answer the question.\n"
            "When answering, explicitly cite the sources provided in the context (e.g., [Document Name, Page X]).\n"
            "If the answer is not contained within the context, say 'I cannot answer this based on the provided documents.'\n\n"
            "Context:\n{context}\n\n"
            "Question: {question}\n\n"
            "Answer:"
        )

        prompt = prompt_template.format(context=context_text, question=query)
        
        response = self.llm.invoke(prompt)
        
        answer = response.content
        if isinstance(answer, list):
            answer = "\n".join([str(item) for item in answer])
            
        return answer, sources
