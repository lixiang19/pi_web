from __future__ import annotations

import json
import mimetypes
import tempfile
import time
import base64
from pathlib import Path

import httpx

from .config import ConverterSettings
from .errors import ConverterError
from .models import ConversionTask, ConvertedArtifact, SourceFile


TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json", ".log"}
DOCUMENT_EXTENSIONS = TEXT_EXTENSIONS | {".html", ".htm", ".pdf", ".docx", ".pptx", ".xlsx", ".xls"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".tif", ".bmp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm", ".mp4", ".mpeg", ".mpga"}


def _base_name(filename: str) -> str:
    name = Path(filename).name
    suffix = Path(name).suffix
    stem = name[: -len(suffix)] if suffix else name
    return stem or "conversion"


def _metadata_artifact(base: str, metadata: dict[str, object]) -> ConvertedArtifact:
    return ConvertedArtifact(
        name=f"{base}.metadata.json",
        mime_type="application/json",
        data=json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8"),
    )


def _markdown_artifact(base: str, markdown: str) -> ConvertedArtifact:
    return ConvertedArtifact(
        name=f"{base}.md",
        mime_type="text/markdown",
        data=markdown.encode("utf-8"),
    )


def _guess_mime_type(filename: str, current: str) -> str:
    if current and current != "application/octet-stream":
        return current
    guessed = mimetypes.guess_type(filename)[0]
    return guessed or current or "application/octet-stream"


