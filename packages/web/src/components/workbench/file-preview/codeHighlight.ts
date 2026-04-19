import { bundledLanguages, codeToHtml, type BundledLanguage } from "shiki";

const EXTENSION_LANGUAGE_HINTS: Record<string, string[]> = {
  astro: ["astro"],
  bash: ["bash"],
  c: ["c"],
  cc: ["cpp"],
  cpp: ["cpp"],
  css: ["css"],
  cts: ["typescript"],
  cxx: ["cpp"],
  dockerfile: ["dockerfile"],
  go: ["go"],
  h: ["c"],
  hpp: ["cpp"],
  html: ["html"],
  ini: ["ini"],
  java: ["java"],
  js: ["javascript"],
  json: ["json"],
  jsx: ["jsx", "javascript"],
  kt: ["kotlin"],
  less: ["less"],
  lua: ["lua"],
  mjs: ["javascript"],
  mts: ["typescript"],
  php: ["php"],
  py: ["python"],
  rb: ["ruby"],
  rs: ["rust"],
  scss: ["scss"],
  sh: ["bash"],
  sql: ["sql"],
  swift: ["swift"],
  toml: ["toml"],
  ts: ["typescript"],
  tsx: ["tsx", "typescript"],
  txt: ["plaintext"],
  vue: ["vue"],
  xml: ["xml"],
  yaml: ["yaml"],
  yml: ["yaml"],
  zsh: ["bash"],
};

const MIME_LANGUAGE_HINTS: Record<string, string[]> = {
  "application/json": ["json"],
  "application/sql": ["sql"],
  "application/typescript": ["typescript"],
  "application/xml": ["xml"],
  "text/css": ["css"],
  "text/html": ["html"],
  "text/javascript": ["javascript"],
  "text/jsx": ["jsx", "javascript"],
  "text/markdown": ["markdown"],
  "text/plain": ["plaintext"],
  "text/typescript": ["typescript"],
  "text/x-python": ["python"],
  "text/x-shellscript": ["bash"],
};

const LANGUAGE_LABELS: Partial<Record<BundledLanguage, string>> = {
  astro: "Astro",
  bash: "Bash",
  c: "C",
  cpp: "C++",
  css: "CSS",
  dockerfile: "Dockerfile",
  go: "Go",
  html: "HTML",
  ini: "INI",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  less: "Less",
  lua: "Lua",
  markdown: "Markdown",
  php: "PHP",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  scss: "SCSS",
  sql: "SQL",
  swift: "Swift",
  toml: "TOML",
  tsx: "TSX",
  typescript: "TypeScript",
  vue: "Vue",
  xml: "XML",
  yaml: "YAML",
};

const HIGHLIGHT_CACHE = new Map<string, Promise<string>>();

type RidgeCodeTheme = {
  name: string;
  type: "light" | "dark";
  colors: Record<string, string>;
  tokenColors: Array<{
    scope?: string | string[];
    settings: {
      foreground?: string;
      background?: string;
      fontStyle?: string;
    };
  }>;
};

type CssVariableReader = {
  getPropertyValue: (name: string) => string;
};

const resolveBundledLanguage = (candidate: string): BundledLanguage | null => {
  if (candidate in bundledLanguages) {
    return candidate as BundledLanguage;
  }

  return null;
};

export const resolveCodeLanguage = (
  fileName: string,
  extension: string,
  mimeType: string,
): BundledLanguage | null => {
  const normalizedFileName = fileName.trim().toLowerCase();
  const normalizedExtension = extension.replace(/^\./, "").trim().toLowerCase();
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const extensionCandidates = EXTENSION_LANGUAGE_HINTS[normalizedExtension] ?? [normalizedExtension];
  const mimeCandidates = MIME_LANGUAGE_HINTS[normalizedMimeType] ?? [];
  const fileNameCandidates =
    normalizedFileName === "dockerfile" || normalizedFileName.startsWith("dockerfile.")
      ? ["dockerfile"]
      : [];

  for (const candidate of [...fileNameCandidates, ...extensionCandidates, ...mimeCandidates]) {
    const language = resolveBundledLanguage(candidate);
    if (language) {
      return language;
    }
  }

  return null;
};

