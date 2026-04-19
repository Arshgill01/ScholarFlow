from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import services.rag_service as rag_service

router = APIRouter(
    prefix="/chat",
    tags=["chat"],
)

class ChatRequest(BaseModel):
    query: str

class RetrievedChunk(BaseModel):
    text: str
    source: str

class ChatResponse(BaseModel):
    answer: str
    sources: list
    chunks: list[RetrievedChunk]

@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    service = rag_service.RagService(db)
    
    try:
        answer, sources, chunks = await service.query_knowledge_base(request.query)
        return ChatResponse(answer=answer, sources=sources, chunks=chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
