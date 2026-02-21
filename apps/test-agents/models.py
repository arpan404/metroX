from pydantic import BaseModel, ConfigDict, Field
from typing import Any


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    user_message: str | None = None
    message: str | None = None
    prompt: str | None = None
    thread_id: str | None = None

    def resolved_user_message(self) -> str:
        for candidate in (self.user_message, self.message, self.prompt):
            text = str(candidate or "").strip()
            if text:
                return text
        return ""


class ChatResponse(BaseModel):
    response_text: str
    thread_id: str
    run_id: str
    tool_events: list[dict[str, Any]] = Field(default_factory=list)
