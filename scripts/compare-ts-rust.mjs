#!/usr/bin/env bun

import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

/**
 * Regression testing tool template for comparing TypeScript vs Rust service/command outputs.
 */
const repoRoot = process.cwd();

console.log(`[compare-ts-rust] Template script initialized at ${repoRoot}`);
