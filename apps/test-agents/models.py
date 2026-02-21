from pydantic import BaseModel, Field
from typing import Any


class ChatRequest(BaseModel):
    user_message: str
    thread_id: str | None = None


class ChatResponse(BaseModel):
    response_text: str
    thread_id: str
    run_id: str
    tool_events: list[dict[str, Any]] = Field(default_factory=list)
