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

`dev-key` is only accepted for local loopback development. If the converter binds
to `0.0.0.0` or runs with `NODE_ENV=production` / `RIDGE_ENV=production`, set a
strong explicit key:

```bash
export RIDGE_CONVERTER_API_KEYS="$(openssl rand -hex 32)"
```

ridge Node must store the same value as `python_converter_api_key`.

## Test

```bash
uv run --project services/converter --extra dev pytest
```

## Capabilities

Default engines are explicit by resource family:

- `document.markdown`: text, Markdown, HTML, PDF, DOCX, PPTX, XLSX, CSV, JSON and other MarkItDown-supported document inputs.
- `document.ocr_markdown`: same MarkItDown document path; image inputs also go through MarkItDown image conversion.
- `image.ocr`: OpenAI-compatible vision model OCR. Configure `RIDGE_CONVERTER_VISION_API_KEY`, `RIDGE_CONVERTER_VISION_BASE_URL`, and `RIDGE_CONVERTER_VISION_MODEL`. `OPENAI_API_KEY` is accepted as a compatibility fallback for the vision API key.
- `image.description`: OpenAI-compatible vision model description using the same vision configuration.
- `audio.transcription`: Groq Speech to Text. Configure `GROQ_API_KEY`, `RIDGE_CONVERTER_GROQ_BASE_URL`, and `RIDGE_CONVERTER_GROQ_AUDIO_MODEL`.

Explicit fallback engines are available through `options.engine`:

- `engine: "markitdown"` for MarkItDown image/audio conversion.
- `engine: "tesseract"` for local image OCR through Pillow + pytesseract.
- `engine: "faster-whisper"` for local Whisper transcription when installed with `ridge-converter[audio]`.

The service never accepts local file paths from callers. Inputs must be multipart uploads, HTTPS URLs, or base64 payloads. Workspace safety, status transitions, `.originals/`, and RAG indexing remain ridge Node responsibilities.
