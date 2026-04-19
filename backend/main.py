from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models
from routers import documents, chat

# Create database tables (For production, use Alembic migrations instead)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ScholarFlow API",
    description="RAG-powered research assistant backend",
    version="0.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Next.js frontend default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(chat.router)

@app.get("/")

def read_root():
    return {"message": "Welcome to ScholarFlow API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
