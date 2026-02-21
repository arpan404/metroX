from fastapi import APIRouter, HTTPException
from uuid import uuid4
from afk.core import Runner
from agents import AGENT_REGISTRY
from models import ChatRequest, ChatResponse

router = APIRouter(prefix="/agents", tags=["agents"])
runner = Runner()


@router.get("/")
async def list_agents():
    return {"agents": list(AGENT_REGISTRY.keys())}


@router.post("/{agent_name}/chat", response_model=ChatResponse)
async def chat(agent_name: str, req: ChatRequest):
    if agent_name not in AGENT_REGISTRY:
        raise HTTPException(404, f"Agent '{agent_name}' not found. Available: {list(AGENT_REGISTRY.keys())}")

    agent = AGENT_REGISTRY[agent_name]
    thread_id = req.thread_id or f"{agent_name}-{uuid4().hex[:12]}"

    result = await runner.run(agent=agent, user_message=req.user_message, thread_id=thread_id)

    tool_events = []
    if result.tool_executions:
        tool_events = [
            {
                "tool_name": t.tool_name,
                "success": t.success,
                "output": str(t.output)[:500] if t.output else None,
            }
            for t in result.tool_executions
        ]

    return ChatResponse(
        response_text=result.final_text,
        thread_id=thread_id,
        run_id=result.run_id,
        tool_events=tool_events,
    )
