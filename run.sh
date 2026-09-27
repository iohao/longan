#!/usr/bin/env bash

# 进入脚本所在根目录，确保从任意目录执行都能正确运行
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Starting Longan development server (killing existing processes first)..."
bun run dev:clean "$@"
