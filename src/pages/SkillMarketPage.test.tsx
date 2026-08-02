import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistrySkill, Skill, SkillInstallProgressEvent } from "../types";

const installedSkill: Skill = {
  id: 1,
  name: "skill",
  source_type: "net",
  owner: "owner",
  repo: "repo",
  dir_path: "net/owner/repo/skill",
  description: null,
  latest_sha: "abc",
  status: "ok",
  updated_at: "2026-07-27",
};

const mocks = vi.hoisted(() => ({
  listSkills: vi.fn(),
  installSkill: vi.fn(),
  cancelSkillInstall: vi.fn(),
  searchRegistry: vi.fn(),
  progressListener: null as ((progress: SkillInstallProgressEvent) => void) | null,
  skillsChangedListener: null as (() => void) | null,
}));

vi.mock("../api", () => ({
  api: {
    listSkills: mocks.listSkills,
    installSkill: mocks.installSkill,
    cancelSkillInstall: mocks.cancelSkillInstall,
    searchRegistry: mocks.searchRegistry,
    previewLocalSkill: vi.fn(),
    importLocalSkill: vi.fn(),
    getSetting: vi.fn(async () => null),
  },
  errorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
  listenForSkillInstallProgress: vi.fn(
    async (listener: (progress: SkillInstallProgressEvent) => void) => {
      mocks.progressListener = listener;
      return vi.fn();
    },
  ),
  listenForSkillsChanged: vi.fn(async (listener: () => void) => {
    mocks.skillsChangedListener = listener;
    return vi.fn();
  }),
}));

