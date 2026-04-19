export type WorkbenchMarkdownBlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "quote"
  | "code"
  | "table"
  | "rule";

export interface WorkbenchMarkdownBlock {
  id: string;
  kind: WorkbenchMarkdownBlockKind;
  source: string;
  startLine: number;
  endLine: number;
  title: string;
  excerpt: string;
}