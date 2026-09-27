import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import i18n, { setLanguage } from "@/i18n";
import type { Preset, Skill } from "@/types";
import PresetsPage from "./PresetsPage.vue";

const presets: Preset[] = [
  {
    id: 1,
    name: "A",
    description: null,
    created_at: "",
    skill_ids: [21, 22, 31, 32],
    direct_skill_ids: [],
    included_preset_ids: [2],
    reference_count: 2,
  },
  {
    id: 2,
    name: "B",
    description: null,
    created_at: "",
    skill_ids: [21, 22, 31, 32],
    direct_skill_ids: [21, 22],
    included_preset_ids: [3],
    reference_count: 1,
  },
  {
    id: 3,
    name: "C",
    description: null,
    created_at: "",
    skill_ids: [31, 32],
    direct_skill_ids: [31, 32],
    included_preset_ids: [],
    reference_count: 0,
  },
];

const skills: Skill[] = [
  {
    id: 21,
    name: "B-1-SKILL",
    source_type: "local",
    owner: null,
    repo: null,
    dir_path: "local/B-1-SKILL",
    description: null,
    latest_sha: null,
    status: "ok",
    updated_at: "",
  },
  {
    id: 22,
    name: "B-2-SKILL",
    source_type: "local",
    owner: null,
    repo: null,
    dir_path: "local/B-2-SKILL",
    description: null,
    latest_sha: null,
    status: "ok",
    updated_at: "",
  },
  {
    id: 31,
    name: "C-1-SKILL",
    source_type: "local",
    owner: null,
    repo: null,
    dir_path: "local/C-1-SKILL",
    description: null,
    latest_sha: null,
    status: "ok",
    updated_at: "",
  },
  {
    id: 32,
    name: "C-2-SKILL",
    source_type: "local",
    owner: null,
    repo: null,
    dir_path: "local/C-2-SKILL",
    description: null,
    latest_sha: null,
    status: "ok",
    updated_at: "",
  },
];

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
  listPresets: vi.fn(),
  presetProjectReferences: vi.fn(),
  rescanLocal: vi.fn(),
  openSkillDir: vi.fn(),
  openUrl: vi.fn(),
  createPreset: vi.fn(),
}));

vi.mock("@/api", () => ({
  api: {
    getSetting: mocks.getSetting,
    setSetting: mocks.setSetting,
    listPresets: mocks.listPresets,
    presetProjectReferences: mocks.presetProjectReferences,
    rescanLocal: mocks.rescanLocal,
    openSkillDir: mocks.openSkillDir,
    createPreset: mocks.createPreset,
  },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrl,
}));

describe("PresetsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setLanguage("zh");
    mocks.getSetting.mockResolvedValue(null);
    mocks.setSetting.mockResolvedValue(undefined);
    mocks.listPresets.mockResolvedValue(presets);
    mocks.presetProjectReferences.mockResolvedValue([]);
    mocks.rescanLocal.mockResolvedValue(skills);
    mocks.openSkillDir.mockResolvedValue(undefined);
    mocks.openUrl.mockResolvedValue(undefined);
  });

  it("defaults the create modal to compose mode", async () => {
    const wrapper = mount(PresetsPage, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await flushPromises();

    const createBtn = wrapper.findAll("button").find((b) => b.text().includes("创建"));
    expect(createBtn).toBeDefined();
    await createBtn!.trigger("click");
    await flushPromises();

    const composeBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("组合"),
    );
    const copyBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("复制"),
    );

    expect(composeBtn?.getAttribute("aria-pressed")).toBe("true");
    expect(copyBtn?.getAttribute("aria-pressed")).toBe("false");
    wrapper.unmount();
  });

  it("presents preset composition separately from skill controls", async () => {
    const wrapper = mount(PresetsPage, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("直属 Skill");
    expect(wrapper.text()).toContain("继承 Skill");
    expect(wrapper.text()).toContain("生效 Skill");

    const reuseBtn = wrapper.findAll("button").find((b) => b.text().includes("复用 Preset"));
    expect(reuseBtn).toBeDefined();
    await reuseBtn!.trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain("从 Preset 添加到 A");
    wrapper.unmount();
  });

  it("shows a stable empty state when a preset has no linked sources", async () => {
    mocks.listPresets.mockResolvedValue([presets[2]]);
    const wrapper = mount(PresetsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("未组合其他 Preset");
  });

  it("renders deeper concrete sources first and keeps skills in their owner group", async () => {
    const wrapper = mount(PresetsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("C-1-SKILL");
    expect(wrapper.text()).toContain("C-2-SKILL");
    expect(wrapper.text()).toContain("B-1-SKILL");
    expect(wrapper.text()).toContain("B-2-SKILL");
  });

  it("opens project references modal with reference details", async () => {
    mocks.presetProjectReferences.mockResolvedValue([
      { id: 10, name: "Project One", path: "/work/project-one" },
    ]);

    const wrapper = mount(PresetsPage, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await flushPromises();

    const refBtn = wrapper.find('button[aria-label="查看 Preset「B」的项目引用"]');
    expect(refBtn.exists()).toBe(true);
    await refBtn.trigger("click");
    await flushPromises();

    expect(mocks.presetProjectReferences).toHaveBeenCalledWith(2);
    expect(document.body.textContent).toContain("引用详情：B");
    expect(document.body.textContent).toContain("Project One");
    expect(document.body.textContent).toContain("/work/project-one");
    wrapper.unmount();
  });

  it("keeps preset actions ordered and disables unavailable moves", async () => {
    const wrapper = mount(PresetsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const moveUpButtons = wrapper.findAll('button[aria-label="上移"]');
    const moveDownButtons = wrapper.findAll('button[aria-label="下移"]');

    expect(moveUpButtons[0].attributes("disabled")).toBeDefined();
    expect(moveDownButtons[moveDownButtons.length - 1].attributes("disabled")).toBeDefined();
  });
});