import i18n from "../i18n";
import SkillInstallQueue from "../components/SkillInstallQueue";
import { SkillInstallProvider } from "../context/SkillInstallContext";
import SkillMarketPage from "./SkillMarketPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderMarket() {
  return render(
    <SkillInstallProvider>
      <SkillMarketPage debugMode={false} />
      <SkillInstallQueue />
    </SkillInstallProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("zh");
  vi.clearAllMocks();
  mocks.listSkills.mockResolvedValue([]);
  mocks.installSkill.mockResolvedValue(installedSkill);
  mocks.cancelSkillInstall.mockResolvedValue(true);
  mocks.searchRegistry.mockResolvedValue([]);
  mocks.progressListener = null;
  mocks.skillsChangedListener = null;
  let uuid = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`),
  });
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })));
});

describe("SkillMarketPage registry search", () => {
  it("prioritizes matching sources for an owner/repo query", async () => {
    mocks.searchRegistry.mockResolvedValue([
      {
        id: "other/popular/unrelated-popular",
        name: "unrelated-popular",
        source: "other/popular",
        installs: 999999,
        supported: true,
        installed: false,
      },
      {
        id: "vercel-labs/agent-browser/preferred-low",
        name: "preferred-low",
        source: "vercel-labs/agent-browser",
        installs: 9,
        supported: true,
        installed: false,
      },
      {
        id: "other/medium/unrelated-medium",
        name: "unrelated-medium",
        source: "other/medium",
        installs: 500,
        supported: true,
        installed: false,
      },
      {
        id: "vercel-labs/agent-browser/preferred-popular",
        name: "preferred-popular",
        source: "VERCEL-LABS/AGENT-BROWSER",
        installs: 100,
        supported: true,
        installed: false,
      },
    ] satisfies RegistrySkill[]);
    renderMarket();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "vercel-labs/agent-browser" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    expect(mocks.searchRegistry).toHaveBeenCalledWith("vercel-labs/agent-browser");
    await screen.findByRole("heading", { level: 3, name: "preferred-popular" });
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "preferred-popular",
      "preferred-low",
      "unrelated-popular",
      "unrelated-medium",
    ]);
  });
});

describe("SkillMarketPage install queue", () => {
  it("keeps unrelated install actions available after searching again", async () => {
    const first: RegistrySkill = {
      id: "owner/repo/first",
      name: "first",
      source: "owner/repo",
      installs: 10,
      supported: true,
      installed: false,
    };
    const second: RegistrySkill = {
      ...first,
      id: "owner/repo/second",
      name: "second",
    };
    mocks.searchRegistry.mockImplementation(async (query: string) => query === "first" ? [first] : [second]);
    const firstRequest = deferred<Skill>();
    const secondRequest = deferred<Skill>();
    mocks.installSkill
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    const user = userEvent.setup();
    renderMarket();

    const searchInput = screen.getByRole("textbox");
    await user.type(searchInput, "first");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    await user.click(await screen.findByRole("button", { name: "安装" }));
    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledTimes(1));

    await user.clear(searchInput);
    await user.type(searchInput, "second");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    const secondInstall = await screen.findByRole("button", { name: "安装" });
    expect(secondInstall).toBeEnabled();
    await user.click(secondInstall);

    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: "first" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "second" })).toHaveLength(2);

    const firstOperationId = mocks.installSkill.mock.calls[0][3] as string;
    await waitFor(() => expect(mocks.progressListener).not.toBeNull());
    act(() => {
      mocks.progressListener?.({
        operationId: firstOperationId,
        phase: "downloading",
        progressPercent: 25,
        downloadedBytes: 1024,
        totalBytes: 4096,
        error: null,
      });
    });
    expect(screen.getByText("1.0 KB / 4.0 KB（25%）")).toBeInTheDocument();

    act(() => {
      firstRequest.resolve({ ...installedSkill, name: "first" });
      secondRequest.resolve({ ...installedSkill, id: 2, name: "second" });
    });
  });

  it("adds GitHub installs to the global queue and clears the input", async () => {
    const request = deferred<Skill>();
    mocks.installSkill.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderMarket();

    await user.click(screen.getByRole("button", { name: "GitHub 安装" }));
    const input = screen.getByPlaceholderText("https://github.com/owner/repo/tree/main/skill-id");
    await user.type(input, "owner/repo/skill");
    await user.click(screen.getByRole("button", { name: "安装" }));

    expect(input).toHaveValue("");
    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledWith(
      "owner",
      "repo",
      "skill",
      expect.any(String),
      undefined,
      undefined,
    ));
    expect(screen.getByRole("heading", { name: "skill" })).toBeInTheDocument();

    act(() => request.resolve(installedSkill));
  });

  it("keeps completed tasks until the user clears terminal records", async () => {
    const request = deferred<Skill>();
    mocks.installSkill.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderMarket();

    await user.click(screen.getByRole("button", { name: "GitHub 安装" }));
    await user.type(
      screen.getByPlaceholderText("https://github.com/owner/repo/tree/main/skill-id"),
      "owner/repo/skill",
    );
    await user.click(screen.getByRole("button", { name: "安装" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "skill" })).toBeInTheDocument());

    act(() => request.resolve(installedSkill));
    await waitFor(() => expect(screen.getByText("安装完成")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "skill" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清除已结束任务" }));
    expect(screen.queryByRole("heading", { name: "skill" })).not.toBeInTheDocument();
  });

  it("returns focus on Escape and does not reopen when an install fails", async () => {
    const request = deferred<Skill>();
    mocks.installSkill.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderMarket();

    await user.click(screen.getByRole("button", { name: "GitHub 安装" }));
    await user.type(
      screen.getByPlaceholderText("https://github.com/owner/repo/tree/main/skill-id"),
      "owner/repo/skill",
    );
    await user.click(screen.getByRole("button", { name: "安装" }));
    await waitFor(() => expect(mocks.progressListener).not.toBeNull());

    await user.keyboard("{Escape}");
    const queueTrigger = screen.getByRole("button", { name: "打开 Skill 安装队列" });
    await waitFor(() => expect(queueTrigger).toHaveFocus());
    const operationId = mocks.installSkill.mock.calls[0][3] as string;
    act(() => {
      mocks.progressListener?.({
        operationId,
        phase: "failed",
        progressPercent: null,
        downloadedBytes: null,
        totalBytes: null,
        error: "network error",
      });
    });

    await waitFor(() => expect(queueTrigger).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByText("network error")).not.toBeInTheDocument();

    act(() => request.reject(new Error("network error")));
  });
});
