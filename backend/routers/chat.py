from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
import services.rag_service as rag_service
from schemas import ChatRequest, ChatResponse

router = APIRouter(
    prefix="/chat",
    tags=["chat"],
)

@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    service = rag_service.RagService(db)
    
    try:
        response = await service.query_knowledge_base(request.query)
        if response.status == "error":
            return JSONResponse(status_code=500, content=response.model_dump(mode="json"))
        return response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
