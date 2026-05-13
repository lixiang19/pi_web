import { describe, expect, it } from "vitest";
import { toPosixPath, validateSafePath } from "../utils/paths.js";

describe("toPosixPath", () => {
	it("converts backslashes to forward slashes", () => {
		expect(toPosixPath("C:\\Users\\test\\file.txt")).toBe("C:/Users/test/file.txt");
		expect(toPosixPath("\\\\server\\share\\doc.pdf")).toBe("//server/share/doc.pdf");
	});

	it("leaves forward slashes unchanged", () => {
		expect(toPosixPath("/unix/path/file.txt")).toBe("/unix/path/file.txt");
		expect(toPosixPath("/Users/test/ridge-workspace/readme.md")).toBe("/Users/test/ridge-workspace/readme.md");
	});

	it("converts mixed separators to all forward slashes", () => {
		expect(toPosixPath("mixed\\path/file.txt")).toBe("mixed/path/file.txt");
		expect(toPosixPath("/Users\\test/path")).toBe("/Users/test/path");
	});

	it("handles empty string", () => {
		expect(toPosixPath("")).toBe("");
	});

	it("handles paths with multiple consecutive backslashes", () => {
		expect(toPosixPath("C:\\\\Users\\\\test")).toBe("C://Users//test");
	});

	it("does not depend on runtime path.sep", () => {
		// On POSIX systems path.sep is '/', on Windows it's '\\'.
		// toPosixPath must always replace backslashes regardless of OS.
		const input = "always\\convert\\these";
		expect(toPosixPath(input)).toBe("always/convert/these");
	});
});

describe("validateSafePath", () => {
	it("allows POSIX-safe paths", () => {
		expect(() => validateSafePath("/Users/test/file.txt")).not.toThrow();
		expect(() => validateSafePath("backslash_dir/file.txt")).not.toThrow();
	});

	it("rejects paths containing backslashes", () => {
		expect(() => validateSafePath("backslash\\dir")).toThrow(
			"Path contains backslash which is not allowed",
		);
		expect(() => validateSafePath("C:\\Users\\test")).toThrow(
			"Path contains backslash which is not allowed",
		);
	});
});