def _option_text(options: dict[str, object] | None, key: str) -> str | None:
    value = (options or {}).get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _format_timestamp(seconds: object) -> str:
    try:
        total = max(0.0, float(seconds))
    except (TypeError, ValueError):
        total = 0.0
    minutes = int(total // 60)
    remaining = total - minutes * 60
    return f"{minutes:02d}:{remaining:06.3f}"


def _markdown_from_segments(text: str, segments: object) -> str:
    if not isinstance(segments, list) or not segments:
        return text.strip() or "[Transcription produced no text]"
    lines: list[str] = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        content = str(segment.get("text") or "").strip()
        if not content:
            continue
        start = _format_timestamp(segment.get("start"))
        end = _format_timestamp(segment.get("end"))
        lines.append(f"[{start} - {end}] {content}")
    return "\n\n".join(lines) or text.strip() or "[Transcription produced no text]"


def _markitdown_kwargs(settings: ConverterSettings, options: dict[str, object] | None) -> dict[str, object]:
    kwargs: dict[str, object] = {}
    opts = options or {}
    if opts.get("enablePlugins") is True:
        kwargs["enable_plugins"] = True
    llm_model = str(opts.get("llmModel") or opts.get("model") or settings.openai_vision_model)
    if settings.openai_api_key:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise ConverterError("conversion_failed", "openai package is required for MarkItDown image captions", 502) from exc
        kwargs["llm_client"] = OpenAI(api_key=settings.openai_api_key)
        kwargs["llm_model"] = llm_model
    if isinstance(opts.get("llmPrompt"), str):
        kwargs["llm_prompt"] = str(opts["llmPrompt"])
    if isinstance(opts.get("exiftoolPath"), str):
        kwargs["exiftool_path"] = str(opts["exiftoolPath"])
    return kwargs


def _markitdown_convert(
    source: SourceFile,
    settings: ConverterSettings,
    options: dict[str, object] | None,
) -> tuple[str, dict[str, object]]:
    try:
        from markitdown import MarkItDown
    except ImportError as exc:
        raise ConverterError("conversion_failed", "markitdown is not installed", 502) from exc

    suffix = Path(source.filename).suffix or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(source.data)
        tmp.flush()
        try:
            result = MarkItDown(**_markitdown_kwargs(settings, options)).convert(tmp.name)
        except Exception as exc:
            raise ConverterError("conversion_failed", f"markitdown conversion failed: {exc}", 502) from exc
    markdown = getattr(result, "markdown", None) or getattr(result, "text_content", None)
    if not isinstance(markdown, str) or not markdown.strip():
        raise ConverterError("conversion_failed", "markitdown returned empty Markdown", 502)
    metadata = {
        "engine": "markitdown",
        "engineVersion": "unknown",
        "sourceType": suffix.lstrip(".").lower() or source.mime_type,
        "mimeType": _guess_mime_type(source.filename, source.mime_type),
    }
    return markdown, metadata


def convert_document(
    source: SourceFile,
    task: ConversionTask,
    settings: ConverterSettings,
    options: dict[str, object] | None,
) -> list[ConvertedArtifact]:
    ext = Path(source.filename).suffix.lower()
    if ext not in DOCUMENT_EXTENSIONS:
        raise ConverterError("unsupported_format", f"{ext or source.mime_type} is not supported for {task}", 400)
    base = _base_name(source.filename)
    started = time.monotonic()
    markdown, metadata = _markitdown_convert(source, settings, options)
    metadata["options"] = options or {}
    metadata["durationSeconds"] = round(time.monotonic() - started, 4)
    return [_markdown_artifact(base, markdown), _metadata_artifact(base, metadata)]


def convert_markitdown_resource(
    source: SourceFile,
    task: ConversionTask,
    settings: ConverterSettings,
    options: dict[str, object] | None,
) -> list[ConvertedArtifact]:
    ext = Path(source.filename).suffix.lower()
    if task in {"image.ocr", "image.description"} and ext not in IMAGE_EXTENSIONS and not source.mime_type.startswith("image/"):
        raise ConverterError("unsupported_format", f"{ext or source.mime_type} is not supported for {task}", 400)
    if task == "audio.transcription" and ext not in AUDIO_EXTENSIONS and not source.mime_type.startswith(("audio/", "video/")):
        raise ConverterError("unsupported_format", f"{ext or source.mime_type} is not supported for audio transcription", 400)
    base = _base_name(source.filename)
    started = time.monotonic()
    markdown, metadata = _markitdown_convert(source, settings, options)
    metadata["task"] = task
    metadata["options"] = options or {}
    metadata["durationSeconds"] = round(time.monotonic() - started, 4)
    return [_markdown_artifact(base, markdown), _metadata_artifact(base, metadata)]


def convert_image_ocr(source: SourceFile, options: dict[str, object] | None) -> list[ConvertedArtifact]:
    ext = Path(source.filename).suffix.lower()
    if ext not in IMAGE_EXTENSIONS and not source.mime_type.startswith("image/"):
        raise ConverterError("unsupported_format", f"{ext or source.mime_type} is not supported for image OCR", 400)
    try:
        from PIL import Image
        import pytesseract
    except ImportError as exc:
        raise ConverterError("conversion_failed", "Pillow and pytesseract are required for image OCR", 502) from exc

    base = _base_name(source.filename)
    with tempfile.NamedTemporaryFile(suffix=ext or ".png") as tmp:
        tmp.write(source.data)
        tmp.flush()
        try:
            image = Image.open(tmp.name)
            language = str((options or {}).get("language", "eng"))
            if language == "auto":
                language = "eng"
            text = pytesseract.image_to_string(image, lang=language)
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        except Exception as exc:
            raise ConverterError("conversion_failed", f"image OCR failed: {exc}", 502) from exc
    blocks = []
    for idx, content in enumerate(data.get("text", [])):
        cleaned = str(content).strip()
        if not cleaned:
            continue
        blocks.append({
            "text": cleaned,
            "confidence": data.get("conf", [""])[idx],
            "left": data.get("left", [None])[idx],
            "top": data.get("top", [None])[idx],
            "width": data.get("width", [None])[idx],
            "height": data.get("height", [None])[idx],
        })
    metadata = {
        "engine": "pytesseract",
        "sourceType": ext.lstrip(".") or source.mime_type,
        "blocks": len(blocks),
        "options": options or {},
    }
    return [
        _markdown_artifact(base, text.strip() or "[OCR produced no text]"),
        _metadata_artifact(base, metadata),
        ConvertedArtifact(
            name=f"{base}.blocks.json",
            mime_type="application/json",
            data=json.dumps(blocks, ensure_ascii=False, indent=2).encode("utf-8"),
        ),
    ]


def convert_image_vision(source: SourceFile, task: ConversionTask, settings: ConverterSettings, options: dict[str, object] | None) -> list[ConvertedArtifact]:
    ext = Path(source.filename).suffix.lower()
    if ext not in IMAGE_EXTENSIONS and not source.mime_type.startswith("image/"):
        raise ConverterError("unsupported_format", f"{ext or source.mime_type} is not supported for {task}", 400)
    if not settings.vision_api_key:
        raise ConverterError(
            "conversion_failed",
            "RIDGE_CONVERTER_VISION_API_KEY or OPENAI_API_KEY is required for vision image conversion",
            502,
        )
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ConverterError("conversion_failed", "openai package is required for vision image conversion", 502) from exc

    base = _base_name(source.filename)
    client = OpenAI(api_key=settings.vision_api_key, base_url=settings.vision_base_url)
    data_url = f"{source.mime_type};base64,{base64.b64encode(source.data).decode('ascii')}"
    model = _option_text(options, "model") or settings.vision_model
    language = _option_text(options, "language") or "auto"
    if task == "image.ocr":
        prompt = _option_text(options, "prompt") or _option_text(options, "llmPrompt") or (
            "Transcribe all visible text in this image into Markdown. Preserve line breaks, lists, and tables "
            "as accurately as possible. Return only the transcribed Markdown. If there is no visible text, "
            "return [No text detected]."
        )
        if language != "auto":
            prompt += f" The expected text language is {language}."
        engine_name = "vision-ocr"
    else:
        prompt = _option_text(options, "prompt") or _option_text(options, "llmPrompt") or (
            "Describe this image for retrieval as concise Markdown. Include visible text only when it is relevant."
        )
        engine_name = "vision-description"
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:{data_url}"}},
                    ],
                }
            ],
            temperature=0,
        )
    except Exception as exc:
        raise ConverterError("conversion_failed", f"vision image conversion failed: {exc}", 502) from exc
    try:
        markdown = response.choices[0].message.content
    except (AttributeError, IndexError, TypeError) as exc:
        raise ConverterError("conversion_failed", "vision image conversion returned an unexpected response", 502) from exc
    if not isinstance(markdown, str) or not markdown.strip():
        raise ConverterError("conversion_failed", "vision image conversion returned empty Markdown", 502)
    metadata = {
        "engine": engine_name,
        "model": model,
        "baseUrl": settings.vision_base_url,
        "sourceType": Path(source.filename).suffix.lower().lstrip(".") or source.mime_type,
        "options": options or {},
    }
    return [_markdown_artifact(base, markdown.strip()), _metadata_artifact(base, metadata)]


