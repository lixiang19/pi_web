import {
	BookOpen,
	CheckSquare,
	File,
	FileAudio,
	FileCode2,
	FileImage,
	FileText,
	FileVideo,
	Folder,
	FolderOpen,
} from "lucide-vue-next";
import { describe, expect, it } from "vitest";
import { fileIconByExtension, folderIcon } from "@/composables/useFileIcons";

describe("fileIconByExtension", () => {
	it("returns FileText for .md", () => {
		expect(fileIconByExtension(".md")).toBe(FileText);
	});

	it("returns FileText for .markdown", () => {
		expect(fileIconByExtension(".markdown")).toBe(FileText);
	});

	it("returns BookOpen for .canvas", () => {
		expect(fileIconByExtension(".canvas")).toBe(BookOpen);
	});

	it("returns CheckSquare for .base", () => {
		expect(fileIconByExtension(".base")).toBe(CheckSquare);
	});

	it("returns FileImage for image extensions", () => {
		[".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"].forEach((ext) => {
			expect(fileIconByExtension(ext)).toBe(FileImage);
		});
	});

	it("returns FileVideo for video extensions", () => {
		[".mp4", ".mov", ".avi"].forEach((ext) => {
			expect(fileIconByExtension(ext)).toBe(FileVideo);
		});
	});

	it("returns FileAudio for audio extensions", () => {
		[".mp3", ".wav", ".ogg"].forEach((ext) => {
			expect(fileIconByExtension(ext)).toBe(FileAudio);
		});
	});

	it("returns FileCode2 for code extensions", () => {
		[".ts", ".tsx", ".js", ".jsx", ".vue", ".py", ".rs", ".go"].forEach(
			(ext) => {
				expect(fileIconByExtension(ext)).toBe(FileCode2);
			},
		);
	});

	it("returns File for unknown extensions", () => {
		expect(fileIconByExtension(".xyz")).toBe(File);
		expect(fileIconByExtension(".unknown")).toBe(File);
	});

	it("is case insensitive", () => {
		expect(fileIconByExtension(".MD")).toBe(FileText);
		expect(fileIconByExtension(".PNG")).toBe(FileImage);
	});
});

describe("folderIcon", () => {
	it("returns FolderOpen when expanded", () => {
		expect(folderIcon(true)).toBe(FolderOpen);
	});

	it("returns Folder when collapsed", () => {
		expect(folderIcon(false)).toBe(Folder);
	});
});
