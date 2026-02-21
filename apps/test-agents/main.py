from contextlib import asynccontextmanager
from fastapi import FastAPI
import uvicorn
from db import init_db, seed_db
from routes import router as agents_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_db()
    yield


app = FastAPI(title="MetroX Test Agents", version="0.1.0", lifespan=lifespan)
app.include_router(agents_router)


@app.get("/health")
async def health():
    from agents import AGENT_REGISTRY
    return {"status": "ok", "agent_count": len(AGENT_REGISTRY), "agents": list(AGENT_REGISTRY.keys())}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)