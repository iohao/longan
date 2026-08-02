#!/usr/bin/env python3
"""Rebuild public/recommended-skills.json from live skills.sh data.

Queries the skills.sh search API for the curated skill ids below and writes
real, installable entries with zh/en descriptions and a category.

Usage: python3 scripts/rebuild-recommended.py
"""
import json
import os
import urllib.parse
import urllib.request

# id -> (zh description, en description, category)
CURATED = {
    "vercel-labs/skills/find-skills": ("为当前任务自动发现并安装合适的技能", "Discover and install the right skills for your current task", "Foundation"),
    "anthropics/skills/frontend-design": ("构建高质量、可直接上线的前端界面", "Build production-grade frontend interfaces", "Design"),
    "vercel-labs/agent-skills/vercel-react-best-practices": ("Vercel 官方 React 性能优化最佳实践", "React performance best practices from Vercel", "Performance"),
    "vercel-labs/agent-browser/agent-browser": ("面向 AI Agent 的浏览器自动化", "Browser automation for AI agents", "Automation"),
    "mattpocock/skills/tdd": ("测试驱动开发（TDD）工作流", "Test-driven development workflow", "Testing"),
    "vercel-labs/agent-skills/web-design-guidelines": ("网页界面设计规范与审查清单", "Web interface design guidelines and review checklist", "Design"),
    "remotion-dev/skills/remotion-best-practices": ("用 React 以编程方式创建视频", "Create videos programmatically with Remotion", "Video"),
    "anthropics/skills/skill-creator": ("引导你创建自己的 Agent 技能", "Guides you through creating your own agent skills", "Foundation"),
    "supabase/agent-skills/supabase-postgres-best-practices": ("Supabase 官方 Postgres 最佳实践", "Postgres best practices from Supabase", "Database"),
    "obra/superpowers/brainstorming": ("编码前的结构化头脑风暴与方案设计", "Structured brainstorming and design before coding", "Architecture"),
    "leonxlnx/taste-skill/design-taste-frontend": ("提升前端设计审美与细节品味", "Frontend design taste and polish guidelines", "Design"),
    "juliusbrussee/caveman/caveman-commit": ("极简风格的 Commit 信息生成", "Ultra-compressed conventional commit messages", "DevOps"),
    "obra/superpowers/systematic-debugging": ("系统化调试方法论，先找根因再修复", "Systematic debugging: root-cause before fixing", "Debugging"),
    "obra/superpowers/requesting-code-review": ("向他人发起高质量代码评审请求", "Request effective code reviews", "Code Review"),
    "mattpocock/skills/code-review": ("高信号代码评审工作流", "High-signal code review workflow", "Code Review"),
    "anthropics/skills/pdf": ("读取、生成与处理 PDF 文档", "Read, create and manipulate PDF documents", "Documents"),
    "mattpocock/skills/setup-pre-commit": ("为项目配置 pre-commit 钩子", "Set up pre-commit hooks for your project", "DevOps"),
    "anthropics/skills/docx": ("读取、生成与处理 Word 文档", "Read, create and manipulate Word documents", "Documents"),
    "obra/superpowers/receiving-code-review": ("正确接收并处理代码评审意见", "Receive and act on code review feedback", "Code Review"),
    "anthropics/skills/webapp-testing": ("Web 应用端到端测试", "End-to-end testing for web applications", "Testing"),
    "anthropics/skills/mcp-builder": ("构建 MCP 服务器与工具", "Build MCP servers and tools", "MCP"),
    "firebase/agent-skills/firebase-security-rules-auditor": ("审计 Firebase 安全规则", "Audit Firebase security rules", "Security"),
    "neondatabase/agent-skills/neon-postgres": ("Neon Serverless Postgres 使用指南", "Neon serverless Postgres usage guide", "Database"),
    "prisma/skills/prisma-postgres": ("Prisma + Postgres 数据建模与查询", "Prisma with Postgres modeling and queries", "Database"),
    "github/awesome-copilot/git-commit": ("规范化 Git 提交信息", "Well-formed git commit messages", "DevOps"),
    "samber/cc-skills-golang/golang-testing": ("Go 语言测试最佳实践", "Go testing best practices", "Testing"),
    "samber/cc-skills-golang/golang-security": ("Go 语言安全编码实践", "Go secure coding practices", "Security"),
    "greensock/gsap-skills/gsap-react": ("在 React 中使用 GSAP 制作动画", "GSAP animations in React", "Frontend"),
    "clerk/skills/clerk-nextjs-patterns": ("Clerk 在 Next.js 中的认证集成模式", "Clerk authentication patterns for Next.js", "Auth"),
    "wshobson/agents/nextjs-app-router-patterns": ("Next.js App Router 模式与实践", "Next.js App Router patterns", "Frontend"),
    "wshobson/agents/python-testing-patterns": ("Python 测试模式与实践", "Python testing patterns", "Testing"),
    "wshobson/agents/postgresql-table-design": ("PostgreSQL 表结构设计", "PostgreSQL table design", "Database"),
    "better-auth/skills/better-auth-security-best-practices": ("Better Auth 安全最佳实践", "Better Auth security best practices", "Security"),
    "callstackincubator/agent-skills/react-native-best-practices": ("React Native 开发最佳实践", "React Native development best practices", "Mobile"),
    "github/awesome-copilot/multi-stage-dockerfile": ("多阶段 Dockerfile 构建优化", "Multi-stage Dockerfile builds", "DevOps"),
    "remotion-dev/skills/remotion-create": ("快速创建 Remotion 视频项目", "Scaffold Remotion video projects", "Video"),
    "wshobson/agents/e2e-testing-patterns": ("端到端测试模式与实践", "End-to-end testing patterns", "Testing"),
    "mcp-use/mcp-use/mcp-apps-builder": ("构建基于 MCP 的应用", "Build MCP-powered applications", "MCP"),
}

def fetch_live() -> dict:
    """Search skills.sh for each curated skill and index results by id."""
    live = {}
    for skill_id in CURATED:
        query = skill_id.rsplit("/", 1)[-1]
        url = f"https://skills.sh/api/search?q={urllib.parse.quote(query)}"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                for s in json.load(resp).get("skills", []):
                    live.setdefault(s["id"], s)
        except Exception as e:  # noqa: BLE001 - report and continue
            print(f"query '{query}' failed: {e}")
    return live


live = fetch_live()

out = []
missing = []
for skill_id, (zh, en, category) in CURATED.items():
    s = live.get(skill_id)
    if not s:
        missing.append(skill_id)
        continue
    out.append({
        "id": s["id"],
        "name": s["skillId"],
        "source": s["source"],
        "description": zh,
        "descriptionEnglish": en,
        "installs": s["installs"],
        "category": category,
    })

out.sort(key=lambda s: -s["installs"])

dest = os.path.join(os.path.dirname(__file__), "..", "public", "recommended-skills.json")
with open(dest, "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"wrote {len(out)} entries to {os.path.abspath(dest)}")
if missing:
    print("missing from live data:", missing)