def convert_audio(source: SourceFile, settings: ConverterSettings, options: dict[str, object] | None) -> list[ConvertedArtifact]:
    ext = Path(source.filename).suffix.lower()
    if ext not in AUDIO_EXTENSIONS and not source.mime_type.startswith("audio/"):
        raise ConverterError("unsupported_format", f"{ext or source.mime_type} is not supported for audio transcription", 400)
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise ConverterError("conversion_failed", "Install ridge-converter[audio] for audio.transcription", 502) from exc

    base = _base_name(source.filename)
    with tempfile.NamedTemporaryFile(suffix=ext or ".wav") as tmp:
        tmp.write(source.data)
        tmp.flush()
        try:
            model = WhisperModel(str((options or {}).get("modelSize", settings.whisper_model_size)), device="cpu", compute_type="int8")
            language_option = (options or {}).get("language")
            language = None if language_option in (None, "auto") else str(language_option)
            segments, info = model.transcribe(tmp.name, language=language)
            segment_rows = [
                {"start": segment.start, "end": segment.end, "text": segment.text}
                for segment in segments
            ]
        except Exception as exc:
            raise ConverterError("conversion_failed", f"audio transcription failed: {exc}", 502) from exc
    markdown = "\n\n".join(row["text"].strip() for row in segment_rows if row["text"].strip())
    metadata = {
        "engine": "faster-whisper",
        "model": settings.whisper_model_size,
        "language": getattr(info, "language", None),
        "duration": getattr(info, "duration", None),
        "segments": len(segment_rows),
        "options": options or {},
    }
    return [
        _markdown_artifact(base, markdown or "[Transcription produced no text]"),
        _metadata_artifact(base, metadata),
        ConvertedArtifact(
            name=f"{base}.segments.json",
            mime_type="application/json",
            data=json.dumps(segment_rows, ensure_ascii=False, indent=2).encode("utf-8"),
        ),
    ]


