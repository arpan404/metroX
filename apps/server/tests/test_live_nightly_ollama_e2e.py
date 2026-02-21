from __future__ import annotations

import pytest

from app.runtime.providers import validate_provider
from tests.live_helpers import live_test_config, live_tests_enabled, require_live_preflight


@pytest.mark.nightly_live_model
def test_nightly_live_ollama_preflight_and_validation_hard_fail() -> None:
    if not live_tests_enabled():
        pytest.skip("Set METROX_ENABLE_LIVE_MODEL_TESTS=1 to run nightly live model tests")

    cfg = live_test_config()
    require_live_preflight(cfg)

    out = validate_provider(
        {
            "provider_type": "openai_compatible",
            "base_url": cfg["openai_compat_base_url"],
            "api_key": cfg["api_key"],
            "model": cfg["openai_model"],
        }
    )
    assert out["valid"] is True
    assert out["capability_confidence"] > 0.5
