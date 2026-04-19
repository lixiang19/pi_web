import type { WorkbenchMarkdownBlock, WorkbenchMarkdownBlockKind } from "./types";

const FENCE_RE = /^\s*(```+|~~~+)/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+/;
const RULE_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?/;
const LIST_RE = /^\s{0,3}(?:[-+*]|\d+\.)\s+/;
const TABLE_DIVIDER_RE = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*$/;

const isBlank = (line: string) => line.trim().length === 0;
const getLine = (lines: string[], index: number) => lines[index] ?? "";

const normalizeExcerpt = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, "代码块")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[>#*_~\-]+/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const makeBlock = (
  kind: WorkbenchMarkdownBlockKind,
  lines: string[],
  startIndex: number,
  endExclusive: number,
): WorkbenchMarkdownBlock => {
  const source = lines.slice(startIndex, endExclusive).join("\n");
  const excerpt = normalizeExcerpt(source).slice(0, 96) || "空白内容";
  const firstLine = getLine(lines, startIndex);

  let title = excerpt;
  if (kind === "heading") {
    title = firstLine.replace(/^\s{0,3}#{1,6}\s*/, "").trim() || "标题";
  } else if (kind === "code") {
    const language = firstLine.replace(/^\s*(```+|~~~+)/, "").trim();
    title = language ? `代码块 · ${language}` : "代码块";
  } else if (kind === "table") {
    title = excerpt || "表格";
  } else if (kind === "rule") {
    title = "分隔线";
  }

  return {
    id: `${kind}-${startIndex + 1}-${endExclusive}`,
    kind,
    source,
    startLine: startIndex + 1,
    endLine: endExclusive,
    title,
    excerpt,
  };
};

const isTableStart = (lines: string[], index: number) => {
  const header = getLine(lines, index);
  const divider = getLine(lines, index + 1);
  return Boolean(header && divider && header.includes("|") && TABLE_DIVIDER_RE.test(divider));
};

const isSpecialStart = (lines: string[], index: number) => {
  const line = lines[index] ?? "";
  return (
    FENCE_RE.test(line)
    || HEADING_RE.test(line)
    || RULE_RE.test(line)
    || QUOTE_RE.test(line)
    || LIST_RE.test(line)
    || isTableStart(lines, index)
  );
};

export const parseMarkdownBlocks = (content: string): WorkbenchMarkdownBlock[] => {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: WorkbenchMarkdownBlock[] = [];

  let index = 0;
  while (index < lines.length) {
    if (isBlank(getLine(lines, index))) {
      index += 1;
      continue;
    }

    const startIndex = index;
    const line = getLine(lines, index);

    if (FENCE_RE.test(line)) {
      const marker = line.match(FENCE_RE)?.[1] ?? "```";
      index += 1;
      while (index < lines.length && !getLine(lines, index).trimStart().startsWith(marker)) {
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(makeBlock("code", lines, startIndex, index));
      continue;
    }

    if (HEADING_RE.test(line)) {
      index += 1;
      blocks.push(makeBlock("heading", lines, startIndex, index));
      continue;
    }

    if (RULE_RE.test(line)) {
      index += 1;
      blocks.push(makeBlock("rule", lines, startIndex, index));
      continue;
    }

    if (isTableStart(lines, index)) {
      index += 2;
      while (index < lines.length && !isBlank(getLine(lines, index)) && getLine(lines, index).includes("|")) {
        index += 1;
      }
      blocks.push(makeBlock("table", lines, startIndex, index));
      continue;
    }

    if (QUOTE_RE.test(line)) {
      index += 1;
      while (index < lines.length && (QUOTE_RE.test(getLine(lines, index)) || isBlank(getLine(lines, index)))) {
        index += 1;
      }
      blocks.push(makeBlock("quote", lines, startIndex, index));
      continue;
    }

    if (LIST_RE.test(line)) {
      index += 1;
      while (
        index < lines.length
        && !isBlank(getLine(lines, index))
        && (LIST_RE.test(getLine(lines, index)) || /^\s{2,}/.test(getLine(lines, index)))
      ) {
        index += 1;
      }
      blocks.push(makeBlock("list", lines, startIndex, index));
      continue;
    }

    index += 1;
    while (index < lines.length && !isBlank(getLine(lines, index)) && !isSpecialStart(lines, index)) {
      index += 1;
    }
    blocks.push(makeBlock("paragraph", lines, startIndex, index));
  }

  return blocks;
};