export const formatCodeLanguageLabel = (language: BundledLanguage | null) => {
  if (!language) {
    return "Plain Text";
  }

  return LANGUAGE_LABELS[language] ?? language;
};

const normalizeCssColor = (value: string, fallback: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (
    trimmed.startsWith("#")
    || trimmed.startsWith("rgb")
    || trimmed.startsWith("hsl")
    || trimmed.startsWith("oklch")
  ) {
    return trimmed;
  }

  return `hsl(${trimmed})`;
};

export const createRidgeCodeTheme = (options: {
  themeName: string;
  isDark: boolean;
  styles: CssVariableReader;
}) => {
  const foreground = normalizeCssColor(
    options.styles.getPropertyValue("--foreground"),
    options.isDark ? "#e8e4df" : "#2d3436",
  );
  const background = normalizeCssColor(
    options.styles.getPropertyValue("--background"),
    options.isDark ? "#1a1816" : "#faf9f6",
  );
  const primary = normalizeCssColor(
    options.styles.getPropertyValue("--primary"),
    options.isDark ? "#e07a5f" : "#c96b52",
  );
  const accent = normalizeCssColor(
    options.styles.getPropertyValue("--accent"),
    primary,
  );
  const mutedForeground = normalizeCssColor(
    options.styles.getPropertyValue("--muted-foreground"),
    options.isDark ? "#9a918a" : "#78716c",
  );
  const border = normalizeCssColor(
    options.styles.getPropertyValue("--border"),
    options.isDark ? "rgba(92, 84, 77, 0.62)" : "rgba(214, 205, 194, 0.78)",
  );

  const theme: RidgeCodeTheme = {
    name: `ridge-code-${options.themeName}-${options.isDark ? "dark" : "light"}`,
    type: options.isDark ? "dark" : "light",
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editorLineNumber.foreground": mutedForeground,
      "editorLineNumber.activeForeground": foreground,
      "editor.selectionBackground": accent,
      "editor.selectionHighlightBackground": border,
    },
    tokenColors: [
      {
        settings: {
          foreground,
        },
      },
      {
        scope: ["comment", "punctuation.definition.comment"],
        settings: {
          foreground: mutedForeground,
          fontStyle: "italic",
        },
      },
      {
        scope: ["keyword", "storage", "storage.type"],
        settings: {
          foreground: primary,
        },
      },
      {
        scope: ["string", "markup.inline.raw.string"],
        settings: {
          foreground: accent,
        },
      },
      {
        scope: ["constant.numeric", "constant.language", "support.constant"],
        settings: {
          foreground: accent,
        },
      },
      {
        scope: ["entity.name.function", "support.function", "meta.function-call"],
        settings: {
          foreground: primary,
        },
      },
      {
        scope: ["entity.name.type", "entity.name.class", "support.type"],
        settings: {
          foreground,
        },
      },
      {
        scope: ["variable", "meta.definition.variable", "parameter"],
        settings: {
          foreground,
        },
      },
      {
        scope: ["punctuation", "meta.brace"],
        settings: {
          foreground: mutedForeground,
        },
      },
    ],
  };

  return {
    theme,
    signature: [
      theme.name,
      foreground,
      background,
      primary,
      accent,
      mutedForeground,
      border,
    ].join(":"),
  };
};

export const highlightCodeToHtml = async (options: {
  code: string;
  fileName: string;
  extension: string;
  mimeType: string;
  theme: RidgeCodeTheme;
  themeSignature: string;
}) => {
  const language = resolveCodeLanguage(options.fileName, options.extension, options.mimeType);
  const cacheKey = `${options.themeSignature}:${language ?? 'plain'}:${options.code}`;

  if (!language) {
    return {
      html: "",
      language: null,
      label: formatCodeLanguageLabel(null),
    };
  }

  let highlightedHtml = HIGHLIGHT_CACHE.get(cacheKey);

  if (!highlightedHtml) {
    highlightedHtml = codeToHtml(options.code || " ", {
      lang: language,
      theme: options.theme,
    });
    HIGHLIGHT_CACHE.set(cacheKey, highlightedHtml);
  }

  return {
    html: await highlightedHtml,
    language,
    label: formatCodeLanguageLabel(language),
  };
};