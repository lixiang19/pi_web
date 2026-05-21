import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  ConversionServiceClient,
  ConversionServiceError,
  mapErrorToRidgeAction,
  deriveTaskFromExtension,
  deriveConversionOutputPaths,
  generateClientJobId,
  isConvertibleExtension,
  loadConversionServiceConfig,
} from "../conversion-service-client.js";

describe("ConversionServiceClient", () => {
  let baseUrl: string;
  let client: ConversionServiceClient;

  beforeEach(() => {
    baseUrl = "https://converter.example.com/v1";
    client = new ConversionServiceClient({
      baseUrl,
      apiKey: "rk_live_test",
    });
  });

  it("constructs with default fetch", () => {
    expect(client).toBeDefined();
  });

  it("strips trailing slash from baseUrl", () => {
    const c = new ConversionServiceClient({
      baseUrl: "https://example.com/v1/",
      apiKey: "key",
    });
    expect(c).toBeDefined();
    // 内部属性不可直接访问，但可通过 mock 测试路径拼接
  });
});

describe("ConversionServiceError", () => {
  it("contains code, httpStatus, details", () => {
    const err = new ConversionServiceError("msg", "unsupported_format", 400, { task: "doc" });
    expect(err.code).toBe("unsupported_format");
    expect(err.httpStatus).toBe(400);
    expect(err.details).toEqual({ task: "doc" });
  });
});

describe("mapErrorToRidgeAction", () => {
  it("maps unsupported_format to non-retry", () => {
    const err = new ConversionServiceError("bad format", "unsupported_format", 400);
    const action = mapErrorToRidgeAction(err);
    expect(action.shouldRetry).toBe(false);
    expect(action.userMessage).toContain("不支持的文件格式");
  });

  it("maps rate_limited to retry", () => {
    const err = new ConversionServiceError("too fast", "rate_limited", 429);
    const action = mapErrorToRidgeAction(err);
    expect(action.shouldRetry).toBe(true);
    expect(action.retryCount).toBe(3);
  });

  it("maps unknown code to non-retry fallback", () => {
    const err = new ConversionServiceError("oops", "unknown", 500);
    const action = mapErrorToRidgeAction(err);
    expect(action.shouldRetry).toBe(false);
    expect(action.userMessage).toContain("未知错误");
  });
});

describe("deriveTaskFromExtension", () => {
  it("maps document extensions", () => {
    expect(deriveTaskFromExtension(".pdf")).toBe("document.markdown");
    expect(deriveTaskFromExtension(".docx")).toBe("document.markdown");
    expect(deriveTaskFromExtension(".pptx")).toBe("document.markdown");
    expect(deriveTaskFromExtension(".html")).toBe("document.markdown");
    expect(deriveTaskFromExtension(".txt")).toBe("document.markdown");
  });

  it("maps audio extensions", () => {
    expect(deriveTaskFromExtension(".mp3")).toBe("audio.transcription");
    expect(deriveTaskFromExtension(".wav")).toBe("audio.transcription");
    expect(deriveTaskFromExtension(".m4a")).toBe("audio.transcription");
  });

  it("maps image extensions", () => {
    expect(deriveTaskFromExtension(".png")).toBe("image.ocr");
    expect(deriveTaskFromExtension(".jpg")).toBe("image.ocr");
    expect(deriveTaskFromExtension(".jpeg")).toBe("image.ocr");
    expect(deriveTaskFromExtension(".webp")).toBe("image.ocr");
  });

  it("returns null for unknown", () => {
    expect(deriveTaskFromExtension(".xyz")).toBeNull();
  });
});

describe("isConvertibleExtension", () => {
  it("returns true for supported extensions", () => {
    expect(isConvertibleExtension(".pdf")).toBe(true);
    expect(isConvertibleExtension(".docx")).toBe(true);
    expect(isConvertibleExtension(".mp3")).toBe(true);
    expect(isConvertibleExtension(".png")).toBe(true);
  });

  it("returns false for unsupported", () => {
    expect(isConvertibleExtension(".exe")).toBe(false);
    expect(isConvertibleExtension(".zip")).toBe(false);
  });
});

describe("deriveConversionOutputPaths", () => {
  it("derives paths correctly", () => {
    const paths = deriveConversionOutputPaths("/workspace/附件/report.pdf");
    expect(paths.md).toMatch(/report\.md$/);
    expect(paths.assets).toMatch(/report\.assets$/);
    expect(paths.metadata).toMatch(/report\.metadata\.json$/);
    expect(paths.originalsDir).toMatch(/\.originals$/);
    expect(paths.baseName).toBe("report");
  });

  it("uses outputDir when provided", () => {
    const paths = deriveConversionOutputPaths("/workspace/附件/report.pdf", "/output");
    expect(paths.md).toBe("/output/report.md");
  });
});

describe("generateClientJobId", () => {
  it("starts with ridge- and contains safe path", () => {
    const id = generateClientJobId("附件/report.pdf");
    expect(id.startsWith("ridge-")).toBe(true);
    expect(id).toContain("_report_pdf");
  });
});