def convert_audio_groq(source: SourceFile, settings: ConverterSettings, options: dict[str, object] | None) -> list[ConvertedArtifact]:
    ext = Path(source.filename).suffix.lower()
    if ext not in AUDIO_EXTENSIONS and not source.mime_type.startswith(("audio/", "video/")):
        raise ConverterError("unsupported_format", f"{ext or source.mime_type} is not supported for audio transcription", 400)
    if not settings.groq_api_key:
        raise ConverterError("conversion_failed", "GROQ_API_KEY is required for audio.transcription", 502)

    base = _base_name(source.filename)
    model = _option_text(options, "model") or settings.groq_audio_model
    data: dict[str, str] = {
        "model": model,
        "response_format": "verbose_json",
    }
    language = _option_text(options, "language")
    if language and language != "auto":
        data["language"] = language
    prompt = _option_text(options, "prompt")
    if prompt:
        data["prompt"] = prompt
    if "temperature" in (options or {}):
        data["temperature"] = str((options or {})["temperature"])

    url = f"{settings.groq_base_url.rstrip('/')}/audio/transcriptions"
    started = time.monotonic()
    try:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                url,
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                data=data,
                files={"file": (source.filename, source.data, _guess_mime_type(source.filename, source.mime_type))},
            )
    except httpx.HTTPError as exc:
        raise ConverterError("conversion_failed", f"groq transcription failed: {exc}", 502) from exc
    if response.status_code >= 400:
        message = response.text
        try:
            parsed_error = response.json()
            if isinstance(parsed_error, dict):
                error_value = parsed_error.get("error")
                if isinstance(error_value, dict) and isinstance(error_value.get("message"), str):
                    message = error_value["message"]
        except ValueError:
            pass
        raise ConverterError("conversion_failed", f"groq transcription failed: HTTP {response.status_code}: {message}", 502)
    try:
        payload = response.json()
    except ValueError as exc:
        raise ConverterError("conversion_failed", "groq transcription returned invalid JSON", 502) from exc
    if not isinstance(payload, dict):
        raise ConverterError("conversion_failed", "groq transcription returned an unexpected response", 502)

    text = str(payload.get("text") or "").strip()
    segments = payload.get("segments")
    markdown = _markdown_from_segments(text, segments)
    metadata = {
        "engine": "groq",
        "model": model,
        "baseUrl": settings.groq_base_url,
        "language": payload.get("language"),
        "duration": payload.get("duration"),
        "segments": len(segments) if isinstance(segments, list) else 0,
        "options": options or {},
        "durationSeconds": round(time.monotonic() - started, 4),
    }
    artifacts = [_markdown_artifact(base, markdown), _metadata_artifact(base, metadata)]
    if isinstance(segments, list):
        artifacts.append(
            ConvertedArtifact(
                name=f"{base}.segments.json",
                mime_type="application/json",
                data=json.dumps(segments, ensure_ascii=False, indent=2).encode("utf-8"),
            )
        )
    return artifacts


def convert_source(source: SourceFile, task: ConversionTask, settings: ConverterSettings, options: dict[str, object] | None) -> list[ConvertedArtifact]:
    default_engine = {
        "image.ocr": "vision",
        "image.description": "vision",
        "audio.transcription": "groq",
    }.get(task, "markitdown")
    engine = str((options or {}).get("engine") or default_engine)
    if task == "image.ocr" and engine == "tesseract":
        return convert_image_ocr(source, options)
    if task in {"image.ocr", "image.description"} and engine in {"vision", "openai", "openai-vision"}:
        return convert_image_vision(source, task, settings, options)
    if task == "audio.transcription" and engine == "faster-whisper":
        return convert_audio(source, settings, options)
    if task == "audio.transcription" and engine == "groq":
        return convert_audio_groq(source, settings, options)
    if task == "document.ocr_markdown" and (
        Path(source.filename).suffix.lower() in IMAGE_EXTENSIONS or source.mime_type.startswith("image/")
    ):
        return convert_markitdown_resource(source, task, settings, options)
    if task in {"document.markdown", "document.ocr_markdown"}:
        return convert_document(source, task, settings, options)
    if task in {"image.ocr", "image.description", "audio.transcription"} and engine == "markitdown":
        return convert_markitdown_resource(source, task, settings, options)
    raise ConverterError("unsupported_format", f"Unsupported conversion task: {task}", 400)
