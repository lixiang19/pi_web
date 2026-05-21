# 66-视觉 OCR 与 Groq 音频转写

## 背景

当前 `services/converter/` 的图片 OCR 与音频转写默认走 MarkItDown。实测后发现图片 OCR 在未配置视觉模型时容易返回空 Markdown，音频转写依赖 MarkItDown 内部的 `speech_recognition` Google 路径，能力边界不够显式。

## 目标

- `image.ocr` 默认改为 OpenAI-compatible 视觉模型 OCR。
- `audio.transcription` 默认改为 Groq Speech to Text。
- 视觉模型配置包含 base URL、API key、model id。
- Groq 音频配置包含 base URL、API key、model id。
- 保留 `tesseract`、`faster-whisper`、`markitdown` 为显式 fallback。

## 验收

- Python API 契约测试覆盖视觉 OCR 默认路径。
- Python API 契约测试覆盖 Groq 音频默认路径与 segments 产物。
- 更新 Python converter README、env 示例与模块梳理文档。
- 修改 TypeScript/Vue/JS 后根目录运行 `npm run check`。
