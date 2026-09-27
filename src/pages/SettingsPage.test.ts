import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import i18n, { setLanguage } from "@/i18n";
import SettingsPage from "./SettingsPage.vue";

const mocks = vi.hoisted(() => ({
  writeText: vi.fn(),
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
  verifyGithubToken: vi.fn(async () => true),
  getStorageDir: vi.fn(async () => ({
    configuredDir: "",
    currentDir: "/tmp/longan",
    isDefault: true,
    restartRequired: false,
  })),
}));

vi.mock("@/api", () => ({
  api: mocks,
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

describe("SettingsPage", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    await setLanguage("zh");
    mocks.writeText.mockResolvedValue(undefined);
    mocks.getSetting.mockResolvedValue(null);
    mocks.setSetting.mockResolvedValue(undefined);
    mocks.verifyGithubToken.mockResolvedValue(true);
    mocks.getStorageDir.mockResolvedValue({
      configuredDir: "",
      currentDir: "/tmp/longan",
      isDefault: true,
      restartRequired: false,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  it("copies a localized repository introduction when sharing", async () => {
    const wrapper = mount(SettingsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const shareBtn = wrapper.findAll("button").find((b) => b.text().includes("分享"));
    expect(shareBtn).toBeDefined();
    await shareBtn!.trigger("click");

    expect(mocks.writeText).toHaveBeenCalledWith(
      "推荐一个开源的 AI Agent Skill 管理工具。\n\n" +
        "集中安装和管理 Skill，支持 Preset 预设组合，并按项目同步所需 Skill；一份存储，多项目复用，减少重复文件。\n\n" +
        "GitHub：https://github.com/iohao/longan",
    );
  });

  it("renders the About section heading", async () => {
    const wrapper = mount(SettingsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("关于");
  });

  it("exposes Debug Mode toggle", async () => {
    const wrapper = mount(SettingsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Debug Mode");
  });

  it("uses eye icons to show the current token visibility", async () => {
    const wrapper = mount(SettingsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const tokenInput = wrapper.find('input[placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"]');
    expect(tokenInput.attributes("type")).toBe("password");

    const toggleVisibilityBtn = wrapper.find('button[aria-label="显示令牌"]');
    expect(toggleVisibilityBtn.exists()).toBe(true);
    await toggleVisibilityBtn.trigger("click");

    expect(tokenInput.attributes("type")).toBe("text");
    expect(wrapper.find('button[aria-label="隐藏令牌"]').exists()).toBe(true);
  });

  it("validates and reports a valid GitHub token when saving", async () => {
    const wrapper = mount(SettingsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const tokenInput = wrapper.find('input[placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"]');
    await tokenInput.setValue("  ghp_valid  ");

    const saveButtons = wrapper.findAll("button").filter((b) => b.text() === "保存");
    expect(saveButtons.length).toBeGreaterThan(0);
    await saveButtons[0].trigger("click");
    await flushPromises();

    expect(mocks.verifyGithubToken).toHaveBeenCalledWith("ghp_valid");
    expect(mocks.setSetting).toHaveBeenCalledWith("github_token", "ghp_valid");
    expect(wrapper.text()).toContain("令牌有效");
  });

  it("reports an invalid GitHub token when saving", async () => {
    mocks.verifyGithubToken.mockResolvedValueOnce(false);

    const wrapper = mount(SettingsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const tokenInput = wrapper.find('input[placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"]');
    await tokenInput.setValue("ghp_invalid");

    const saveButtons = wrapper.findAll("button").filter((b) => b.text() === "保存");
    await saveButtons[0].trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("令牌无效");
    expect(mocks.verifyGithubToken).toHaveBeenCalledWith("ghp_invalid");
    expect(mocks.setSetting).not.toHaveBeenCalledWith("github_token", "ghp_invalid");
  });

  it("does not save a GitHub token when verification fails with exception", async () => {
    mocks.verifyGithubToken.mockRejectedValueOnce(new Error("Token expired"));

    const wrapper = mount(SettingsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const tokenInput = wrapper.find('input[placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"]');
    await tokenInput.setValue("ghp_expired");

    const saveButtons = wrapper.findAll("button").filter((b) => b.text() === "保存");
    await saveButtons[0].trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Error: Token expired");
    expect(mocks.setSetting).not.toHaveBeenCalledWith("github_token", "ghp_expired");
  });

  it("clears an empty GitHub token without validating", async () => {
    const wrapper = mount(SettingsPage, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const tokenInput = wrapper.find('input[placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"]');
    await tokenInput.setValue("");

    const saveButtons = wrapper.findAll("button").filter((b) => b.text() === "保存");
    await saveButtons[0].trigger("click");
    await flushPromises();

    expect(mocks.setSetting).toHaveBeenCalledWith("github_token", "");
    expect(mocks.verifyGithubToken).not.toHaveBeenCalled();
  });
});
