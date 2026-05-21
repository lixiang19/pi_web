from __future__ import annotations

import asyncio
import json
import time
import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .artifacts import artifact_model
from .config import ConverterSettings
from .converters import convert_source
from .errors import ConverterError, error_body, http_error
from .input_sources import source_from_base64, source_from_url
from .jobs import JobStore
from .models import (
    CapabilitiesResponse,
    CapabilityTask,
    ConversionInput,
    ConversionJob,
    ConversionRequest,
    SourceFile,
)


def _json_response_error(status_code: int, code: str, message: str, details: dict[str, object] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=error_body(code, message, details))


def _safe_json_object(value: str | None, field: str) -> dict[str, object] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ConverterError("invalid_input", f"{field} must be valid JSON", 400) from exc
    if not isinstance(parsed, dict):
        raise ConverterError("invalid_input", f"{field} must be a JSON object", 400)
    return parsed


def _capabilities(settings: ConverterSettings) -> CapabilitiesResponse:
    return CapabilitiesResponse(
        version=__version__,
        maxFileSizeBytes=settings.max_file_size_bytes,
        maxInlineSizeBytes=settings.max_inline_size_bytes,
        tasks=[
            CapabilityTask(
                task="document.markdown",
                supportedInputFormats=["pdf", "docx", "pptx", "xlsx", "html", "txt", "md", "csv", "json"],
                supportedOutputFormats=["markdown", "json"],
                optionsSchema={"engine": ["markitdown"], "extractImages": "boolean", "extractTables": "boolean"},
            ),
            CapabilityTask(
                task="audio.transcription",
                supportedInputFormats=["mp3", "wav", "m4a", "flac", "ogg", "webm", "mp4", "mpeg", "mpga"],
                supportedOutputFormats=["markdown", "json"],
                optionsSchema={
                    "engine": ["groq", "markitdown", "faster-whisper"],
                    "model": "Groq audio model id",
                    "language": "ISO-639-1 language code or auto",
                    "prompt": "string",
                    "format": "markdown",
                },
            ),
            CapabilityTask(
                task="image.ocr",
                supportedInputFormats=["png", "jpg", "jpeg", "webp", "tiff", "bmp"],
                supportedOutputFormats=["markdown", "json"],
                optionsSchema={
                    "engine": ["vision", "markitdown", "tesseract"],
                    "model": "OpenAI-compatible vision model id",
                    "language": "string",
                    "prompt": "string",
                    "outputBlocks": "boolean",
                },
            ),
            CapabilityTask(
                task="image.description",
                supportedInputFormats=["png", "jpg", "jpeg", "webp"],
                supportedOutputFormats=["markdown", "json"],
                optionsSchema={
                    "engine": ["vision", "markitdown"],
                    "model": "OpenAI-compatible vision model id",
                    "prompt": "string",
                },
            ),
            CapabilityTask(
                task="document.ocr_markdown",
                supportedInputFormats=["pdf", "png", "jpg", "jpeg", "tiff"],
                supportedOutputFormats=["markdown", "json"],
                optionsSchema={"ocrFallback": "boolean", "language": "string"},
            ),
        ],
    )


