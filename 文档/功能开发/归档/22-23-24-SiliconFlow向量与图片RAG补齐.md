# 22/23/24 SiliconFlow 向量与图片 RAG 补齐

## 目标

将 RAG embedding 从本地 token-hash 向量切换为 SiliconFlow `Qwen/Qwen3-VL-Embedding-8B`，并让文本与图片都能作为 RAG 源进入统一检索链路。

## 实现

- 新增 `siliconflow-embedding-client.ts`，封装 `/v1/embeddings` 请求、Bearer 鉴权、超时、重试、配置加载和错误类型。
- `rag-indexer.ts` 支持注入 `RagEmbeddingProvider`；生产默认加载 SiliconFlow，测试环境使用确定性本地 provider，避免 CI 触网。
- Markdown/空间 HTML 继续按文本 chunk 入库；图片原文件按单个视觉 chunk 入库，embedding input 使用 base64 data URL。
- `search_chunks.embedding_id` 记录 `siliconflow:<model>:<dimension>:<hash>`，搜索时只把 `siliconflow:` 与测试 provider 向量用于相似度，历史 `local-hash-embedding` 只保留精确文本命中能力。
- 上传 API 对标准 RAG 源（Markdown、空间 HTML、图片）落盘后立即标记 pending 并尝试索引；图片即使转换服务关闭也能直接进入 RAG。

## 配置

优先读取 `app_settings`，其次读取环境变量：

- `siliconflow_embedding_api_key` / `SILICONFLOW_EMBEDDING_API_KEY` / `SILICONFLOW_API_KEY`
- `siliconflow_embedding_base_url` / `SILICONFLOW_EMBEDDING_BASE_URL` / `SILICONFLOW_BASE_URL`
- `siliconflow_embedding_model` / `SILICONFLOW_EMBEDDING_MODEL`
- `siliconflow_embedding_dimensions` / `SILICONFLOW_EMBEDDING_DIMENSIONS`
- `siliconflow_embedding_timeout_ms` / `SILICONFLOW_EMBEDDING_TIMEOUT_MS`
- `siliconflow_embedding_max_retries` / `SILICONFLOW_EMBEDDING_MAX_RETRIES`

## 验收

- SiliconFlow 客户端覆盖文本、图片、重试和配置缺失。
- RAG indexer 覆盖文本使用 provider 入库、图片视觉 embedding 入库与文本查询召回图片。
- 上传 API 覆盖转换服务关闭时图片仍直接入 RAG。
