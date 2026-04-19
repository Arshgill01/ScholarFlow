from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    s3_key = Column(String, unique=True, index=True) # Or local path if not using S3 initially
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship to DocumentChunk
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"))
    page_number = Column(Integer)
    chunk_index = Column(Integer)
    text_content = Column(Text)
    
    # Vector embedding column (Google models can output up to 3072 depending on the model/settings)
    embedding = Column(Vector(3072))

    # Relationship to Document
    document = relationship("Document", back_populates="chunks")
