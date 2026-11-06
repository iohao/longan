import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import i18n, { setLanguage } from "@/i18n";
import type { EffectiveSkill, Preset, Project, Skill } from "@/types";
import { saveProjectDetailTab } from "@/utils/navigation";
import ProjectDetailPage from "./ProjectDetailPage.vue";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<() => Promise<string | null>>(async () => null),
  setSetting: vi.fn(async () => undefined),
  getProject: vi.fn(),
  listPresets: vi.fn(),
  listProjects: vi.fn(async () => []),
  listProjectGroups: vi.fn(async () => []),
  listAgents: vi.fn(),
  rescanLocal: vi.fn(),
  effectiveSkills: vi.fn(),
  openPath: vi.fn(),
  syncProject: vi.fn(),
  getProjectSyncReport: vi.fn(),
  setProjectSkillInstallMode: vi.fn(),
  gitignoreLinks: vi.fn(),
  setProjectSkill: vi.fn(),
  setProjectPreset: vi.fn(),
}));

vi.mock("@/api", () => ({
  api: mocks,
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "7" } }),
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}));

const project: Project = {
  id: 7,
  name: "Demo",
  path: "/tmp/demo",
  created_at: "",
  path_exists: true,
  group_id: 0,
  hidden: false,
  preset_ids: [1],
  skill_ids: [10],
  agent_ids: [],
  skill_install_mode: "symlink",
};

const presets: Preset[] = [
  {
    id: 1,
    name: "A",
    description: null,
    created_at: "",
    skill_ids: [10, 21, 22, 31, 32, 40],
    direct_skill_ids: [10],
    included_preset_ids: [2],
    reference_count: 0,
  },
  {
    id: 2,
    name: "B",
    description: null,
    created_at: "",
    skill_ids: [21, 22, 31, 32, 40],
    direct_skill_ids: [21, 22, 40],
    included_preset_ids: [3],
    reference_count: 0,
  },
  {
    id: 3,
    name: "C",
    description: null,
    created_at: "",
    skill_ids: [31, 32, 40],
    direct_skill_ids: [31, 32, 40],
    included_preset_ids: [],
    reference_count: 0,
  },
];

function skill(id: number, name: string, overrides: Partial<Skill> = {}): Skill {
  return {
    id,
    name,
    source_type: "local",
    owner: null,
    repo: null,
    dir_path: `local/${name}`,
    description: null,
    latest_sha: null,
    status: "ok",
    updated_at: "",
    ...overrides,
  };
}

const skills = [
  skill(10, "DIRECT-SKILL", {
    source_type: "net",
    owner: "acme",
    repo: "direct-skills",
    source_url: "acme/direct-skills/DIRECT-SKILL",
  }),
  skill(21, "B-1-SKILL", {
    source_type: "net",
    owner: "acme",
    repo: "preset-skills",
    source_url: "acme/preset-skills/B-1-SKILL",
  }),
  skill(22, "B-2-SKILL"),
  skill(31, "C-1-SKILL"),
  skill(32, "C-2-SKILL"),
  skill(40, "SHARED-SKILL"),
];

const effective: EffectiveSkill[] = [
  { skill_id: 10, name: "DIRECT-SKILL", dir_path: "local/DIRECT-SKILL", via: "direct", conflicted: false },
  { skill_id: 21, name: "B-1-SKILL", dir_path: "local/B-1-SKILL", via: "A", conflicted: false },
  { skill_id: 22, name: "B-2-SKILL", dir_path: "local/B-2-SKILL", via: "A", conflicted: false },
  { skill_id: 31, name: "C-1-SKILL", dir_path: "local/C-1-SKILL", via: "A", conflicted: false },
  { skill_id: 32, name: "C-2-SKILL", dir_path: "local/C-2-SKILL", via: "A", conflicted: true },
  { skill_id: 40, name: "SHARED-SKILL", dir_path: "local/SHARED-SKILL", via: "A", conflicted: false },
];

