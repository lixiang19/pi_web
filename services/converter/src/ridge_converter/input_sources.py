from __future__ import annotations

import base64
import ipaddress
import socket
from urllib.parse import urlparse

import httpx

from .config import ConverterSettings
from .errors import ConverterError
from .models import ConversionInput, SourceFile


MIME_EXTENSION_MAP = {
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/html": ".html",
    "text/csv": ".csv",
    "application/json": ".json",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/tiff": ".tiff",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mp4": ".m4a",
    "video/mp4": ".mp4",
}


def _safe_filename_from_mime(mime_type: str | None) -> str:
    normalized = (mime_type or "").split(";", 1)[0].strip().lower()
    return f"input{MIME_EXTENSION_MAP.get(normalized, '.bin')}"


def source_from_base64(input_: ConversionInput, settings: ConverterSettings) -> SourceFile:
    value = input_.base64
    if not value:
        raise ConverterError("invalid_input", "input.base64 is required", 400)
    mime_type = input_.mimeType or "application/octet-stream"
    payload = value
    if value.startswith("data:"):
        header, _, payload = value.partition(",")
        if ";base64" not in header:
            raise ConverterError("invalid_input", "Only base64 data URIs are supported", 400)
        declared = header.removeprefix("data:").split(";", 1)[0]
        if declared:
            mime_type = declared
    try:
        data = base64.b64decode(payload, validate=True)
    except ValueError as exc:
        raise ConverterError("invalid_input", "input.base64 is not valid base64", 400) from exc
    if len(data) > settings.max_file_size_bytes:
        raise ConverterError("file_too_large", f"Input exceeds {settings.max_file_size_bytes} bytes", 413)
    return SourceFile(filename=_safe_filename_from_mime(mime_type), mime_type=mime_type, data=data)


def _is_private_or_local(hostname: str) -> bool:
    lowered = hostname.lower()
    if lowered in {"localhost", "127.0.0.1", "::1"}:
        return True
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    for info in infos:
        address = info[4][0]
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError:
            continue
        if parsed.is_private or parsed.is_loopback or parsed.is_link_local or parsed.is_reserved:
            return True
    return False


def validate_remote_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ConverterError("invalid_input", "Only HTTPS input.url is supported", 400)
    if not parsed.hostname:
        raise ConverterError("invalid_input", "input.url must include a hostname", 400)
    if _is_private_or_local(parsed.hostname):
        raise ConverterError("invalid_input", "input.url cannot target localhost or private networks", 400)


async def source_from_url(input_: ConversionInput, settings: ConverterSettings) -> SourceFile:
    if not input_.url:
        raise ConverterError("invalid_input", "input.url is required", 400)
    validate_remote_url(input_.url)
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        try:
            response = await client.get(input_.url)
        except httpx.HTTPError as exc:
            raise ConverterError("fetch_failed", str(exc), 502) from exc
    if response.status_code >= 400:
        raise ConverterError("fetch_failed", f"Fetch failed with HTTP {response.status_code}", 502)
    data = response.content
    if len(data) > settings.max_file_size_bytes:
        raise ConverterError("file_too_large", f"Input exceeds {settings.max_file_size_bytes} bytes", 413)
    filename = input_.url.rstrip("/").rsplit("/", 1)[-1] or _safe_filename_from_mime(input_.mimeType)
    mime_type = input_.mimeType or response.headers.get("content-type", "application/octet-stream").split(";", 1)[0]
    return SourceFile(filename=filename, mime_type=mime_type, data=data)
