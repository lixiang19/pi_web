from __future__ import annotations

import json
import mimetypes
import tempfile
import time
from pathlib import Path

from .config import ConverterSettings
from .errors import ConverterError
from .models import ConversionTask, ConvertedArtifact, SourceFile


TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json", ".log"}
DOCUMENT_EXTENSIONS = TEXT_EXTENSIONS | {".html", ".htm", ".pdf", ".docx", ".pptx", ".xlsx", ".xls"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".tif", ".bmp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"}


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


def convert_image_description(source: SourceFile, settings: ConverterSettings, options: dict[str, object] | None) -> list[ConvertedArtifact]:
    if not settings.openai_api_key:
        raise ConverterError("conversion_failed", "OPENAI_API_KEY is required for image.description", 502)
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ConverterError("conversion_failed", "openai package is required for image.description", 502) from exc

    import base64

    base = _base_name(source.filename)
    client = OpenAI(api_key=settings.openai_api_key)
    data_url = f"{source.mime_type};base64,{base64.b64encode(source.data).decode('ascii')}"
    try:
        response = client.responses.create(
            model=str((options or {}).get("model", settings.openai_vision_model)),
            input=[{
                "role": "user",
                "content": [
                    {"type": "input_text", "text": "Describe this image for retrieval as concise Markdown."},
                    {"type": "input_image", "image_url": f"data:{data_url}"},
                ],
            }],
        )
    except Exception as exc:
        raise ConverterError("conversion_failed", f"image description failed: {exc}", 502) from exc
    markdown = response.output_text
    metadata = {
        "engine": "openai-responses",
        "model": str((options or {}).get("model", settings.openai_vision_model)),
        "sourceType": Path(source.filename).suffix.lower().lstrip(".") or source.mime_type,
        "options": options or {},
    }
    return [_markdown_artifact(base, markdown), _metadata_artifact(base, metadata)]


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


def convert_source(source: SourceFile, task: ConversionTask, settings: ConverterSettings, options: dict[str, object] | None) -> list[ConvertedArtifact]:
    engine = str((options or {}).get("engine") or "markitdown")
    if task == "image.ocr" and engine == "tesseract":
        return convert_image_ocr(source, options)
    if task == "audio.transcription" and engine == "faster-whisper":
        return convert_audio(source, settings, options)
    if task == "document.ocr_markdown" and (
        Path(source.filename).suffix.lower() in IMAGE_EXTENSIONS or source.mime_type.startswith("image/")
    ):
        return convert_markitdown_resource(source, task, settings, options)
    if task in {"document.markdown", "document.ocr_markdown"}:
        return convert_document(source, task, settings, options)
    if task in {"image.ocr", "image.description", "audio.transcription"}:
        return convert_markitdown_resource(source, task, settings, options)
    raise ConverterError("unsupported_format", f"Unsupported conversion task: {task}", 400)