function mountPage(overrides: Record<string, unknown> = {}) {
  const onBack = vi.fn();
  const wrapper = mount(ProjectDetailPage, {
    props: {
      projectId: project.id,
      onBack,
      ...overrides,
    },
    global: {
      plugins: [i18n],
    },
  });
  return { wrapper, onBack };
}

describe("ProjectDetailPage", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    sessionStorage.clear();
    await setLanguage("zh");
    mocks.getProject.mockResolvedValue(project);
    mocks.listPresets.mockResolvedValue(presets);
    mocks.listAgents.mockResolvedValue([]);
    mocks.rescanLocal.mockResolvedValue(skills);
    mocks.effectiveSkills.mockResolvedValue(effective);
    mocks.openPath.mockResolvedValue(undefined);
    mocks.syncProject.mockResolvedValue({ created: [], removed: [] });
    mocks.getProjectSyncReport.mockResolvedValue(null);
    mocks.setProjectSkillInstallMode.mockResolvedValue({ created: [], updated: ["DIRECT-SKILL"], removed: [], conflicts: [], project_path_missing: false });
    mocks.gitignoreLinks.mockResolvedValue(undefined);
    mocks.setProjectSkill.mockResolvedValue({ created: [], removed: [] });
    mocks.setProjectPreset.mockResolvedValue({ created: [], removed: [] });
  });

  it("defaults to project actions and switches panels", async () => {
    const { wrapper } = mountPage();
    await flushPromises();

    const operationsTab = wrapper.find("#project-detail-tab-operations");
    const skillsTab = wrapper.find("#project-detail-tab-skills");
    expect(operationsTab.attributes("aria-selected")).toBe("true");

    const operationsPanel = wrapper.find("#project-detail-panel-operations");
    expect(operationsPanel.attributes("hidden")).toBeUndefined();

    await skillsTab.trigger("click");
    await flushPromises();

    expect(skillsTab.attributes("aria-selected")).toBe("true");
    const skillsPanel = wrapper.find("#project-detail-panel-skills");
    expect(skillsPanel.attributes("hidden")).toBeUndefined();
    expect(operationsPanel.attributes("hidden")).toBeDefined();
  });

  it.each(["zh", "en"] as const)("renders mode settings with matching tab and section labels in %s", async (language) => {
    await setLanguage(language);
    saveProjectDetailTab(project.id, "settings");
    const { wrapper } = mountPage();
    await flushPromises();
    const tab = wrapper.get("#project-detail-tab-settings");
    const panel = wrapper.get("#project-detail-panel-settings");
    expect(tab.attributes("aria-selected")).toBe("true");
    expect(panel.get("h2").text()).toBe(tab.text());
    expect(panel.get<HTMLInputElement>('input[value="symlink"]').element.checked).toBe(true);
    expect(panel.get('button[type="submit"]').attributes("disabled")).toBeDefined();
  });

  it("applies copy mode only on submission and reloads the saved project", async () => {
    const onReloadProjects = vi.fn(async () => undefined);
    const { wrapper } = mountPage({ onReloadProjects });
    await flushPromises();
    await wrapper.get("#project-detail-tab-settings").trigger("click");
    await wrapper.get('input[value="copy"]').setValue();
    expect(mocks.setProjectSkillInstallMode).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("生成 / 更新 AI 协作说明");
    mocks.getProject.mockResolvedValue({ ...project, skill_install_mode: "copy" });
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.setProjectSkillInstallMode).toHaveBeenCalledExactlyOnceWith(project.id, "copy");
    expect(onReloadProjects).toHaveBeenCalledOnce();
    expect(wrapper.get('input[value="copy"]').element).toHaveProperty("checked", true);
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    expect(wrapper.text()).not.toContain("生成 / 更新 AI 协作说明");
    expect(wrapper.get("#project-detail-panel-settings").findAll("h2")).toHaveLength(1);
    expect(wrapper.text()).toContain("复制模式会自动生成并随同步维护 AGENTS.md");
  });

  it.each(["zh", "en"] as const)("shows automatic guidance instructions without a separate action in %s", async (language) => {
    await setLanguage(language);
    mocks.getProject.mockResolvedValue({ ...project, skill_install_mode: "copy" });
    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get("#project-detail-tab-settings").trigger("click");
    const panel = wrapper.get("#project-detail-panel-settings");
    expect(panel.findAll("h2")).toHaveLength(1);
    expect(panel.findAll("button")).toHaveLength(1);
    expect(panel.text()).toContain("AGENTS.md");
    expect(panel.text()).toContain(".agents/longan.md");
    expect(mocks.setProjectSkillInstallMode).not.toHaveBeenCalled();
  });

  it("preserves copy mode when guidance cleanup fails and allows retrying the switch", async () => {
    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get("#project-detail-tab-settings").trigger("click");
    expect(wrapper.text()).not.toContain("生成 / 更新 AI 协作说明");
    mocks.getProject.mockResolvedValue({ ...project, skill_install_mode: "copy" });
    await wrapper.get('input[value="copy"]').setValue();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('input[value="copy"]').element).toHaveProperty("checked", true);
    mocks.setProjectSkillInstallMode.mockRejectedValueOnce(new Error("AI guidance cleanup blocked"));
    await wrapper.get('input[value="symlink"]').setValue();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("AI guidance cleanup blocked");
    await wrapper.get('input[value="copy"]').setValue();
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    await wrapper.get('input[value="symlink"]').setValue();
    mocks.getProject.mockResolvedValue(project);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).not.toContain("生成 / 更新 AI 协作说明");
    expect(wrapper.get('input[value="symlink"]').element).toHaveProperty("checked", true);
  });

  it("disables conversion while pending and preserves the saved mode after a conflict", async () => {
    mocks.getProjectSyncReport.mockResolvedValue({ created: [], updated: ["demo"], removed: [], conflicts: [], project_path_missing: false });
    let rejectConversion!: (error: Error) => void;
    mocks.setProjectSkillInstallMode.mockImplementationOnce(() => new Promise((_, reject) => { rejectConversion = reject; }));
    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get("#project-detail-tab-settings").trigger("click");
    await wrapper.get('input[value="copy"]').setValue();
    await wrapper.get("form").trigger("submit");
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.get("fieldset").attributes("disabled")).toBeDefined();
    await wrapper.get("form").trigger("submit");
    expect(mocks.setProjectSkillInstallMode).toHaveBeenCalledOnce();
    rejectConversion(new Error(".claude/skills/demo: project copy was modified"));
    await flushPromises();
    expect(wrapper.text()).toContain(".claude/skills/demo");
    expect(wrapper.get("fieldset").attributes("disabled")).toBeUndefined();
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeUndefined();
    await wrapper.get('input[value="symlink"]').setValue();
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
  });

  it("blocks conversion when the project path is missing", async () => {
    mocks.getProject.mockResolvedValue({ ...project, path_exists: false });
    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get("#project-detail-tab-settings").trigger("click");
    expect(wrapper.get("fieldset").attributes("disabled")).toBeDefined();
    await wrapper.get("form").trigger("submit");
    expect(mocks.setProjectSkillInstallMode).not.toHaveBeenCalled();
  });

  it("hides the previous project's settings while a different project is loading", async () => {
    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get("#project-detail-tab-settings").trigger("click");
    let finishLoading!: (value: Project) => void;
    mocks.getProject.mockImplementationOnce(() => new Promise((resolve) => { finishLoading = resolve; }));
    await wrapper.setProps({ projectId: 8 });
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.text()).not.toContain(project.name);
    finishLoading({ ...project, id: 8, name: "Other project", skill_install_mode: "copy" });
    await flushPromises();
    await wrapper.get("#project-detail-tab-settings").trigger("click");
    expect(wrapper.get('input[value="copy"]').element).toHaveProperty("checked", true);
    expect(mocks.setProjectSkillInstallMode).not.toHaveBeenCalled();
  });

  it("shows persisted automatic sync conflicts after loading the project", async () => {
    mocks.getProjectSyncReport.mockResolvedValue({
      created: [], updated: ["demo"], removed: [], project_path_missing: false,
      conflicts: [".claude/skills/demo: project copy was modified"],
    });
    const { wrapper } = mountPage();
    await flushPromises();
    const banner = wrapper.get('[role="status"]');
    expect(banner.text()).toContain("更新 1");
    expect(banner.text()).toContain("同步后有部分事项需要处理");
    expect(banner.text()).toContain(".claude/skills/demo");
  });

  it("supports arrow, Home, and End keyboard navigation", async () => {
    const { wrapper } = mountPage();
    await flushPromises();

    const operationsTab = wrapper.find("#project-detail-tab-operations");
    await operationsTab.trigger("keydown", { key: "ArrowRight" });
    await flushPromises();

    const skillsTab = wrapper.find("#project-detail-tab-skills");
    expect(skillsTab.attributes("aria-selected")).toBe("true");

    await skillsTab.trigger("keydown", { key: "End" });
    await flushPromises();

    const settingsTab = wrapper.find("#project-detail-tab-settings");
    expect(settingsTab.attributes("aria-selected")).toBe("true");

    await settingsTab.trigger("keydown", { key: "Home" });
    await flushPromises();

    expect(operationsTab.attributes("aria-selected")).toBe("true");
  });

  it("restores the active tab after a document reload", async () => {
    saveProjectDetailTab(project.id, "skills");

    const { wrapper } = mountPage();
    await flushPromises();

    const skillsTab = wrapper.find("#project-detail-tab-skills");
    expect(skillsTab.attributes("aria-selected")).toBe("true");
  });

  it("keeps project actions working inside the actions panel", async () => {
    const { wrapper } = mountPage();
    await flushPromises();

    const openBtn = wrapper.findAll("button").find((b) => b.text().includes("打开目录"));
    expect(openBtn).toBeDefined();
    await openBtn!.trigger("click");
    await flushPromises();
    expect(mocks.openPath).toHaveBeenCalledWith(project.path);

    const syncBtn = wrapper.findAll("button").find((b) => b.text().includes("重新同步"));
    expect(syncBtn).toBeDefined();
    await syncBtn!.trigger("click");
    await flushPromises();
    expect(mocks.syncProject).toHaveBeenCalledWith(project.id);

    const gitignoreBtn = wrapper.findAll("button").find((b) => b.text().includes("加入 .gitignore"));
    expect(gitignoreBtn).toBeDefined();
    await gitignoreBtn!.trigger("click");
    await flushPromises();
    expect(mocks.gitignoreLinks).toHaveBeenCalledWith(project.id);
  });

  it("stays on the direct skills tab when adding or removing skills", async () => {
    const emptyProject = { ...project, preset_ids: [], skill_ids: [] };
    const linkedProject = { ...emptyProject, skill_ids: [10] };
    mocks.getProject
      .mockResolvedValueOnce(emptyProject)
      .mockResolvedValue(linkedProject);
    mocks.listPresets.mockResolvedValue([]);
    mocks.effectiveSkills
      .mockResolvedValueOnce([])
      .mockResolvedValue([effective[0]]);

    const { wrapper } = mountPage();
    await flushPromises();

    const skillsTab = wrapper.find("#project-detail-tab-skills");
    await skillsTab.trigger("click");
    await flushPromises();

    const directSkillBtn = wrapper.findAll("button").find((b) => b.text().includes("DIRECT-SKILL"));
    expect(directSkillBtn).toBeDefined();
    await directSkillBtn!.trigger("click");
    await flushPromises();

    expect(mocks.setProjectSkill).toHaveBeenCalledWith(project.id, 10, true);
    expect(skillsTab.attributes("aria-selected")).toBe("true");
  });

  it("uses the shared SVG source action for direct and inherited skills", async () => {
    const { wrapper } = mountPage();
    await flushPromises();

    const sourceButtons = wrapper.findAll('button[title="打开 skills 源页面"]');
    expect(sourceButtons.length).toBeGreaterThanOrEqual(1);
    for (const btn of sourceButtons) {
      expect(btn.find("svg").exists()).toBe(true);
      expect(btn.find("img").exists()).toBe(false);
    }
  });

  it("groups inherited skills by concrete preset with deeper sources first", async () => {
    const { wrapper } = mountPage();
    await flushPromises();

    const sectionHeadings = wrapper.findAll("h4").map((h) => h.text().trim());
    expect(sectionHeadings).toContain("C");
    expect(sectionHeadings).toContain("B");

    expect(wrapper.text()).toContain("C-1-SKILL");
    expect(wrapper.text()).toContain("C-2-SKILL");
    expect(wrapper.text()).toContain("SHARED-SKILL");
    expect(wrapper.text()).toContain("同名冲突，未链接");
  });

  it("renders preset tags according to the saved display order", async () => {
    mocks.getSetting.mockResolvedValue(JSON.stringify([3, 1, 2]));

    const { wrapper } = mountPage();
    await flushPromises();

    const presetSectionHeading = wrapper.findAll("h2").find((h) => h.text().includes("Preset 标签"));
    expect(presetSectionHeading).toBeDefined();

    const buttons = wrapper
      .findAll(".flex.flex-wrap.gap-2 button")
      .map((b) => b.findAll("span")[0]?.text().trim())
      .filter(Boolean);

    expect(buttons).toEqual(["C", "A", "B"]);
  });

  it("renders inherited preset tags with sky dashed border, tooltip and composite count badge", async () => {
    const { wrapper } = mountPage();
    await flushPromises();

    // Check composite badge
    const badge = wrapper.find(".flex.items-center.justify-between.mb-3 span");
    expect(badge.text()).toBe("Preset 标签");
    expect(wrapper.text()).toContain("1 直接 · 2 继承");

    // Check Preset A (id 1, directly selected)
    const buttonA = wrapper.findAll(".flex.flex-wrap.gap-2 button").find((b) => b.text().includes("A"));
    expect(buttonA).toBeDefined();
    expect(buttonA!.classes()).toContain("border-emerald-500/50");
    expect(buttonA!.classes()).not.toContain("border-dashed");
    expect(buttonA!.attributes("title")).toBeUndefined();
    expect(buttonA!.find("svg").exists()).toBe(false);

    // Check Preset B (id 2, inherited from A)
    const buttonB = wrapper.findAll(".flex.flex-wrap.gap-2 button").find((b) => b.text().includes("B"));
    expect(buttonB).toBeDefined();
    expect(buttonB!.classes()).toContain("border-dashed");
    expect(buttonB!.classes()).toContain("border-sky-500/60");
    expect(buttonB!.attributes("title")).toBe("继承自：A");
    expect(buttonB!.find("svg").exists()).toBe(false);

    // Check Preset C (id 3, inherited from A via B)
    const buttonC = wrapper.findAll(".flex.flex-wrap.gap-2 button").find((b) => b.text().includes("C"));
    expect(buttonC).toBeDefined();
    expect(buttonC!.classes()).toContain("border-dashed");
    expect(buttonC!.classes()).toContain("border-sky-500/60");
    expect(buttonC!.attributes("title")).toBe("继承自：A");

    // Clicking inherited Preset B triggers promotion to directly selected
    await buttonB!.trigger("click");
    await flushPromises();
    expect(mocks.setProjectPreset).toHaveBeenCalledWith(project.id, 2, true);
  });
});
