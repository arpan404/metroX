import logging
from fastapi import APIRouter, HTTPException
from uuid import uuid4
from afk.core import Runner
from afk.agents.errors import AgentExecutionError
from agents import AGENT_REGISTRY
from models import ChatRequest, ChatResponse

router = APIRouter(prefix="/agents", tags=["agents"])
runner = Runner()
logger = logging.getLogger(__name__)


@router.get("/")
async def list_agents():
    return {"agents": list(AGENT_REGISTRY.keys())}


@router.post("/{agent_name}/chat", response_model=ChatResponse)
async def chat(agent_name: str, req: ChatRequest):
    if agent_name not in AGENT_REGISTRY:
        raise HTTPException(404, f"Agent '{agent_name}' not found. Available: {list(AGENT_REGISTRY.keys())}")

    agent = AGENT_REGISTRY[agent_name]
    thread_id = req.thread_id or f"{agent_name}-{uuid4().hex[:12]}"
    user_message = req.resolved_user_message()
    if not user_message:
        raise HTTPException(422, "Missing message content. Provide one of: user_message, message, or prompt.")

    try:
        result = await runner.run(agent=agent, user_message=user_message, thread_id=thread_id)
    except AgentExecutionError as exc:
        message = str(exc).strip() or "Target agent execution failed."
        logger.warning(
            "agent_execution_failed agent=%s thread_id=%s error=%s",
            agent_name,
            thread_id,
            message,
        )
        raise HTTPException(
            status_code=502,
            detail={
                "code": "agent_execution_error",
                "message": message,
                "agent_name": agent_name,
                "thread_id": thread_id,
            },
        ) from exc
    except Exception as exc:
        message = str(exc).strip() or "Unexpected target agent runtime failure."
        logger.exception(
            "agent_runtime_unexpected_error agent=%s thread_id=%s",
            agent_name,
            thread_id,
        )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "agent_runtime_error",
                "message": message,
                "agent_name": agent_name,
                "thread_id": thread_id,
            },
        ) from exc

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
