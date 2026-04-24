import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import get_engine
from routers import documents, chat


def should_initialize_database() -> bool:
    return os.getenv("INIT_DB_ON_STARTUP", "false").lower() == "true"


@asynccontextmanager
async def lifespan(_: FastAPI):
    if should_initialize_database():
        import models

        models.Base.metadata.create_all(bind=get_engine())
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="ScholarFlow API",
        description="RAG-powered research assistant backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
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

    return app


app = create_app()
