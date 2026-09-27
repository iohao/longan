import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { defineComponent, h } from "vue";
import i18n, { setLanguage } from "@/i18n";
import type { RegistrySkill, Skill, SkillInstallProgressEvent } from "@/types";
import SkillMarketPage from "./SkillMarketPage.vue";
import SkillInstallQueue from "@/components/SkillInstallQueue.vue";

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
  inspectGithubSkills: vi.fn(),
  previewLocalSkill: vi.fn(),
  importLocalSkill: vi.fn(),
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
  progressListener: null as ((progress: SkillInstallProgressEvent) => void) | null,
  skillsChangedListener: null as (() => void) | null,
}));

vi.mock("@/api", () => ({
  api: {
    listSkills: mocks.listSkills,
    installSkill: mocks.installSkill,
    cancelSkillInstall: mocks.cancelSkillInstall,
    searchRegistry: mocks.searchRegistry,
    inspectGithubSkills: mocks.inspectGithubSkills,
    previewLocalSkill: mocks.previewLocalSkill,
    importLocalSkill: mocks.importLocalSkill,
    getSetting: mocks.getSetting,
    setSetting: mocks.setSetting,
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const Harness = defineComponent({
  name: "SkillMarketTestHarness",
  setup() {
    return () =>
      h("div", [
        h(SkillMarketPage),
        h(SkillInstallQueue),
      ]);
  },
});

function renderMarket() {
  return mount(Harness, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
    },
  });
}

describe("SkillMarketPage", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    await setLanguage("zh");
    mocks.listSkills.mockResolvedValue([]);
    mocks.installSkill.mockResolvedValue(installedSkill);
    mocks.cancelSkillInstall.mockResolvedValue(true);
    mocks.searchRegistry.mockResolvedValue([]);
    mocks.inspectGithubSkills.mockResolvedValue([]);
    mocks.progressListener = null;
    mocks.skillsChangedListener = null;

    let uuid = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`),
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })));
  });

  describe("registry search", () => {
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

      const wrapper = renderMarket();
      await flushPromises();

      const input = wrapper.find("input");
      await input.setValue("vercel-labs/agent-browser");

      const searchBtn = wrapper.find('button[aria-label="搜索"]');
      await searchBtn.trigger("click");
      await flushPromises();

      expect(mocks.searchRegistry).toHaveBeenCalledWith("vercel-labs/agent-browser");

      const headings = wrapper
        .findAll("h3")
        .map((h) => h.text().trim())
        .filter((text) =>
          [
            "preferred-popular",
            "preferred-low",
            "unrelated-popular",
            "unrelated-medium",
          ].includes(text),
        );

      expect(headings).toEqual([
        "preferred-popular",
        "preferred-low",
        "unrelated-popular",
        "unrelated-medium",
      ]);
      wrapper.unmount();
    });
  });

  describe("install queue", () => {
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
      mocks.searchRegistry.mockImplementation(async (query: string) =>
        query === "first" ? [first] : [second],
      );

      const firstRequest = deferred<Skill>();
      const secondRequest = deferred<Skill>();
      mocks.installSkill
        .mockReturnValueOnce(firstRequest.promise)
        .mockReturnValueOnce(secondRequest.promise);

      const wrapper = renderMarket();
      await flushPromises();

      const input = wrapper.find("input");
      await input.setValue("first");
      await wrapper.find('button[aria-label="搜索"]').trigger("click");
      await flushPromises();

      const firstInstallBtn = wrapper.findAll("button").find((b) => b.text().trim() === "安装");
      expect(firstInstallBtn).toBeDefined();
      await firstInstallBtn!.trigger("click");
      await flushPromises();

      expect(mocks.installSkill).toHaveBeenCalledTimes(1);

      await input.setValue("second");
      await wrapper.find('button[aria-label="搜索"]').trigger("click");
      await flushPromises();

      const secondInstallBtn = wrapper.findAll("button").find((b) => b.text().trim() === "安装");
      expect(secondInstallBtn).toBeDefined();
      await secondInstallBtn!.trigger("click");
      await flushPromises();

      expect(mocks.installSkill).toHaveBeenCalledTimes(2);

      const firstOperationId = mocks.installSkill.mock.calls[0][3] as string;
      expect(mocks.progressListener).not.toBeNull();

      mocks.progressListener?.({
        operationId: firstOperationId,
        phase: "downloading",
        progressPercent: 25,
        downloadedBytes: 1024,
        totalBytes: 4096,
        error: null,
      });
      await flushPromises();

      expect(wrapper.text()).toContain("1.0 KB / 4.0 KB（25%）");

      firstRequest.resolve({ ...installedSkill, name: "first" });
      secondRequest.resolve({ ...installedSkill, id: 2, name: "second" });
      await flushPromises();
      wrapper.unmount();
    });

    it("adds GitHub installs to the global queue and clears the input", async () => {
      const request = deferred<Skill>();
      mocks.installSkill.mockReturnValue(request.promise);

      const wrapper = renderMarket();
      await flushPromises();

      const githubTab = wrapper.findAll("button").find((b) => b.text().includes("GitHub 安装"));
      expect(githubTab).toBeDefined();
      await githubTab!.trigger("click");
      await flushPromises();

      const input = wrapper.find('input[placeholder="https://github.com/owner/repo/tree/main/skill-id"]');
      expect(input.exists()).toBe(true);
      await input.setValue("owner/repo/skill");
      await flushPromises();

      const installBtn = wrapper.findAll("button").find((b) => b.text().trim() === "安装");
      expect(installBtn).toBeDefined();
      await installBtn!.trigger("click");
      await flushPromises();

      expect((input.element as HTMLInputElement).value).toBe("");
      expect(mocks.installSkill).toHaveBeenCalledWith(
        "owner",
        "repo",
        "skill",
        expect.any(String),
        undefined,
        undefined,
        undefined,
      );

      expect(wrapper.text()).toContain("skill");
      request.resolve(installedSkill);
      await flushPromises();
      wrapper.unmount();
    });

    it("keeps completed tasks until the user clears terminal records", async () => {
      const request = deferred<Skill>();
      mocks.installSkill.mockReturnValue(request.promise);

      const wrapper = renderMarket();
      await flushPromises();

      const githubTab = wrapper.findAll("button").find((b) => b.text().includes("GitHub 安装"));
      await githubTab!.trigger("click");
      await flushPromises();

      const input = wrapper.find('input[placeholder="https://github.com/owner/repo/tree/main/skill-id"]');
      await input.setValue("owner/repo/skill");
      await flushPromises();

      const installBtn = wrapper.findAll("button").find((b) => b.text().trim() === "安装");
      await installBtn!.trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("skill");

      request.resolve(installedSkill);
      await new Promise((r) => setTimeout(r, 10));
      await flushPromises();

      expect(wrapper.text()).toContain("安装完成");
      expect(wrapper.text()).toContain("skill");

      const clearBtn = wrapper.find('button[aria-label="清除已结束任务"]');
      expect(clearBtn.exists()).toBe(true);
      await clearBtn.trigger("click");
      await flushPromises();

      const queuePanel = wrapper.find("#skill-install-queue-panel");
      if (queuePanel.exists()) {
        expect(queuePanel.text()).not.toContain("skill");
      }
      wrapper.unmount();
    });

    it("returns focus on Escape and does not reopen when an install fails", async () => {
      const request = deferred<Skill>();
      mocks.installSkill.mockReturnValue(request.promise);

      const wrapper = renderMarket();
      await flushPromises();

      const githubTab = wrapper.findAll("button").find((b) => b.text().includes("GitHub 安装"));
      await githubTab!.trigger("click");
      await flushPromises();

      const input = wrapper.find('input[placeholder="https://github.com/owner/repo/tree/main/skill-id"]');
      await input.setValue("owner/repo/skill");
      await flushPromises();

      const installBtn = wrapper.findAll("button").find((b) => b.text().trim() === "安装");
      await installBtn!.trigger("click");
      await flushPromises();

      expect(mocks.progressListener).not.toBeNull();

      // Trigger Escape on document
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await flushPromises();

      const queueTrigger = wrapper.find('button[aria-label="打开 Skill 安装队列"]');
      expect(queueTrigger.exists()).toBe(true);
      expect(queueTrigger.attributes("aria-expanded")).toBe("false");

      const operationId = mocks.installSkill.mock.calls[0][3] as string;
      mocks.progressListener?.({
        operationId,
        phase: "failed",
        progressPercent: null,
        downloadedBytes: null,
        totalBytes: null,
        error: "network error",
      });
      await flushPromises();

      expect(queueTrigger.attributes("aria-expanded")).toBe("false");
      request.reject(new Error("network error"));
      await flushPromises();
      wrapper.unmount();
    });

    it("discovers multiple skills from GitHub directory and allows batch installation", async () => {
      mocks.inspectGithubSkills.mockResolvedValue([
        {
          skillId: "luban-add-table",
          name: "Luban Add Table",
          description: "Add table skill",
          sourcePath: "ai/skills/luban-add-table",
          installed: false,
        },
        {
          skillId: "luban-excel-fill",
          name: "Luban Excel Fill",
          description: "Excel fill skill",
          sourcePath: "ai/skills/luban-excel-fill",
          installed: false,
        },
      ]);

      const wrapper = renderMarket();
      await flushPromises();

      const githubTab = wrapper.findAll("button").find((b) => b.text().includes("GitHub 安装"));
      await githubTab!.trigger("click");
      await flushPromises();

      const input = wrapper.find('input[placeholder="https://github.com/owner/repo/tree/main/skill-id"]');
      await input.setValue("https://github.com/focus-creative-games/luban/tree/main/ai/skills");
      await flushPromises();

      // Wait for debounce timer (400ms)
      await new Promise((r) => setTimeout(r, 450));
      await flushPromises();

      expect(mocks.inspectGithubSkills).toHaveBeenCalledWith(
        "focus-creative-games",
        "luban",
        "ai/skills",
      );

      expect(wrapper.text()).toContain("检测到 2 个可用技能");
      expect(wrapper.text()).toContain("Luban Add Table");
      expect(wrapper.text()).toContain("Luban Excel Fill");

      const batchInstallBtn = wrapper.findAll("button").find((b) => b.text().includes("批量安装 (2)"));
      expect(batchInstallBtn).toBeDefined();
      await batchInstallBtn!.trigger("click");
      await flushPromises();

      expect(mocks.installSkill).toHaveBeenCalledTimes(2);
      expect(mocks.installSkill).toHaveBeenCalledWith(
        "focus-creative-games",
        "luban",
        "luban-add-table",
        expect.any(String),
        undefined,
        "focus-creative-games/luban",
        "ai/skills/luban-add-table",
      );
      expect(mocks.installSkill).toHaveBeenCalledWith(
        "focus-creative-games",
        "luban",
        "luban-excel-fill",
        expect.any(String),
        undefined,
        "focus-creative-games/luban",
        "ai/skills/luban-excel-fill",
      );
      wrapper.unmount();
    });
  });
});
