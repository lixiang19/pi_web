import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFleetingRouter } from "../routes/fleeting.js";
import { createTempDir } from "../test/helpers.js";

type TestDatabase = ReturnType<typeof Database>;

describe("desktop capture API", () => {
  let workspaceDir: string;
  let dbPath: string;
  let db: TestDatabase;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof express>;
  let runAnalysis: (noteId: string) => Promise<void>;

  beforeEach(async () => {
    workspaceDir = await createTempDir("ridge-desktop-capture-");
    dbPath = path.join(workspaceDir, "ridge-test.db");
    db = new Database(dbPath);
    db.exec(`
CREATE TABLE IF NOT EXISTS fleeting_notes (
  note_id TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  analysis_status TEXT NOT NULL DEFAULT 'unanalyzed',
  recommendation_type TEXT,
  recommendation_text TEXT,
  draft TEXT,
  requires_input INTEGER NOT NULL DEFAULT 0,
  pi_session_id TEXT,
  pi_session_file TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  capture_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fleeting_notes_created_at
  ON fleeting_notes(created_at DESC);
CREATE TABLE IF NOT EXISTS fleeting_attachments (
  attachment_id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  stored_name TEXT NOT NULL DEFAULT '',
  stored_path TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fleeting_attachments_note
  ON fleeting_attachments(note_id, created_at DESC);
    `);
    runAnalysis = vi.fn(async () => undefined);
    app = express();
    app.use(express.json({ limit: "6mb" }));

    // 模拟认证中间件：未带 session cookie 时返回 401
    const mockAuth = (req: Request, res: Response, next: NextFunction) => {
      const cookie = req.headers.cookie || "";
      if (!cookie.includes("ridge_session=")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    };
    app.use(mockAuth);

    const router = createFleetingRouter({
      db,
      workspaceDir,
      getAnalysisRunner: () => ({ run: runAnalysis, resetJob: vi.fn() }),
    });
    app.use("/api/fleeting", router);
    app.use((err: Error & { statusCode?: number }, _req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }, _next: unknown) => {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    });
    cleanup = async () => {
      db.close();
      await fs.rm(workspaceDir, { recursive: true, force: true });
    };
  });

  afterEach(async () => {
    await cleanup();
  });

  it("rejects capture when not authenticated", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .send({ type: "text", content: "未登录采集" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("creates a text capture note when authenticated", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({ type: "text", content: "桌面采集的文字内容" });

    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe("桌面采集的文字内容");
    expect(res.body.note.status).toBe("pending");
    expect(res.body.note.analysisStatus).toBe("unanalyzed");
    expect(res.body.attachments).toEqual([]);
    expect(runAnalysis).toHaveBeenCalledWith(res.body.note.id);
  });

  it("creates a screenshot capture note with optional text", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({ type: "screenshot_region", content: "截图备注" });

    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe("截图备注");
    expect(res.body.note.status).toBe("pending");
  });

  it("creates a screenshot capture note without text", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({ type: "screenshot_fullscreen" });

    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe("");
    expect(res.body.note.status).toBe("pending");
  });

  it("creates a clipboard capture note", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({ type: "clipboard", content: "剪贴板内容" });

    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe("剪贴板内容");
  });

  it("creates a browser_url capture note with metadata", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({
        type: "browser_url",
        content: "https://example.com/article",
        metadata: {
          title: "Example Article",
          selectedText: "选中的文本段落",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe("https://example.com/article");
    expect(res.body.note.metadata).toEqual({
      title: "Example Article",
      selectedText: "选中的文本段落",
    });
  });

  it("creates an audio capture note", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({ type: "audio" });

    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe("");
    expect(res.body.note.status).toBe("pending");
  });

  it("creates a file capture note", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({
        type: "file",
        content: "文件备注",
        fileName: "document.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
      });

    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe("文件备注");
    expect(res.body.attachments).toHaveLength(0);
  });

  it("creates a selection capture note", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({
        type: "selection",
        content: "当前选中的文本",
        metadata: {
          sourceApp: "VS Code",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe("当前选中的文本");
  });

  it("rejects unsupported capture type", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({ type: "unsupported_type", content: "内容" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("text");
  });

  it("rejects capture with empty type", async () => {
    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({ content: "内容" });

    expect(res.status).toBe(400);
  });

  it("creates a capture note with attachment base64", async () => {
    const imageBuffer = Buffer.from("fake-image-data");
    const base64 = imageBuffer.toString("base64");

    const res = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({
        type: "screenshot_region",
        content: "截图说明",
        attachments: [
          {
            name: "screenshot.png",
            mimeType: "image/png",
            base64,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe("截图说明");
    expect(res.body.attachments).toHaveLength(1);
    expect(res.body.attachments[0].originalName).toBe("screenshot.png");
    expect(res.body.attachments[0].mimeType).toBe("image/png");

    const attachmentDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", res.body.note.id);
    const files = await fs.readdir(attachmentDir);
    expect(files).toHaveLength(1);
  });

  it("lists capture notes in the fleeting list", async () => {
    const capture = await request(app)
      .post("/api/fleeting/capture")
      .set("Cookie", "ridge_session=test-session-id")
      .send({ type: "text", content: "桌面采集" });

    const list = await request(app)
      .get("/api/fleeting")
      .set("Cookie", "ridge_session=test-session-id");
    expect(list.status).toBe(200);
    expect(list.body.notes).toHaveLength(1);
    expect(list.body.notes[0].id).toBe(capture.body.note.id);
    expect(list.body.notes[0].content).toBe("桌面采集");
  });
});
