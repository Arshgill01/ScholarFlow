from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import services.rag_service as rag_service

router = APIRouter(
    prefix="/documents",
    tags=["documents"],
    responses={404: {"description": "Not found"}},
)

@router.post("/upload")
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    service = rag_service.RagService(db)
    document = await service.process_and_store_document(file)
    
    return {"message": "Document uploaded and processed successfully", "document_id": document.id, "filename": document.filename}

@router.get("/")
def list_documents(db: Session = Depends(get_db)):
    from models import Document
    docs = db.query(Document).all()
    return [{"id": d.id, "filename": d.filename, "upload_date": d.upload_date} for d in docs]
