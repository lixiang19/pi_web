# 57 独立 Python 转化后端

> 状态：已完成（2026-05-17）

## 目标

把第三方 Python 转化服务内置为 ridge monorepo 内的独立后端，后续 PDF、Word、HTML、图片、音频等资源转化统一走该服务。

## 实现

- 新增 `services/converter/`：
  - `FastAPI` 服务实现 `/v1` Converter 契约；
  - `pyproject.toml`、`uv.lock`、`Dockerfile`、`.env.example`；
  - `ridge-converter` CLI 入口；
  - 契约测试 `tests/test_api_contract.py`。
- 支持输入：
  - multipart 文件上传；
  - HTTPS URL；
  - base64 Data URI。
- 安全边界：
  - API Key Bearer 认证；
  - 禁止本地路径；
  - 禁止非 HTTPS URL；
  - 禁止 localhost/private network URL；
  - 文件大小限制。
- 转化能力：
  - 默认主引擎统一为 MarkItDown；
  - `document.markdown`：文本、Markdown、HTML、PDF、DOCX、PPTX、XLSX、CSV、JSON 等 MarkItDown 支持输入；
  - `document.ocr_markdown`：文档和图片输入都优先走 MarkItDown；
  - `image.ocr` / `image.description`：MarkItDown 图片转换，配置 `OPENAI_API_KEY` 后注入 LLM caption；
  - `audio.transcription`：MarkItDown audio converter；
  - `options.engine="tesseract"` / `"faster-whisper"` 作为显式 fallback。

## 边界

- Converter 不读取 ridge workspace 本地路径。
- Converter 不写 `.originals/`。
- Converter 不更新 `file_processing_status`。
- Converter 不触发 RAG。
- ridge Node 继续负责队列、状态机、workspace 校验、产物落盘和 RAG 入队。

## 验证

```bash
uv run --project services/converter --extra dev pytest
# 8 passed
```
