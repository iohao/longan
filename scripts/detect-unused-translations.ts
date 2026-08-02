#!/usr/bin/env bun
/**
 * detect-unused-translations.ts - 精确检测未使用的翻译 keys
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SRC_DIR = "./src";
const LOCALES_DIR = "./src/locales";

interface TranslationFile {
  [key: string]: unknown;
}

function flattenTranslations(
  obj: Record<string, unknown>,
  prefix = ""
): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (
      typeof v === "object" &&
      v !== null &&
      !Array.isArray(v)
    ) {
      const subKeys = flattenTranslations(
        v as Record<string, unknown>,
        fullKey
      );
      subKeys.forEach((key) => keys.add(key));
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

function extractTKeys(content: string): Set<string> {
  const pattern = /t\(\s*["']([^"']+?)["']\s*\)/g;
  const matches = content.matchAll(pattern);
  const keys = new Set<string>();
  for (const match of matches) {
    const lineStart = content.lastIndexOf('\n', match.index ?? 0);
    const lineEnd = content.indexOf('\n', match.index ?? 0);
    const line = content.slice(lineStart + 1, lineEnd).trim();
    
    // Only filter out actual method calls, not variable names or comments
    const isFalsePositive = /\.(split|replace|match|replaceAll)\s*\(/.test(line) ||
                           /Event\(/.test(line) ||
                           /import\s*\(/.test(line);
    
    if (!isFalsePositive) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function walkDir(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      if (!entry.includes(".test.") && !entry.includes(".spec.")) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function main() {
  console.log("🔍 Scanning TypeScript files...");
  const allFiles = walkDir(SRC_DIR);
  
  const allCodeKeys = new Set<string>();
  const fileToKeys = new Map<string, string[]>();

  for (const file of allFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      const lines = content.split('\n').filter((line: string) => !line.includes('import('));
      const filteredContent = lines.join('\n');
      const keys = extractTKeys(filteredContent);
      fileToKeys.set(file, [...keys]);
      keys.forEach((k) => allCodeKeys.add(k));
    } catch { /* ignore */ }
  }

  const loadLocale = (lang: string): Set<string> => {
    const langFile = join(LOCALES_DIR, `${lang}.json`);
    if (!existsSync(langFile)) {
      console.warn(`⚠️  ${lang}.json not found`);
      return new Set();
    }
    const obj = JSON.parse(readFileSync(langFile, "utf-8")) as TranslationFile;
    return flattenTranslations(obj);
  };

  const enKeys = loadLocale("en");
  const zhKeys = loadLocale("zh");

  console.log(`\n✅ Found ${allFiles.length} source files`);
  console.log(`   EN defined: ${enKeys.size} keys | ZH defined: ${zhKeys.size} keys`);
  console.log(`   Used in code: ${allCodeKeys.size} unique keys\n`);

  const unusedInCode = [...enKeys].filter((k) => !allCodeKeys.has(k));
  
  if (unusedInCode.length > 0) {
    console.error(`❌ ${unusedInCode.length} unused key(s) in en.json:`);
    console.error("   These should be removed:\n");
    for (const key of unusedInCode) {
      console.warn(`   - ${key}`);
    }
    process.exitCode = 1;
  } else {
    console.log("✅ All translation keys are being used!");
  }
}

main();
