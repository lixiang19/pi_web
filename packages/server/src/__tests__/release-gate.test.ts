import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");

const readText = (relativePath: string): string =>
	fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const listMarkdownFiles = (relativeDir: string): string[] =>
	fs
		.readdirSync(path.join(repoRoot, relativeDir), { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort();

describe("V2 release gate documentation", () => {
	it("keeps every feature development task archived before release", () => {
		expect(listMarkdownFiles("文档/功能开发")).toEqual(["index.md"]);
	});

	it("has no placeholder or partial status left in the feature matrix", () => {
		const index = readText("文档/功能开发/index.md");
		const tableLines = index
			.split("\n")
			.filter((line) => line.startsWith("|") && !line.includes("---"));

		expect(tableLines.join("\n")).not.toMatch(/[◐⚠️-]/u);
	});

	it("keeps the V2 plan and archived task doc aligned on phase 6 as the final gate", () => {
		const plan = readText("文档/项目设计/V2最终上线计划.md");
		const archivedTask = readText("文档/功能开发/归档/48-V2阶段6上线质量门禁.md");

		expect(plan).toContain("## 阶段 6：上线质量门禁");
		expect(plan).not.toContain("7. 阶段 6");
		expect(plan).not.toContain("7. 上线质量门禁");
		expect(archivedTask).toContain("状态：已归档");
		expect(archivedTask).toContain("根目录 `npm run check` 通过");
		expect(archivedTask).toContain("根目录 `pnpm test` 通过");
		expect(archivedTask).toContain("关键 E2E");
	});
});
