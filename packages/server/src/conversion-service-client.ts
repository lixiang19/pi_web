import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// === 类型定义（严格按契约 40-Python通用转化服务API契约.md 第10节）===

export type ConversionTask =
  | "document.markdown"
  | "audio.transcription"
  | "image.ocr"
  | "image.description"
  | "document.ocr_markdown";

export interface ConversionInput {
  url?: string;
  base64?: string;
  mimeType?: string;
}

export interface DocumentMarkdownOptions {
  engine?: "markitdown" | "pandoc" | "docling";
  extractImages?: boolean;
  extractTables?: boolean;
  pageRange?: [number, number];
  ocrFallback?: boolean;
}

export interface AudioTranscriptionOptions {
  language?: string;
  modelSize?: "tiny" | "base" | "small" | "medium" | "large";
  segmentDuration?: number;
  diarization?: boolean;
  format?: "srt" | "vtt" | "json" | "txt" | "markdown";
}

export interface ImageOcrOptions {
  language?: string;
  outputBlocks?: boolean;
  confidenceThreshold?: number;
}

export interface ConversionOptions
  extends Partial<DocumentMarkdownOptions>,
    Partial<AudioTranscriptionOptions>,
    Partial<ImageOcrOptions> {}

export interface CreateConversionRequest {
  task: ConversionTask;
  input?: ConversionInput;
  options?: ConversionOptions;
  clientJobId?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  preferredFormat?: "markdown" | "json" | "text" | "html";
  waitMs?: number;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface Artifact {
  artifactId: string;
  name: string;
  mimeType: string;
  size: number;
  inline: boolean;
  content?: string;
  downloadUrl?: string;
}

export interface UsageInfo {
  inputTokens?: number | null;
  outputTokens?: number | null;
  model?: string | null;
  credits?: number;
  durationSeconds?: number;
}

export interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ConversionJob {
  jobId: string;
  status: JobStatus;
  task: ConversionTask;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  clientJobId?: string;
  metadata?: Record<string, unknown>;
  result?: Record<string, unknown>;
  artifacts?: Artifact[];
  usage?: UsageInfo;
  warnings?: string[];
  error?: ErrorDetail | null;
}

export type ConversionCallbackPayload = ConversionJob;

export interface CapabilityTask {
  task: ConversionTask;
  supportedInputFormats: string[];
  supportedOutputFormats: string[];
  optionsSchema: Record<string, unknown>;
}

export interface CapabilitiesResponse {
  version: string;
  tasks: CapabilityTask[];
  maxFileSizeBytes: number;
  maxInlineSizeBytes: number;
  defaultRetentionDays: number;
}

// === 客户端配置 ===

export interface ConversionServiceClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface ConversionServiceConfig {
  baseUrl: string;
  apiKey: string;
  callbackToken: string;
  callbackBaseUrl?: string;
}

export interface DownloadedArtifact {
  artifact: Artifact;
  buffer: Buffer;
}

export interface DownloadArtifactsOptions {
  maxSizeBytes?: number;
  timeoutMs?: number;
}

// === 错误映射 ===

export class ConversionServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ConversionServiceError";
  }
}

