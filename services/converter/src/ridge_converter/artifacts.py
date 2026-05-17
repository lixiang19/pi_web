from __future__ import annotations

import base64
import mimetypes
import uuid

from .config import ConverterSettings
from .models import Artifact, ConvertedArtifact


TEXT_MIME_PREFIXES = ("text/",)
TEXT_MIME_TYPES = {"application/json"}


def is_text_mime(mime_type: str) -> bool:
    return mime_type.startswith(TEXT_MIME_PREFIXES) or mime_type in TEXT_MIME_TYPES


def artifact_model(job_id: str, converted: ConvertedArtifact, settings: ConverterSettings) -> Artifact:
    artifact_id = uuid.uuid4().hex
    target = settings.artifact_dir / job_id / artifact_id
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(converted.data)
    size = len(converted.data)
    inline = size <= settings.max_inline_size_bytes
    content: str | None = None
    if inline:
        if is_text_mime(converted.mime_type):
            content = converted.data.decode("utf-8")
        else:
            content = base64.b64encode(converted.data).decode("ascii")
    download_url = None if inline else f"{settings.public_base_url.rstrip('/')}/conversions/{job_id}/artifacts/{artifact_id}"
    return Artifact(
        artifactId=artifact_id,
        name=converted.name,
        mimeType=converted.mime_type,
        size=size,
        inline=inline,
        content=content,
        downloadUrl=download_url,
    )


def guess_mime(name: str, fallback: str = "application/octet-stream") -> str:
    return mimetypes.guess_type(name)[0] or fallback
