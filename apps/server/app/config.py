from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AUTOREDTEAM_", extra="ignore")

    database_url: str = Field(
        default="postgresql+psycopg://autoredteam:autoredteam@localhost:5432/autoredteam"
    )
    api_key: str = Field(default="local-dev-key")
    redis_url: str = Field(default="redis://localhost:6379/0")
    allow_synthetic_targets: bool = Field(default=True)

    quick_attack_count: int = Field(default=100)
    standard_attack_count: int = Field(default=2000)
    deep_attack_count: int = Field(default=12000)

    low_confidence_min: float = Field(default=0.40)
    low_confidence_max: float = Field(default=0.70)
    secret_active_key_version: str = Field(default="v1")
    secret_keys_json: str = Field(default="")
    secret_backend: str = Field(default="local")
    aws_kms_key_id: str = Field(default="")
    aws_region: str = Field(default="us-east-1")
    use_migrations: bool = Field(default=False)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
