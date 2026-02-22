from fastapi import Depends, Header, HTTPException, status
from starlette.requests import HTTPConnection

from app.config import get_settings


def require_api_key(
    connection: HTTPConnection,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> str:
    settings = get_settings()
    candidate = str(x_api_key or "").strip()
    if not candidate:
        candidate = str(
            connection.query_params.get("api_key")
            or connection.query_params.get("x_api_key")
            or ""
        ).strip()
    if candidate != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    return candidate


def auth_dependency(_: str = Depends(require_api_key)) -> None:
    return None
