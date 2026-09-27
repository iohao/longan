import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import i18n, { setLanguage } from "@/i18n";
import type { ExportProfile, ImportResult, ProfileImportPreview } from "@/types";
import MigrationPage from "./MigrationPage.vue";

const profile: ExportProfile = {
  version: "2.0",
  export_date: "2026-07-29T12:00:00+08:00",
  skills: [],
  presets: [
    {
      name: "frontend",
      description: null,
      direct_skill_refs: [],
      included_preset_names: [],
    },
  ],
};
const profileJson = JSON.stringify(profile);

const preview: ProfileImportPreview = {
  version: "2.0",
  export_date: profile.export_date,
  matched_skills: [{ name: "Installed", dir_path: "net/owner/repo/installed" }],
  missing_skills: [{ name: "Missing", dir_path: "local/missing" }],
  new_presets: ["new"],
  replaced_presets: ["existing"],
  unresolved_preset_skills: [{ preset_name: "new", skill_ref: "local/missing" }],
};

const importResult: ImportResult = {
  success: true,
  imported_skills: [],
  skipped_skills: ["Installed"],
  installed_from_source: [],
  created_presets: ["existing", "new"],
  unresolved_preset_skills: ["new: local/missing"],
  error: null,
};

const mocks = vi.hoisted(() => ({
  exportProfile: vi.fn(),
  saveFileDialog: vi.fn(),
  saveProfileFile: vi.fn(),
  revealFile: vi.fn(),
  previewProfileImport: vi.fn(),
  importProfile: vi.fn(),
}));

vi.mock("@/api", () => ({
  api: {
    exportProfile: mocks.exportProfile,
    saveFileDialog: mocks.saveFileDialog,
    saveProfileFile: mocks.saveProfileFile,
    revealFile: mocks.revealFile,
    previewProfileImport: mocks.previewProfileImport,
    importProfile: mocks.importProfile,
    getSetting: vi.fn(async () => null),
    setSetting: vi.fn(async () => undefined),
  },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("MigrationPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setLanguage("zh");
    mocks.exportProfile.mockResolvedValue(profileJson);
    mocks.saveFileDialog.mockResolvedValue("/tmp/longan-profile.json");
    mocks.saveProfileFile.mockResolvedValue(undefined);
    mocks.revealFile.mockResolvedValue(undefined);
    mocks.previewProfileImport.mockResolvedValue(preview);
    mocks.importProfile.mockResolvedValue(importResult);
  });

  it("saves the exact export snapshot and reveals the saved file", async () => {
    const wrapper = mount(MigrationPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const saveButton = wrapper.findAll("button").find((b) => b.text().includes("保存配置文件"));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger("click");
    await flushPromises();

    expect(mocks.exportProfile).toHaveBeenCalledTimes(1);
    expect(mocks.saveFileDialog).toHaveBeenCalledWith({
      title: "保存配置文件",
      defaultPath: expect.stringMatching(/^longan-profile-\d{4}-\d{2}-\d{2}\.json$/),
      filters: [{ name: "Longan JSON 配置文件", extensions: ["json"] }],
    });
    expect(mocks.saveProfileFile).toHaveBeenCalledWith("/tmp/longan-profile.json", profileJson);
    expect(wrapper.text()).toContain("配置文件已保存");
    expect(wrapper.text()).toContain("/tmp/longan-profile.json");

    const revealBtn = wrapper.findAll("button").find((b) => b.text().includes("打开所在目录"));
    expect(revealBtn).toBeDefined();
    await revealBtn!.trigger("click");
    await flushPromises();

    expect(mocks.revealFile).toHaveBeenCalledWith("/tmp/longan-profile.json");
  });

  it("treats save dialog cancellation as a no-op", async () => {
    mocks.saveFileDialog.mockResolvedValueOnce(null);

    const wrapper = mount(MigrationPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const saveButton = wrapper.findAll("button").find((b) => b.text().includes("保存配置文件"));
    await saveButton!.trigger("click");
    await flushPromises();

    expect(mocks.saveProfileFile).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("配置文件已保存");
  });

  it("reports profile file write failures without showing success", async () => {
    mocks.saveProfileFile.mockRejectedValueOnce("disk full");

    const wrapper = mount(MigrationPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const saveButton = wrapper.findAll("button").find((b) => b.text().includes("保存配置文件"));
    await saveButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("disk full");
    expect(wrapper.text()).not.toContain("配置文件已保存");
  });

  it("keeps the saved path visible when revealing the file fails", async () => {
    mocks.revealFile.mockRejectedValueOnce("file manager unavailable");

    const wrapper = mount(MigrationPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const saveButton = wrapper.findAll("button").find((b) => b.text().includes("保存配置文件"));
    await saveButton!.trigger("click");
    await flushPromises();

    const revealBtn = wrapper.findAll("button").find((b) => b.text().includes("打开所在目录"));
    await revealBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("file manager unavailable");
    expect(wrapper.text()).toContain("/tmp/longan-profile.json");
  });

  it("previews matched, missing, new, and replaced profile data", async () => {
    const wrapper = mount(MigrationPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    // Switch to import mode
    const importTabBtn = wrapper.findAll("button").find((b) => b.text().includes("导入配置"));
    expect(importTabBtn).toBeDefined();
    await importTabBtn!.trigger("click");
    await flushPromises();

    const file = new File([profileJson], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => profileJson });

    const input = wrapper.find('input[type="file"]');
    expect(input.exists()).toBe(true);

    Object.defineProperty(input.element, "files", {
      value: [file],
      writable: true,
    });
    await input.trigger("change");
    await flushPromises();

    expect(wrapper.text()).toContain("Installed");
    expect(wrapper.text()).toContain("Missing");
    expect(wrapper.text()).toContain("existing");
    expect(wrapper.text()).toContain("导入并覆盖 2 个 Preset");
    expect(mocks.previewProfileImport).toHaveBeenCalledWith(profileJson);
  });

  it("imports the previewed profile and calls onProfileImported", async () => {
    const onProfileImported = vi.fn();
    const wrapper = mount(MigrationPage, {
      props: { onProfileImported },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const importTabBtn = wrapper.findAll("button").find((b) => b.text().includes("导入配置"));
    await importTabBtn!.trigger("click");
    await flushPromises();

    const file = new File([profileJson], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => profileJson });

    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      value: [file],
      writable: true,
    });
    await input.trigger("change");
    await flushPromises();

    const importBtn = wrapper.findAll("button").find((b) => b.text().includes("导入并覆盖 2 个 Preset"));
    expect(importBtn).toBeDefined();
    await importBtn!.trigger("click");
    await flushPromises();

    expect(onProfileImported).toHaveBeenCalled();
    expect(mocks.importProfile).toHaveBeenCalledWith(profileJson);
    expect(wrapper.text()).toContain("配置导入完成");
    expect(wrapper.text()).toContain("1 个关联未能恢复");
  });

  it("rejects non-JSON files before calling the preview command", async () => {
    const wrapper = mount(MigrationPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const importTabBtn = wrapper.findAll("button").find((b) => b.text().includes("导入配置"));
    await importTabBtn!.trigger("click");
    await flushPromises();

    const file = new File(["not json"], "notes.txt", { type: "text/plain" });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      value: [file],
      writable: true,
    });
    await input.trigger("change");
    await flushPromises();

    expect(wrapper.text()).toContain("请选择 .json 配置文件");
    expect(mocks.previewProfileImport).not.toHaveBeenCalled();
  });
});
