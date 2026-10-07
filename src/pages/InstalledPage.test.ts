import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import i18n, { setLanguage } from "@/i18n";
import type { ListedSkill, SkillUpdateProgressEvent } from "@/types";
import { useSkillUpdateStore } from "@/stores/skillUpdate";
import InstalledPage from "./InstalledPage.vue";

const skills: ListedSkill[] = [
  {
    id: 1,
    name: "brainstorming",
    source_type: "net",
    owner: "obra",
    repo: "superpowers",
    dir_path: "net/obra/superpowers/brainstorming",
    description: "Generate ideas",
    latest_sha: "abc",
    status: "update_available",
    updated_at: "2026-07-01",
    reference_count: 0,
    source_url: "obra/superpowers/brainstorming",
  },
  {
    id: 2,
    name: "tdd",
    source_type: "net",
    owner: "obra",
    repo: "superpowers",
    dir_path: "net/obra/superpowers/tdd",
    description: null,
    latest_sha: "def",
    status: "update_available",
    updated_at: "2026-07-02",
    reference_count: 0,
  },
  {
    id: 3,
    name: "debugging",
    source_type: "net",
    owner: "obra",
    repo: "superpowers",
    dir_path: "net/obra/superpowers/debugging",
    description: null,
    latest_sha: "ghi",
    status: "update_available",
    updated_at: "2026-07-03",
    reference_count: 0,
  },
];

const localSkill: ListedSkill = {
  id: 4,
  name: "longan-release",
  source_type: "local",
  owner: null,
  repo: null,
  dir_path: "local/longan-release",
  description: "Release workflow",
  latest_sha: null,
  status: "ok",
  updated_at: "2027-08-01",
  reference_count: 0,
};

const mocks = vi.hoisted(() => ({
  listSkills: vi.fn(),
  updateSkill: vi.fn(),
  updateSkills: vi.fn(),
  checkUpdates: vi.fn(),
  rescanLocal: vi.fn(),
  skillReferences: vi.fn(),
  deleteSkill: vi.fn(),
  skillReferenceDetails: vi.fn(),
  openSkillDir: vi.fn(),
  openSkillGroupDir: vi.fn(),
  openSkillSubDir: vi.fn(),
  openUrl: vi.fn(),
  progressListener: null as ((progress: SkillUpdateProgressEvent) => void) | null,
  skillsChangedListeners: [] as Array<() => void>,
  skillsChangedCleanup: vi.fn(),
  setSetting: vi.fn(async () => undefined),
  getSetting: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrl,
}));