def create_app(settings: ConverterSettings | None = None) -> FastAPI:
    actual_settings = settings or ConverterSettings()
    actual_settings.validate_security()
    actual_settings.ensure_dirs()
    store = JobStore()
    app = FastAPI(title="ridge converter", version=__version__)

    async def authenticate(authorization: str | None = Header(default=None)) -> str:
        if not authorization or not authorization.startswith("Bearer "):
            raise http_error("auth_failed", "Missing bearer token", 401)
        token = authorization.removeprefix("Bearer ").strip()
        if token not in actual_settings.api_keys:
            raise http_error("auth_failed", "Invalid bearer token", 401)
        return token

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict) and "error" in exc.detail:
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        return _json_response_error(exc.status_code, "unknown", str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _json_response_error(400, "invalid_input", "Request validation failed", {"errors": exc.errors()})

    @app.exception_handler(ConverterError)
    async def handle_converter_error(_: Request, exc: ConverterError) -> JSONResponse:
        return _json_response_error(exc.http_status, exc.code, exc.message, exc.details)

    async def run_job(job_id: str, source: SourceFile, request_data: ConversionRequest) -> ConversionJob:
        job = store.start(job_id)
        if not job or job.status == "canceled":
            return store.get(job_id)  # type: ignore[return-value]
        started = time.monotonic()
        try:
            converted = convert_source(source, request_data.task, actual_settings, request_data.options)
            artifacts = [artifact_model(job_id, artifact, actual_settings) for artifact in converted]
            result = {"artifactCount": len(artifacts), "format": request_data.preferredFormat or "markdown"}
            completed = store.succeed(job_id, artifacts=artifacts, result=result, warnings=None, duration=round(time.monotonic() - started, 4))
            if request_data.callbackUrl:
                await post_callback(request_data.callbackUrl, completed)
            return completed
        except ConverterError as exc:
            failed = store.fail(job_id, exc.code, exc.message, exc.details)
            if request_data.callbackUrl:
                await post_callback(request_data.callbackUrl, failed)
            return failed
        except Exception as exc:
            failed = store.fail(job_id, "conversion_failed", str(exc))
            if request_data.callbackUrl:
                await post_callback(request_data.callbackUrl, failed)
            return failed

    async def post_callback(callback_url: str, job: ConversionJob) -> None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                await client.post(callback_url, json=job.model_dump(mode="json"))
            except httpx.HTTPError:
                return

    async def parse_create_request(request: Request) -> tuple[ConversionRequest, SourceFile]:
        content_type = request.headers.get("content-type", "")
        if content_type.startswith("multipart/form-data"):
            form = await request.form()
            upload = form.get("file")
            if not isinstance(upload, UploadFile) and not hasattr(upload, "read"):
                raise ConverterError("invalid_input", "multipart field file is required", 400)
            data = await upload.read()
            if len(data) > actual_settings.max_file_size_bytes:
                raise ConverterError("file_too_large", f"Input exceeds {actual_settings.max_file_size_bytes} bytes", 413)
            task = str(form.get("task") or "")
            request_data = ConversionRequest(
                task=task,  # type: ignore[arg-type]
                options=_safe_json_object(form.get("options"), "options"),
                clientJobId=str(form.get("clientJobId")) if form.get("clientJobId") else None,
                callbackUrl=str(form.get("callbackUrl")) if form.get("callbackUrl") else None,
                metadata=_safe_json_object(form.get("metadata"), "metadata"),
                preferredFormat=str(form.get("preferredFormat")) if form.get("preferredFormat") else None,  # type: ignore[arg-type]
                waitMs=int(str(form.get("waitMs"))) if form.get("waitMs") else None,
            )
            source = SourceFile(
                filename=upload.filename or "upload.bin",
                mime_type=upload.content_type or "application/octet-stream",
                data=data,
            )
            return request_data, source

        payload = await request.json()
        request_data = ConversionRequest.model_validate(payload)
        if not request_data.input:
            raise ConverterError("invalid_input", "input is required for JSON conversion requests", 400)
        if request_data.input.base64:
            source = source_from_base64(request_data.input, actual_settings)
        elif request_data.input.url:
            source = await source_from_url(request_data.input, actual_settings)
        else:
            raise ConverterError("invalid_input", "input.url or input.base64 is required", 400)
        return request_data, source

    @app.get("/v1/health")
    async def health(_api_key: str = Depends(authenticate)) -> dict[str, object]:
        return {"status": "ok", "version": __version__, "tasks": [task.task for task in _capabilities(actual_settings).tasks]}

    @app.get("/v1/capabilities")
    async def capabilities(_api_key: str = Depends(authenticate)) -> CapabilitiesResponse:
        return _capabilities(actual_settings)

    @app.post("/v1/conversions", status_code=202)
    async def create_conversion(
        request: Request,
        background_tasks: BackgroundTasks,
        api_key: str = Depends(authenticate),
    ) -> ConversionJob:
        request_data, source = await parse_create_request(request)
        job = store.create(api_key, request_data.task, request_data.clientJobId, request_data.metadata)
        if job.status != "queued":
            return job
        should_run_now = actual_settings.run_jobs_inline or bool(request_data.waitMs and request_data.waitMs > 0)
        if should_run_now:
            return await run_job(job.jobId, source, request_data)
        if actual_settings.start_background_jobs:
            background_tasks.add_task(run_job, job.jobId, source, request_data)
        return job

    @app.get("/v1/conversions/{job_id}")
    async def get_conversion(job_id: str, _api_key: str = Depends(authenticate)) -> ConversionJob:
        job = store.get(job_id)
        if not job:
            raise http_error("not_found", "Conversion job not found", 404)
        return job

    @app.post("/v1/conversions/{job_id}/cancel", status_code=204)
    async def cancel_conversion(job_id: str, _api_key: str = Depends(authenticate)) -> Response:
        job = store.get(job_id)
        if not job:
            raise http_error("not_found", "Conversion job not found", 404)
        if not store.cancel(job_id):
            raise http_error("already_canceled", "Conversion job is already terminal", 409)
        return Response(status_code=204)

    @app.get("/v1/conversions/{job_id}/artifacts")
    async def list_artifacts(job_id: str, _api_key: str = Depends(authenticate)) -> list:
        job = store.get(job_id)
        if not job:
            raise http_error("not_found", "Conversion job not found", 404)
        return job.artifacts or []

    @app.get("/v1/conversions/{job_id}/artifacts/{artifact_id}")
    async def download_artifact(job_id: str, artifact_id: str, _api_key: str = Depends(authenticate)) -> FileResponse:
        job = store.get(job_id)
        if not job:
            raise http_error("not_found", "Conversion job not found", 404)
        if not any(artifact.artifactId == artifact_id for artifact in job.artifacts or []):
            raise http_error("not_found", "Artifact not found", 404)
        path = actual_settings.artifact_dir / job_id / artifact_id
        if not path.exists():
            raise http_error("not_found", "Artifact bytes not found", 404)
        artifact = next(artifact for artifact in job.artifacts or [] if artifact.artifactId == artifact_id)
        return FileResponse(path, media_type=artifact.mimeType, filename=artifact.name)

    return app