export function mapErrorToRidgeAction(error: ConversionServiceError): {
  shouldRetry: boolean;
  retryCount?: number;
  userMessage: string;
} {
  switch (error.code) {
    case "unsupported_format":
      return { shouldRetry: false, userMessage: `不支持的文件格式：${error.message}` };
    case "invalid_input":
      return { shouldRetry: false, userMessage: `输入参数错误：${error.message}` };
    case "file_too_large":
      return { shouldRetry: false, userMessage: `文件过大：${error.message}` };
    case "conversion_timeout":
      return { shouldRetry: true, retryCount: 1, userMessage: `转换超时，正在重试：${error.message}` };
    case "conversion_failed":
      return { shouldRetry: false, userMessage: `转换失败：${error.message}` };
    case "auth_failed":
      return { shouldRetry: false, userMessage: `Python 转化服务认证失败，请联系管理员` };
    case "rate_limited":
      return { shouldRetry: true, retryCount: 3, userMessage: `服务限流，稍后重试：${error.message}` };
    case "fetch_failed":
      return { shouldRetry: true, retryCount: 3, userMessage: `获取源文件失败，稍后重试：${error.message}` };
    case "not_found":
      return { shouldRetry: false, userMessage: `任务不存在或已过期：${error.message}` };
    case "already_canceled":
      return { shouldRetry: false, userMessage: `任务已取消：${error.message}` };
    case "quota_exceeded":
      return { shouldRetry: false, userMessage: `服务配额耗尽：${error.message}` };
    default:
      return { shouldRetry: false, userMessage: `未知错误：${error.message}` };
  }
}

// === HTTP 客户端 ===

export class ConversionServiceClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConversionServiceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: BodyInit,
    headers?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...headers,
      },
      body,
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = { error: { code: "unknown", message: await response.text() } };
      }
      const detail = (errorBody as { error?: ErrorDetail }).error ?? {
        code: "unknown",
        message: `HTTP ${response.status}`,
      };
      throw new ConversionServiceError(
        detail.message,
        detail.code,
        response.status,
        detail.details,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async health(): Promise<{ status: string; version?: string; tasks?: string[] }> {
    return this.request("GET", "/health");
  }

  async capabilities(): Promise<CapabilitiesResponse> {
    return this.request("GET", "/capabilities");
  }

  async createConversionWithFile(
    filePath: string,
    request: Omit<CreateConversionRequest, "input">,
  ): Promise<ConversionJob> {
    const buffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);

    const form = new FormData();
    form.append("task", request.task);
    form.append("file", new Blob([buffer]), fileName);

    if (request.options) {
      form.append("options", JSON.stringify(request.options));
    }
    if (request.clientJobId) {
      form.append("clientJobId", request.clientJobId);
    }
    if (request.callbackUrl) {
      form.append("callbackUrl", request.callbackUrl);
    }
    if (request.metadata) {
      form.append("metadata", JSON.stringify(request.metadata));
    }
    if (request.preferredFormat) {
      form.append("preferredFormat", request.preferredFormat);
    }
    if (request.waitMs !== undefined) {
      form.append("waitMs", String(request.waitMs));
    }

    return this.request("POST", "/conversions", form);
  }

  async createConversion(request: CreateConversionRequest): Promise<ConversionJob> {
    return this.request("POST", "/conversions", JSON.stringify(request), {
      "Content-Type": "application/json",
    });
  }

  async getConversion(jobId: string): Promise<ConversionJob> {
    return this.request("GET", `/conversions/${encodeURIComponent(jobId)}`);
  }

  async cancelConversion(jobId: string): Promise<void> {
    return this.request("POST", `/conversions/${encodeURIComponent(jobId)}/cancel`);
  }

  async downloadArtifact(jobId: string, artifactId: string, opts: DownloadArtifactsOptions = {}): Promise<Buffer> {
    const url = `${this.baseUrl}/conversions/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { error: { code: "unknown", message: await response.text() } };
        }
        const detail = (errorBody as { error?: ErrorDetail }).error ?? {
          code: "unknown",
          message: `HTTP ${response.status}`,
        };
        throw new ConversionServiceError(
          detail.message,
          detail.code,
          response.status,
          detail.details,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);
      if (opts.maxSizeBytes && buf.length > opts.maxSizeBytes) {
        throw new ConversionServiceError(
          `Artifact exceeds max size ${opts.maxSizeBytes}`,
          "file_too_large",
          413,
        );
      }
      return buf;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  async listArtifacts(jobId: string): Promise<Artifact[]> {
    return this.request("GET", `/conversions/${encodeURIComponent(jobId)}/artifacts`);
  }

  /**
   * 下载 job 的所有 artifacts。
   * 支持 inline（按 MIME 类型区分 base64/UTF-8）、downloadUrl（相对/绝对）、artifactId fallback。
   * 支持超时和大小限制。
   */
  async downloadArtifacts(
    job: ConversionJob,
    opts: DownloadArtifactsOptions = {},
  ): Promise<DownloadedArtifact[]> {
    if (!job.artifacts) return [];

    const results: DownloadedArtifact[] = [];
    for (const artifact of job.artifacts) {
      const buffer = await this.downloadSingleArtifact(artifact, job.jobId, opts);
      results.push({ artifact, buffer });
    }
    return results;
  }

  /**
   * 下载单个 artifact。
   * inline：按 MIME 类型判断是 base64 二进制还是 UTF-8 文本。
   * downloadUrl：支持相对路径（拼接 baseUrl）和绝对路径。
   * fallback：通过 artifactId 下载。
   */
  private async downloadSingleArtifact(
    artifact: Artifact,
    jobId: string,
    opts: DownloadArtifactsOptions,
  ): Promise<Buffer> {
    if (artifact.inline) {
      return parseInlineArtifact(artifact);
    }

    // 非 inline：通过 downloadUrl 或 artifactId 下载
    if (artifact.downloadUrl) {
      const url = artifact.downloadUrl.startsWith("http")
        ? artifact.downloadUrl
        : new URL(artifact.downloadUrl, this.baseUrl).toString();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          throw new Error(`Download failed: HTTP ${response.status} for ${artifact.name}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buf = Buffer.from(arrayBuffer);
        if (opts.maxSizeBytes && buf.length > opts.maxSizeBytes) {
          throw new Error(`Artifact ${artifact.name} exceeds max size ${opts.maxSizeBytes}`);
        }
        return buf;
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }

    // fallback：通过 artifactId 下载，同样传递 opts 保持约束一致
    return this.downloadArtifact(jobId, artifact.artifactId, opts);
  }
}

