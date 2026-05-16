import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

const listFilesRecursive = (relativeDir: string): string[] => {
	const root = path.join(repoRoot, relativeDir);
	const files: string[] = [];
	const visit = (current: string) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const absolutePath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				visit(absolutePath);
				continue;
			}
			files.push(path.relative(repoRoot, absolutePath));
		}
	};
	visit(root);
	return files.sort();
};

const listPresentGitFiles = (): string[] =>
	execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
		cwd: repoRoot,
		encoding: "utf8",
	})
		.split("\n")
		.filter(Boolean)
		.filter((file) => fs.existsSync(path.join(repoRoot, file)))
		.sort();

const activeAndroidTaskFiles = [
	"50-Android移动端工程骨架.md",
	"54-Android任务查看与轻操作.md",
	"55-Android真机闭环与发布准备.md",
];

describe("V2 release gate documentation", () => {
	it("keeps every feature development task archived before release", () => {
		expect(listMarkdownFiles("文档/功能开发")).toEqual([
			...activeAndroidTaskFiles,
			"index.md",
		].sort());
	});

	it("has no placeholder or partial status left in the feature matrix", () => {
		const index = readText("文档/功能开发/index.md");
		const tableLines = index
			.split("\n")
			.filter((line) => line.startsWith("|") && !line.includes("---"));
		const v2TableLines = tableLines.filter(
			(line) => !/^\| 5[0-5] Android/.test(line),
		);

		expect(v2TableLines.join("\n")).not.toMatch(/[◐⚠️-]/u);
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

	it("keeps generated and temporary files out of tracked source paths", () => {
		const sourceFiles = [
			...listFilesRecursive("packages/server/src"),
			...listFilesRecursive("packages/web/src"),
		];
		const presentGitFiles = listPresentGitFiles();

		expect(sourceFiles.filter((file) => file.endsWith(".tmp"))).toEqual([]);
		expect(presentGitFiles.filter((file) => file.endsWith(".tmp"))).toEqual([]);
		expect(presentGitFiles.filter((file) => file.startsWith("test-results/"))).toEqual([]);
		expect(presentGitFiles.filter((file) => file.startsWith("packages/web/test-results/"))).toEqual([]);
		expect(presentGitFiles.filter((file) => file.startsWith("packages/web/e2e/screenshots/"))).toEqual([]);
	});

	it("keeps E2E screenshots under ignored test-results output", () => {
		const fileTreeSpec = readText("packages/web/e2e/file-tree.spec.ts");

		expect(fileTreeSpec).not.toContain('"e2e/screenshots/');
		expect(fileTreeSpec).toContain("test-results/e2e-screenshots/");
	});
});
