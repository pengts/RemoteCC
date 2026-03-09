/**
 * Static CodeMirror language resolution.
 *
 * Pre-imports common languages so the editor never depends on dynamic chunk
 * loading for the ~20 most-used file types. Unknown extensions fall through
 * to @codemirror/language-data (async, handled by the caller).
 */

import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";

// ── Modern language packages (tree-shaken, sync) ──
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { markdown } from "@codemirror/lang-markdown";

// ── Legacy stream-parser modes ──
import { shell as shellMode } from "@codemirror/legacy-modes/mode/shell";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import { diff as diffMode } from "@codemirror/legacy-modes/mode/diff";

// ── Extension-based static mapping ──

const EXT_MAP: Record<string, () => Extension[]> = {
  // TypeScript
  ts: () => [javascript({ typescript: true })],
  mts: () => [javascript({ typescript: true })],
  cts: () => [javascript({ typescript: true })],
  tsx: () => [javascript({ typescript: true, jsx: true })],
  // JavaScript
  js: () => [javascript()],
  mjs: () => [javascript()],
  cjs: () => [javascript()],
  jsx: () => [javascript({ jsx: true })],
  // Data / Config
  json: () => [json()],
  jsonc: () => [json()],
  toml: () => [StreamLanguage.define(tomlMode)],
  lock: () => [StreamLanguage.define(tomlMode)], // Cargo.lock
  // Markup
  md: () => [markdown()],
  markdown: () => [markdown()],
  html: () => [html()],
  htm: () => [html()],
  xml: () => [xml()],
  svg: () => [xml()],
  xsl: () => [xml()],
  // Styles
  css: () => [css()],
  // Languages
  py: () => [python()],
  rs: () => [rust()],
  go: () => [go()],
  java: () => [java()],
  c: () => [cpp()],
  cpp: () => [cpp()],
  cc: () => [cpp()],
  cxx: () => [cpp()],
  h: () => [cpp()],
  hpp: () => [cpp()],
  // Config
  yaml: () => [yaml()],
  yml: () => [yaml()],
  sql: () => [sql()],
  // Shell
  sh: () => [StreamLanguage.define(shellMode)],
  bash: () => [StreamLanguage.define(shellMode)],
  zsh: () => [StreamLanguage.define(shellMode)],
  ksh: () => [StreamLanguage.define(shellMode)],
  // Diff
  diff: () => [StreamLanguage.define(diffMode)],
  patch: () => [StreamLanguage.define(diffMode)],
  // Misc config extensions
  env: () => [StreamLanguage.define(shellMode)],
  conf: () => [StreamLanguage.define(shellMode)],
  cfg: () => [StreamLanguage.define(shellMode)],
  ini: () => [StreamLanguage.define(shellMode)],
  properties: () => [StreamLanguage.define(shellMode)],
  editorconfig: () => [StreamLanguage.define(shellMode)],
};

// ── Filename-based static mapping (dotfiles, special names) ──

const FILENAME_MAP: Record<string, () => Extension[]> = {
  ".gitignore": () => [StreamLanguage.define(shellMode)],
  ".dockerignore": () => [StreamLanguage.define(shellMode)],
  ".npmignore": () => [StreamLanguage.define(shellMode)],
  ".prettierignore": () => [StreamLanguage.define(shellMode)],
  ".eslintignore": () => [StreamLanguage.define(shellMode)],
  ".env": () => [StreamLanguage.define(shellMode)],
  ".prettierrc": () => [json()],
  ".eslintrc": () => [json()],
  ".babelrc": () => [json()],
  ".swcrc": () => [json()],
  ".editorconfig": () => [StreamLanguage.define(shellMode)],
  Makefile: () => [StreamLanguage.define(shellMode)],
  GNUmakefile: () => [StreamLanguage.define(shellMode)],
};

/**
 * Resolve CodeMirror language extensions from a filename (sync, no dynamic import).
 *
 * Resolution order:
 * 1. Exact filename match (dotfiles, Makefile)
 * 2. `.env.*` pattern
 * 3. Extension-based mapping
 *
 * Returns `Extension[]` on match, `null` if caller should try dynamic fallback.
 */
export function resolveStaticLanguage(filename: string): Extension[] | null {
  // 1. Exact filename match
  const fnFactory = FILENAME_MAP[filename];
  if (fnFactory) return fnFactory();

  // 2. .env.* pattern (e.g. .env.local, .env.production)
  if (/^\.env\..+$/.test(filename)) {
    return [StreamLanguage.define(shellMode)];
  }

  // 3. Extension-based
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const extFactory = EXT_MAP[ext];
  if (extFactory) return extFactory();

  return null;
}

/**
 * Guess language from the first line of file content (shebang, XML declaration, etc.).
 * Used as a last-resort fallback for extensionless files.
 *
 * Returns `Extension[]` on match, `null` otherwise.
 */
export function resolveByFirstLine(firstLine: string): Extension[] | null {
  if (/^#!.*\b(bash|sh|zsh)\b/.test(firstLine)) return [StreamLanguage.define(shellMode)];
  if (/^#!.*\b(python|python3)\b/.test(firstLine)) return [python()];
  if (/^#!.*\bnode\b/.test(firstLine)) return [javascript()];
  if (/^<\?xml\b/.test(firstLine)) return [xml()];
  if (/^<!DOCTYPE\s+html/i.test(firstLine) || /^<html/i.test(firstLine)) return [html()];
  if (/^\s*[{[]/.test(firstLine)) return [json()];
  return null;
}