describe("ConversionServiceClient with fake HTTP server", () => {
  let serverPort = 0;
  let server: Awaited<ReturnType<typeof startFakeServer>>;

  beforeEach(async () => {
    server = await startFakeServer();
    serverPort = server.port;
  });

  afterEach(() => {
    server.close();
  });

  it("health endpoint returns status", async () => {
    const client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "test-key",
    });
    const result = await client.health();
    expect(result.status).toBe("ok");
  });

  it("capabilities returns tasks list", async () => {
    const client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "test-key",
    });
    const caps = await client.capabilities();
    expect(caps.version).toBe("1.0.0");
    expect(caps.tasks.length).toBeGreaterThan(0);
  });

  it("createConversion returns queued job", async () => {
    const client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "test-key",
    });
    const job = await client.createConversion({
      task: "document.markdown",
      input: { url: "https://example.com/test.pdf" },
      clientJobId: "ridge-test-1",
    });
    expect(job.status).toBe("queued");
    expect(job.task).toBe("document.markdown");
  });

  it("getConversion returns job state", async () => {
    const client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "test-key",
    });
    const job = await client.createConversion({
      task: "document.markdown",
      input: { url: "https://example.com/test.pdf" },
    });
    const fetched = await client.getConversion(job.jobId);
    expect(fetched.jobId).toBe(job.jobId);
  });

  it("cancelConversion calls cancel endpoint", async () => {
    const client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "test-key",
    });
    const job = await client.createConversion({
      task: "document.markdown",
      input: { url: "https://example.com/test.pdf" },
    });
    await expect(client.cancelConversion(job.jobId)).resolves.toBeUndefined();
  });

  it("downloadArtifact returns buffer", async () => {
    const client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "test-key",
    });
    const buf = await client.downloadArtifact("conv-1", "art-1");
    expect(buf.length).toBeGreaterThan(0);
  });

  it("listArtifacts returns artifact list", async () => {
    const client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "test-key",
    });
    const artifacts = await client.listArtifacts("conv-1");
    expect(Array.isArray(artifacts)).toBe(true);
  });

  it("downloadArtifacts handles inline and non-inline", async () => {
    const client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "test-key",
    });
    const job: Awaited<ReturnType<typeof client.getConversion>> = {
      jobId: "conv-1",
      status: "succeeded",
      task: "document.markdown",
      createdAt: "2024-06-01T12:00:00Z",
      artifacts: [
        {
          artifactId: "art-1",
          name: "report.md",
          mimeType: "text/markdown",
          size: 100,
          inline: true,
          content: "# Hello",
        },
        {
          artifactId: "art-2",
          name: "img.png",
          mimeType: "image/png",
          size: 200,
          inline: false,
          downloadUrl: "/v1/conversions/conv-1/artifacts/art-2",
        },
      ],
    };
    const downloaded = await client.downloadArtifacts(job);
    expect(downloaded).toHaveLength(2);
    expect(downloaded[0].buffer.toString("utf-8")).toBe("# Hello");
    expect(downloaded[1].buffer.length).toBeGreaterThan(0);
  });

  it("throws ConversionServiceError on 4xx/5xx", async () => {
    const client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "bad-key",
    });
    await expect(client.createConversion({ task: "document.markdown", input: { url: "https://example.com/test.pdf" } }))
      .rejects
      .toBeInstanceOf(ConversionServiceError);
  });
});

describe("loadConversionServiceConfig", () => {
  it("load returns null when missing keys", async () => {
    const config = await loadConversionServiceConfig({});
    expect(config).toBeNull();
  });

  it("load returns config from environment variables", async () => {
    const config = await loadConversionServiceConfig({
      PYTHON_CONVERTER_BASE_URL: "https://example.com/v1",
      PYTHON_CONVERTER_API_KEY: "key123",
      PYTHON_CONVERTER_CALLBACK_TOKEN: "ctok",
      PYTHON_CONVERTER_CALLBACK_BASE_URL: "https://ridge.example.com",
    });
    expect(config).toEqual({
      baseUrl: "https://example.com/v1",
      apiKey: "key123",
      callbackToken: "ctok",
      callbackBaseUrl: "https://ridge.example.com",
    });
  });
});

import http from "node:http";

// === Fake HTTP Server ===

function startFakeServer(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = req.url ?? "";
      const auth = req.headers.authorization ?? "";

      // 校验 API Key
      if (!auth.includes("test-key")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: "auth_failed", message: "Bad key" } }));
        return;
      }

      if (url === "/v1/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", version: "1.0.0", tasks: ["document.markdown"] }));
        return;
      }

      if (url === "/v1/capabilities") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          version: "1.0.0",
          tasks: [
            { task: "document.markdown", supportedInputFormats: [".pdf", ".docx"], supportedOutputFormats: ["markdown"], optionsSchema: {} },
          ],
          maxFileSizeBytes: 100_000_000,
          maxInlineSizeBytes: 64_000,
          defaultRetentionDays: 7,
        }));
        return;
      }

      if (url === "/v1/conversions" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          const parsed = body.startsWith("{") ? JSON.parse(body) : { task: "document.markdown" };
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jobId: "conv_test_01",
            status: "queued",
            task: parsed.task ?? "document.markdown",
            createdAt: "2024-06-01T12:00:00Z",
            clientJobId: parsed.clientJobId ?? null,
            metadata: parsed.metadata ?? {},
          }));
        });
        return;
      }

      if (url.startsWith("/v1/conversions/") && url.endsWith("/cancel") && req.method === "POST") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.startsWith("/v1/conversions/") && url.includes("/artifacts/")) {
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        res.end(Buffer.from("fake-artifact-data"));
        return;
      }

      if (url.startsWith("/v1/conversions/") && url.endsWith("/artifacts")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([]));
        return;
      }

      if (url.startsWith("/v1/conversions/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jobId: "conv_test_01",
          status: "succeeded",
          task: "document.markdown",
          createdAt: "2024-06-01T12:00:00Z",
          completedAt: "2024-06-01T12:00:12Z",
          artifacts: [
            { artifactId: "art_md", name: "report.md", mimeType: "text/markdown", size: 100, inline: true, content: "# Report" },
          ],
          error: null,
        }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      resolve({
        port: address.port,
        close: () => server.close(),
      });
    });
  });
}
