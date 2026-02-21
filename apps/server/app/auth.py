from fastapi import Depends, Header, HTTPException, Query, status

from app.config import get_settings


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    api_key: str | None = Query(default=None),
) -> str:
    settings = get_settings()
    candidate = x_api_key or api_key
    if candidate != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    return candidate


def auth_dependency(_: str = Depends(require_api_key)) -> None:
    return None
