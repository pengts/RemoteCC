import { describe, it, expect } from "vitest";
import { resolveStaticLanguage, resolveByFirstLine } from "../codemirror-languages";

describe("resolveStaticLanguage", () => {
  // ── Common extensions ──

  it("resolves common code extensions", () => {
    const shouldMatch = [
      "app.ts",
      "openai.d.ts", // .d.ts → extension "ts" → TypeScript
      "global.d.mts", // .d.mts → extension "mts" → TypeScript
      "app.tsx",
      "index.js",
      "index.jsx",
      "main.mjs",
      "main.cjs",
      "styles.css",
      "README.md",
      "config.json",
      "main.py",
      "lib.rs",
      "main.go",
      "App.java",
      "main.cpp",
      "main.c",
      "util.h",
      "util.hpp",
      "index.html",
      "page.htm",
      "schema.sql",
      "config.yaml",
      "config.yml",
      "data.xml",
      "icon.svg",
      "Cargo.toml",
      "script.sh",
      "script.bash",
      "changes.diff",
      "fix.patch",
    ];
    for (const filename of shouldMatch) {
      expect(resolveStaticLanguage(filename), `expected match for ${filename}`).not.toBeNull();
    }
  });

  // ── Dotfiles ──

  it("resolves shell-like dotfiles", () => {
    expect(resolveStaticLanguage(".gitignore")).not.toBeNull();
    expect(resolveStaticLanguage(".dockerignore")).not.toBeNull();
    expect(resolveStaticLanguage(".npmignore")).not.toBeNull();
    expect(resolveStaticLanguage(".env")).not.toBeNull();
  });

  it("resolves .env.* variants", () => {
    expect(resolveStaticLanguage(".env.local")).not.toBeNull();
    expect(resolveStaticLanguage(".env.production")).not.toBeNull();
    expect(resolveStaticLanguage(".env.development.local")).not.toBeNull();
  });

  it("resolves JSON-like dotfiles", () => {
    expect(resolveStaticLanguage(".prettierrc")).not.toBeNull();
    expect(resolveStaticLanguage(".eslintrc")).not.toBeNull();
    expect(resolveStaticLanguage(".babelrc")).not.toBeNull();
  });

  it("resolves Makefile", () => {
    expect(resolveStaticLanguage("Makefile")).not.toBeNull();
    expect(resolveStaticLanguage("GNUmakefile")).not.toBeNull();
  });

  // ── Config extensions ──

  it("resolves config file extensions", () => {
    expect(resolveStaticLanguage("my.conf")).not.toBeNull();
    expect(resolveStaticLanguage("settings.ini")).not.toBeNull();
    expect(resolveStaticLanguage("Cargo.lock")).not.toBeNull();
  });

  // ── Dynamic fallback (returns null) ──

  it("returns null for files that should use dynamic fallback", () => {
    // Dockerfile — language-data handles it natively, should NOT be forced to Shell
    expect(resolveStaticLanguage("Dockerfile")).toBeNull();
    // Unknown extensions
    expect(resolveStaticLanguage("unknown.xyz")).toBeNull();
    expect(resolveStaticLanguage("README")).toBeNull();
    expect(resolveStaticLanguage("data.parquet")).toBeNull();
  });
});

describe("resolveByFirstLine", () => {
  it("detects shell shebang", () => {
    expect(resolveByFirstLine("#!/bin/bash")).not.toBeNull();
    expect(resolveByFirstLine("#!/usr/bin/env sh")).not.toBeNull();
    expect(resolveByFirstLine("#!/usr/bin/env zsh")).not.toBeNull();
  });

  it("detects python shebang", () => {
    expect(resolveByFirstLine("#!/usr/bin/env python3")).not.toBeNull();
    expect(resolveByFirstLine("#!/usr/bin/python")).not.toBeNull();
  });

  it("detects node shebang", () => {
    expect(resolveByFirstLine("#!/usr/bin/env node")).not.toBeNull();
  });

  it("detects XML declaration", () => {
    expect(resolveByFirstLine('<?xml version="1.0"?>')).not.toBeNull();
  });

  it("detects HTML doctype", () => {
    expect(resolveByFirstLine("<!DOCTYPE html>")).not.toBeNull();
    expect(resolveByFirstLine("<html lang='en'>")).not.toBeNull();
  });

  it("detects JSON opening brace/bracket", () => {
    expect(resolveByFirstLine("{")).not.toBeNull();
    expect(resolveByFirstLine("[")).not.toBeNull();
    expect(resolveByFirstLine('  {"key": "value"}')).not.toBeNull();
  });

  it("returns null for unrecognized content", () => {
    expect(resolveByFirstLine("hello world")).toBeNull();
    expect(resolveByFirstLine("")).toBeNull();
    expect(resolveByFirstLine("some random text")).toBeNull();
  });
});