// === inline artifact 解析（按 MIME 类型区分） ===

const TEXT_MIME_TYPES = new Set([
  "text/markdown",
  "text/plain",
  "text/html",
  "application/json",
  "text/vtt",
  "text/srt",
]);

const BINARY_MIME_PATTERNS = [
  /^image\//,
  /^audio\//,
  /^video\//,
  /^application\/octet-stream$/,
  /^application\/pdf$/,
];

function isTextMimeType(mimeType: string): boolean {
  if (TEXT_MIME_TYPES.has(mimeType)) return true;
  // 额外启发式：如果 MIME type 明确是二进制，则不是文本
  if (BINARY_MIME_PATTERNS.some((p) => p.test(mimeType))) return false;
  // 默认：未知 MIME type 按文本处理（安全降级）
  return true;
}

/**
 * 解析 inline artifact 的 content。
 * 文本类型（text/*, application/json）直接按 UTF-8。
 * 二进制类型（image/*, audio/* 等）按 base64 解码。
 */
export function parseInlineArtifact(artifact: Artifact): Buffer {
  const content = artifact.content ?? "";
  if (content.length === 0) {
    return Buffer.alloc(0);
  }

  if (isTextMimeType(artifact.mimeType)) {
    return Buffer.from(content, "utf-8");
  }

  // 二进制类型：尝试 base64 解码
  try {
    return Buffer.from(content, "base64");
  } catch {
    // base64 解码失败时降级为 UTF-8（避免数据丢失）
    return Buffer.from(content, "utf-8");
  }
}

// === 配置加载 ===

export async function loadConversionServiceConfig(
  getSetting: (key: string) => Promise<string | null>,
): Promise<ConversionServiceConfig | null> {
  const baseUrl = await getSetting("python_converter_base_url");
  const apiKey = await getSetting("python_converter_api_key");
  const callbackToken = await getSetting("python_converter_callback_token");
  const callbackBaseUrl = await getSetting("python_converter_callback_base_url");

  if (!baseUrl || !apiKey) {
    return null;
  }

  return {
    baseUrl,
    apiKey,
    callbackToken: callbackToken ?? "",
    callbackBaseUrl: callbackBaseUrl ?? undefined,
  };
}

