# ridge converter

Independent Python conversion backend for ridge. The source lives in this monorepo, but the service runs as its own process/container and only talks to ridge Node through the `/v1` HTTP contract.

## Run locally

```bash
uv run --project services/converter ridge-converter
```

Configure ridge Node with:

```text
python_converter_base_url = http://127.0.0.1:8765/v1
python_converter_api_key = dev-key
```

## Test

```bash
uv run --project services/converter --extra dev pytest
```

## Capabilities

MarkItDown is the primary conversion engine for all resource families:

- `document.markdown`: text, Markdown, HTML, PDF, DOCX, PPTX, XLSX, CSV, JSON and other MarkItDown-supported document inputs.
- `document.ocr_markdown`: same MarkItDown document path; image inputs also go through MarkItDown image conversion.
- `image.ocr`: image-to-Markdown through MarkItDown image conversion. With `OPENAI_API_KEY`, MarkItDown receives an OpenAI client for image captions; with `exiftool`, it can include image metadata.
- `image.description`: same MarkItDown image path, optimized for caption/description use.
- `audio.transcription`: MarkItDown audio conversion using its `audio-transcription` dependencies from `markitdown[all]`.

Explicit fallback engines are available through `options.engine`:

- `engine: "tesseract"` for local image OCR through Pillow + pytesseract.
- `engine: "faster-whisper"` for local Whisper transcription when installed with `ridge-converter[audio]`.

The service never accepts local file paths from callers. Inputs must be multipart uploads, HTTPS URLs, or base64 payloads. Workspace safety, status transitions, `.originals/`, and RAG indexing remain ridge Node responsibilities.
