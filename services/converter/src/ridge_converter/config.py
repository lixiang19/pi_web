from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


DEVELOPMENT_API_KEY = "dev-key"
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _split_csv(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(item.strip() for item in value.split(",") if item.strip())


@dataclass(frozen=True)
class ConverterSettings:
    api_keys: tuple[str, ...] = field(default_factory=lambda: _split_csv(os.getenv("RIDGE_CONVERTER_API_KEYS", "dev-key")))
    public_base_url: str = os.getenv("RIDGE_CONVERTER_PUBLIC_BASE_URL", "http://127.0.0.1:8765/v1")
    host: str = os.getenv("RIDGE_CONVERTER_HOST", "127.0.0.1")
    port: int = int(os.getenv("RIDGE_CONVERTER_PORT", "8765"))
    artifact_dir: Path = Path(os.getenv("RIDGE_CONVERTER_ARTIFACT_DIR", tempfile.gettempdir())) / "ridge-converter"
    max_file_size_bytes: int = int(os.getenv("RIDGE_CONVERTER_MAX_FILE_SIZE_BYTES", str(100 * 1024 * 1024)))
    max_inline_size_bytes: int = int(os.getenv("RIDGE_CONVERTER_MAX_INLINE_SIZE_BYTES", str(64 * 1024)))
    run_jobs_inline: bool = os.getenv("RIDGE_CONVERTER_RUN_JOBS_INLINE", "0") == "1"
    start_background_jobs: bool = os.getenv("RIDGE_CONVERTER_START_BACKGROUND_JOBS", "1") != "0"
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_vision_model: str = os.getenv("RIDGE_CONVERTER_VISION_MODEL", "gpt-4.1-mini")
    vision_api_key: str | None = os.getenv("RIDGE_CONVERTER_VISION_API_KEY") or os.getenv("OPENAI_API_KEY")
    vision_base_url: str = os.getenv("RIDGE_CONVERTER_VISION_BASE_URL", "https://api.openai.com/v1")
    vision_model: str = os.getenv("RIDGE_CONVERTER_VISION_MODEL", "gpt-4.1-mini")
    groq_api_key: str | None = os.getenv("GROQ_API_KEY")
    groq_base_url: str = os.getenv("RIDGE_CONVERTER_GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    groq_audio_model: str = os.getenv("RIDGE_CONVERTER_GROQ_AUDIO_MODEL", "whisper-large-v3-turbo")
    whisper_model_size: str = os.getenv("RIDGE_CONVERTER_WHISPER_MODEL_SIZE", "base")

    def ensure_dirs(self) -> None:
        self.artifact_dir.mkdir(parents=True, exist_ok=True)

    def validate_security(self) -> None:
        if not self.api_keys:
            raise RuntimeError("RIDGE_CONVERTER_API_KEYS must include at least one API key")
        is_public_bind = self.host not in LOOPBACK_HOSTS
        is_production = os.getenv("NODE_ENV") == "production" or os.getenv("RIDGE_ENV") == "production"
        uses_development_key = DEVELOPMENT_API_KEY in self.api_keys
        if (is_public_bind or is_production) and uses_development_key:
            raise RuntimeError(
                "RIDGE_CONVERTER_API_KEYS must be explicitly configured with non-dev keys "
                "when binding publicly or running in production"
            )
