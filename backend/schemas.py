from typing import Literal, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str


class RetrievedChunk(BaseModel):
    text: str
    source: str


class ChatSection(BaseModel):
    key: Literal["synthesis", "key_data_points", "sources"]
    title: str
    body: Optional[str] = None
    items: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    status: Literal["ok", "insufficient_data", "error"]
    answer: str
    sources: list[str] = Field(default_factory=list)
    chunks: list[RetrievedChunk] = Field(default_factory=list)
    sections: list[ChatSection] = Field(default_factory=list)