vi.mock("@/api", () => ({
  api: {
    listSkills: mocks.listSkills,
    updateSkill: mocks.updateSkill,
    updateSkills: mocks.updateSkills,
    checkUpdates: mocks.checkUpdates,
    rescanLocal: mocks.rescanLocal,
    skillReferences: mocks.skillReferences,
    deleteSkill: mocks.deleteSkill,
    skillReferenceDetails: mocks.skillReferenceDetails,
    openSkillDir: mocks.openSkillDir,
    openSkillGroupDir: mocks.openSkillGroupDir,
    openSkillSubDir: mocks.openSkillSubDir,
    getSetting: mocks.getSetting,
    setSetting: mocks.setSetting,
  },
  errorMessage: (error: unknown) => String(error),
  listenForSkillUpdateProgress: vi.fn(
    async (listener: (progress: SkillUpdateProgressEvent) => void) => {
      mocks.progressListener = listener;
      return vi.fn();
    },
  ),
  listenForSkillsChanged: vi.fn(async (listener: () => void) => {
    mocks.skillsChangedListeners.push(listener);
    return () => {
      mocks.skillsChangedCleanup();
      mocks.skillsChangedListeners = mocks.skillsChangedListeners.filter(
        (candidate) => candidate !== listener,
      );
    };
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function emitSkillsChanged() {
  for (const listener of [...mocks.skillsChangedListeners]) listener();
}

describe("InstalledPage", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    await setLanguage("zh");
    mocks.listSkills.mockResolvedValue(skills);
    mocks.skillReferenceDetails.mockResolvedValue([]);
    mocks.updateSkill.mockResolvedValue({ ...skills[0], status: "ok" });
    mocks.updateSkills.mockResolvedValue(skills.map((skill) => ({ ...skill, status: "ok" })));
    mocks.checkUpdates.mockResolvedValue(1);
    mocks.rescanLocal.mockResolvedValue(skills);
    mocks.skillReferences.mockResolvedValue([[], []]);
    mocks.deleteSkill.mockResolvedValue(undefined);
    mocks.openSkillDir.mockResolvedValue(undefined);
    mocks.openSkillGroupDir.mockResolvedValue(undefined);
    mocks.openUrl.mockResolvedValue(undefined);
    mocks.skillsChangedListeners = [];
  });

  it("loads skills via the api and renders them", async () => {
    const wrapper = mount(InstalledPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("brainstorming");
    expect(wrapper.text()).toContain("tdd");
    expect(mocks.listSkills).toHaveBeenCalled();
  });

  it("reloads skills when the backend reports a change", async () => {
    const currentSkills: ListedSkill[] = skills.map((skill) => ({ ...skill, status: "ok" }));
    mocks.listSkills.mockResolvedValueOnce(currentSkills);

    const wrapper = mount(InstalledPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("brainstorming");

    mocks.listSkills.mockResolvedValue(skills);
    emitSkillsChanged();
    await flushPromises();

    expect(wrapper.text()).toContain("brainstorming");
  });

  it("stops listening for backend changes when unmounted", async () => {
    const wrapper = mount(InstalledPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(mocks.skillsChangedListeners.length).toBeGreaterThan(0);
    wrapper.unmount();
    expect(mocks.skillsChangedCleanup).toHaveBeenCalled();
  });

  it("explains trash recovery before deleting a local skill", async () => {
    mocks.listSkills.mockResolvedValue([localSkill]);
    const wrapper = mount(InstalledPage, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await flushPromises();

    const deleteBtn = wrapper.findAll("button").find((b) => b.attributes("aria-label")?.includes("删除") || b.text().includes("删除"));
    expect(deleteBtn).toBeDefined();
    await deleteBtn!.trigger("click");
    await flushPromises();

    expect(document.body.textContent).toMatch(/将移动到存储目录的 trash 文件夹/);

    const confirmBtn = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "确认" || b.textContent?.trim() === "删除");
    expect(confirmBtn).toBeDefined();
    confirmBtn!.click();
    await flushPromises();

    expect(mocks.deleteSkill).toHaveBeenCalledWith(localSkill.id);
    wrapper.unmount();
  });

  it("groups skills by repository in tree view and allows collapsing and expanding", async () => {
    const wrapper = mount(InstalledPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    // Group header displays repository name
    const repoHeader = wrapper.findAll('[role="button"]').find((b) => b.text().includes("obra/superpowers"));
    expect(repoHeader).toBeDefined();
    expect(wrapper.text()).toContain("brainstorming");

    // Collapse
    await repoHeader!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("brainstorming");

    // Expand
    await repoHeader!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("brainstorming");
  });

  it("allows switching between tree view and flat list view", async () => {
    const wrapper = mount(InstalledPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("obra/superpowers");

    // Switch to flat view
    const flatBtn = wrapper.findAll("button").find((b) => b.text().includes("平铺") || b.attributes("aria-label")?.includes("平铺"));
    expect(flatBtn).toBeDefined();
    await flatBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("brainstorming");

    // Switch back to tree view
    const treeBtn = wrapper.findAll("button").find((b) => b.text().includes("树状") || b.attributes("aria-label")?.includes("树状"));
    expect(treeBtn).toBeDefined();
    await treeBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("obra/superpowers");
  });

  it("reflects background update check in refresh button", async () => {
    const store = useSkillUpdateStore();
    const wrapper = mount(InstalledPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const refreshBtn = wrapper.find('button[aria-label="检测 Skill 更新"]');
    expect(refreshBtn.exists()).toBe(true);
    expect(refreshBtn.attributes("aria-busy")).toBe("false");

    store.isChecking = true;
    await flushPromises();

    expect(refreshBtn.attributes("aria-busy")).toBe("true");
    expect(refreshBtn.attributes("disabled")).toBeDefined();
  });
});