export async function saveConversionServiceConfig(
  setSetting: (key: string, value: string) => Promise<void>,
  config: ConversionServiceConfig,
): Promise<void> {
  await setSetting("python_converter_base_url", config.baseUrl);
  await setSetting("python_converter_api_key", config.apiKey);
  await setSetting("python_converter_callback_token", config.callbackToken);
  if (config.callbackBaseUrl) {
    await setSetting("python_converter_callback_base_url", config.callbackBaseUrl);
  }
}

// === DB 层配置读写（不依赖 Settings 类型） ===

import { getRidgeDb } from "./db/index.js";

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getRidgeDb();
  const row = db
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get(key) as { value_json: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value_json);
    if (typeof parsed === "string") return parsed;
    return String(parsed);
  } catch {
    return null;
  }
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getRidgeDb();
  db.prepare(
    `INSERT INTO app_settings(key, value_json, updated_at)
     VALUES(?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), Date.now());
}

export async function loadConversionServiceConfigFromDb(): Promise<ConversionServiceConfig | null> {
  return loadConversionServiceConfig(getAppSetting);
}

export async function saveConversionServiceConfigToDb(config: ConversionServiceConfig): Promise<void> {
  return saveConversionServiceConfig(setAppSetting, config);
}

// === 路径工具 ===

export function deriveConversionOutputPaths(sourcePath: string, outputDir?: string) {
  const dir = outputDir ?? path.dirname(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();
  const base = path.basename(sourcePath, ext);
  return {
    md: path.join(dir, `${base}.md`),
    assets: path.join(dir, `${base}.assets`),
    metadata: path.join(dir, `${base}.metadata.json`),
    originalsDir: path.join(dir, ".originals"),
    originalName: path.basename(sourcePath),
    baseName: base,
  };
}

export function deriveTaskFromExtension(ext: string): ConversionTask | null {
  const map: Record<string, ConversionTask> = {
    ".pdf": "document.markdown",
    ".docx": "document.markdown",
    ".pptx": "document.markdown",
    ".xlsx": "document.markdown",
    ".html": "document.markdown",
    ".htm": "document.markdown",
    ".txt": "document.markdown",
    ".mp3": "audio.transcription",
    ".wav": "audio.transcription",
    ".m4a": "audio.transcription",
    ".flac": "audio.transcription",
    ".ogg": "audio.transcription",
    ".png": "image.ocr",
    ".jpg": "image.ocr",
    ".jpeg": "image.ocr",
    ".webp": "image.ocr",
    ".tiff": "image.ocr",
    ".tif": "image.ocr",
  };
  return map[ext.toLowerCase()] ?? null;
}

export function generateClientJobId(filePath: string): string {
  const timestamp = Date.now();
  const safePath = filePath.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `ridge-${safePath}-${timestamp}`;
}

/** 校验 artifact name 是否安全（禁止 path traversal） */
export function isSafeArtifactName(name: string): boolean {
  if (!name || name.length === 0) return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
  return true;
}

/** 将 Python 产物写入 workspace。
 * 原子性保证：先写入临时目录，验证通过后再归档原文件并移动到最终位置。
 * 支持 already-archived 场景：如果 sourcePath（logical）不存在但 .originals/ 中存在，
 * 则跳过归档步骤，直接移动产物。
 * 如果中途失败， rollback 恢复旧产物和原文件。
 */
export async function writeArtifactsToWorkspace(
  sourcePath: string,
  workspaceDir: string,
  downloaded: DownloadedArtifact[],
): Promise<{
  mdPath: string;
  assetsDir: string;
  metadataPath: string;
  archivedTo: string | null;
}> {
  const outputs = deriveConversionOutputPaths(sourcePath);

  // 校验所有产物路径在 workspace 内（包括 realpath 解 symlink）
  const ensureWithinWorkspace = async (target: string) => {
    let realResolved: string;
    let realWorkspaceDir: string;

    try {
      realWorkspaceDir = await fs.realpath(workspaceDir);
    } catch {
      realWorkspaceDir = workspaceDir;
    }

    const resolved = path.resolve(workspaceDir, target);
    try {
      realResolved = await fs.realpath(resolved);
    } catch {
      // 文件可能不存在，逐级解析已存在父目录
      let current = resolved;
      realResolved = resolved;
      while (current !== path.dirname(current)) {
        current = path.dirname(current);
        try {
          const realParent = await fs.realpath(current);
          const suffix = path.relative(current, resolved);
          realResolved = path.join(realParent, suffix);
          break;
        } catch {
          // 继续向上
        }
      }
    }

    const rel = path.relative(realWorkspaceDir, realResolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`Artifact path outside workspace: ${target} (real: ${realResolved})`);
    }
  };

  await ensureWithinWorkspace(outputs.md);
  await ensureWithinWorkspace(outputs.assets);
  await ensureWithinWorkspace(outputs.metadata);
  await ensureWithinWorkspace(outputs.originalsDir);

  // 校验 artifact name 安全
  for (const { artifact } of downloaded) {
    if (!isSafeArtifactName(artifact.name)) {
      throw new Error(`Unsafe artifact name: ${artifact.name}`);
    }
  }

  // 检查必需产物存在
  const hasMd = downloaded.some((d) => d.artifact.name.endsWith(".md"));
  const hasMeta = downloaded.some((d) => d.artifact.name.endsWith(".metadata.json"));
  if (!hasMd) throw new Error("Missing required artifact: .md");
  if (!hasMeta) throw new Error("Missing required artifact: .metadata.json");

  // 判断新产物是否包含 assets（非 md / metadata.json）
  const hasNewAssets = downloaded.some(
    (d) => !d.artifact.name.endsWith(".md") && !d.artifact.name.endsWith(".metadata.json"),
  );

  let mdBuffer: Buffer | null = null;
  let metadataBuffer: Buffer | null = null;

  // 第一遍：收集必需产物
  for (const { artifact, buffer } of downloaded) {
    if (artifact.name.endsWith(".md")) {
      mdBuffer = buffer;
    } else if (artifact.name.endsWith(".metadata.json")) {
      metadataBuffer = buffer;
    }
  }

  // === Stage 1: 备份旧产物（如果存在） ===
  const stagingDir = path.join(path.dirname(outputs.md), `.ridge-staging-${outputs.baseName}-${Date.now()}`);
  await fs.mkdir(stagingDir, { recursive: true });

  const oldMdExists = await fs.stat(outputs.md).then((s) => s.isFile(), () => false);
  const oldMetaExists = await fs.stat(outputs.metadata).then((s) => s.isFile(), () => false);
  const oldAssetsExists = await fs.stat(outputs.assets).then((s) => s.isDirectory(), () => false);

  // 跟踪实际被成功备份的文件，用于精确 rollback
  const backedUp = { md: false, meta: false, assets: false };
  const stage1Errors: Error[] = [];

  try {
    if (oldMdExists) {
      await fs.rename(outputs.md, path.join(stagingDir, `${outputs.baseName}.md.old`));
      backedUp.md = true;
    }
    if (oldMetaExists) {
      await fs.rename(outputs.metadata, path.join(stagingDir, `${outputs.baseName}.metadata.json.old`));
      backedUp.meta = true;
    }
    if (oldAssetsExists) {
      await fs.rename(outputs.assets, path.join(stagingDir, `${outputs.baseName}.assets.old`));
      backedUp.assets = true;
    }
  } catch (err) {
    // Stage 1 任何 rename 失败立即回滚已经成功的备份
    // 必须全部恢复成功才算成功；任一恢复失败都要记录并抛出
    if (backedUp.md) {
      try { await fs.rename(path.join(stagingDir, `${outputs.baseName}.md.old`), outputs.md); } catch (e) { stage1Errors.push(e as Error); }
    }
    if (backedUp.meta) {
      try { await fs.rename(path.join(stagingDir, `${outputs.baseName}.metadata.json.old`), outputs.metadata); } catch (e) { stage1Errors.push(e as Error); }
    }
    if (backedUp.assets) {
      try { await fs.rename(path.join(stagingDir, `${outputs.baseName}.assets.old`), outputs.assets); } catch (e) { stage1Errors.push(e as Error); }
    }
    try { await fs.rm(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ }
    if (stage1Errors.length > 0) {
      throw new Error(
        `Stage 1 backup failed and partial restore encountered ${stage1Errors.length} error(s): ` +
        stage1Errors.map((e) => e.message).join("; ") +
        `; original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    throw err;
  }

  // === Stage 2: 写入新产物到临时目录 ===
  const tmpDir = path.join(path.dirname(outputs.md), `.tmp-${outputs.baseName}-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const tmpMd = path.join(tmpDir, `${outputs.baseName}.md`);
  const tmpMeta = path.join(tmpDir, `${outputs.baseName}.metadata.json`);
  const tmpAssets = path.join(tmpDir, `${outputs.baseName}.assets`);

  // 事务性状态，用于 rollback 判断
  let archivedTo: string | null = null;

  try {
    await fs.writeFile(tmpMd, mdBuffer!, "utf-8");

    // metadata：保留 Python 侧全部字段，只追加 _ridge
    const meta = JSON.parse(metadataBuffer!.toString("utf-8")) as Record<string, unknown>;
    const archivedAt = new Date().toISOString();
    const mdHash = crypto.createHash("sha256").update(mdBuffer!).digest("hex");
    meta._ridge = {
      sourcePath: sourcePath,
      workspacePath: outputs.md,
      archivedAt,
      archivedTo: path.join(outputs.originalsDir, outputs.originalName),
      mdHash,
    };
    await fs.writeFile(tmpMeta, JSON.stringify(meta, null, 2), "utf-8");

    // 图片等资源写入 tmp assets（仅当新产物实际包含 assets 时）
    if (hasNewAssets) {
      await fs.mkdir(tmpAssets, { recursive: true });
      for (const { artifact, buffer } of downloaded) {
        if (artifact.name.endsWith(".md") || artifact.name.endsWith(".metadata.json")) {
          continue;
        }
        const assetPath = path.join(tmpAssets, artifact.name);
        await ensureWithinWorkspace(assetPath);
        await fs.writeFile(assetPath, buffer);
      }
    }

    // === Stage 3: 原子提交 ===
    // 3a. 检查 sourcePath 是否存在。如果不存在，尝试 .originals/ fallback
    let actualSourcePath = sourcePath;
    let sourceExists = false;
    try {
      const st = await fs.stat(sourcePath);
      sourceExists = st.isFile();
    } catch {
      // sourcePath (logical) 不存在，可能是已归档
      const originalsFallback = path.join(outputs.originalsDir, outputs.originalName);
      try {
        const st = await fs.stat(originalsFallback);
        if (st.isFile()) {
          actualSourcePath = originalsFallback;
          sourceExists = true; // .originals/ 中存在，无需再次归档
        }
      } catch {
        // 两边都不存在
      }
    }

    if (!sourceExists) {
      throw new Error(`Source file not found at ${sourcePath} or in .originals/`);
    }

    // 3b. 归档原文件（仅在 sourceExists 且不是 already archived 时）
    if (actualSourcePath === sourcePath) {
      await fs.mkdir(outputs.originalsDir, { recursive: true });
      archivedTo = path.join(outputs.originalsDir, outputs.originalName);

      // 如果归档目标已存在，先删除
      try {
        await fs.rm(archivedTo, { force: true });
      } catch {
        // ignore
      }
      await fs.rename(sourcePath, archivedTo);
    }

    // 3c. 从 tmp 移动到最终位置
    await fs.rename(tmpMd, outputs.md);
    await fs.rename(tmpMeta, outputs.metadata);

    // assets 契约：
    // - 新产物有 assets → 替换旧 assets（旧已备份到 staging）
    // - 新产物无 assets → 清理旧 assets（不创建空目录），防止残留/并发冲突
    if (hasNewAssets) {
      // 旧 assets 如果不存在，先清理可能的残留目录（防止并发/残留导致 ENOTEMPTY）
      if (!oldAssetsExists) {
        try { await fs.rm(outputs.assets, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      await fs.rename(tmpAssets, outputs.assets);
    } else {
      // 新无 assets：清理旧 assets 残留（旧已备份到 staging，不恢复），不创建空目录
      try { await fs.rm(outputs.assets, { recursive: true, force: true }); } catch { /* ignore */ }
      // 清理未使用的空 tmpAssets
      try { await fs.rm(tmpAssets, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    await fs.rm(tmpDir, { recursive: true, force: true });
    // 清理 staging 目录（成功提交后不再需要）
    await fs.rm(stagingDir, { recursive: true, force: true });
  } catch (err) {
    // === Rollback：任何步骤失败都恢复旧产物和原文件 ===
    // 顺序至关重要：先移除新产物（释放名称），再恢复旧产物，再恢复源文件
    const rollbackErrors: Error[] = [];

    // 1. 移除可能已落位的新产物
    try { await fs.rm(outputs.md, { force: true }); } catch (e) { rollbackErrors.push(e as Error); }
    try { await fs.rm(outputs.metadata, { force: true }); } catch (e) { rollbackErrors.push(e as Error); }
    try { await fs.rm(outputs.assets, { recursive: true, force: true }); } catch (e) { rollbackErrors.push(e as Error); }

    // 2. 恢复旧产物（只恢复真正被成功备份的）
    if (backedUp.md) {
      try { await fs.rename(path.join(stagingDir, `${outputs.baseName}.md.old`), outputs.md); } catch (e) { rollbackErrors.push(e as Error); }
    }
    if (backedUp.meta) {
      try { await fs.rename(path.join(stagingDir, `${outputs.baseName}.metadata.json.old`), outputs.metadata); } catch (e) { rollbackErrors.push(e as Error); }
    }
    if (backedUp.assets) {
      try { await fs.rename(path.join(stagingDir, `${outputs.baseName}.assets.old`), outputs.assets); } catch (e) { rollbackErrors.push(e as Error); }
    }

    // 3. 如果刚才归档了原文件，尝试从 .originals/ 移回
    if (archivedTo) {
      try { await fs.rename(archivedTo, sourcePath); } catch (e) { rollbackErrors.push(e as Error); }
    }

    // 4. 清理临时目录
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { await fs.rm(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ }

    if (rollbackErrors.length > 0) {
      throw new Error(
        `Rollback failed with ${rollbackErrors.length} error(s) after ` +
        `original error: ${err instanceof Error ? err.message : String(err)}; ` +
        `rollback details: ${rollbackErrors.map((e) => e.message).join("; ")}`,
      );
    }

    throw err;
  }

  return {
    mdPath: outputs.md,
    assetsDir: outputs.assets,
    metadataPath: outputs.metadata,
    archivedTo,
  };
}

export function isConvertibleExtension(ext: string): boolean {
  const convertible = new Set([
    ".pdf", ".docx", ".pptx", ".xlsx", ".html", ".htm", ".txt",
    ".mp3", ".wav", ".m4a", ".flac", ".ogg",
    ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".tif",
  ]);
  return convertible.has(ext.toLowerCase());
}
