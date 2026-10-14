import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import i18n from "@/i18n";
import SkillSourceActions from "./SkillSourceActions.vue";

const mocks = vi.hoisted(() => ({
  openSkillDir: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock("@/api", () => ({
  api: { openSkillDir: mocks.openSkillDir },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrl,
}));

const netSkill = {
  id: 7,
  source_type: "net" as const,
  owner: "acme",
  repo: "toolbox",
  source_url: "  acme/toolbox/example  ",
};

describe("SkillSourceActions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (i18n.global.locale as any).value = "en";
    mocks.openSkillDir.mockResolvedValue(undefined);
    mocks.openUrl.mockResolvedValue(undefined);
  });

  it("renders and runs the shared source actions", async () => {
    const wrapper = mount(SkillSourceActions, {
      props: { skill: netSkill },
      slots: {
        default: `<button type="button" aria-label="Extra action">Extra</button>`,
      },
      global: { plugins: [i18n] },
    });

    const sourceBtn = wrapper.find('[aria-label="Open Skills Source Page"]');
    expect(sourceBtn.exists()).toBe(true);
    expect(sourceBtn.find("svg").exists()).toBe(true);
    expect(sourceBtn.find("img").exists()).toBe(false);

    const extraBtn = wrapper.find('[aria-label="Extra action"]');
    expect(extraBtn.exists()).toBe(true);

    await sourceBtn.trigger("click");
    expect(mocks.openUrl).toHaveBeenCalledWith("https://skills.sh/acme/toolbox/example");

    const githubBtn = wrapper.find('[aria-label="Open GitHub Repository"]');
    await githubBtn.trigger("click");
    expect(mocks.openUrl).toHaveBeenCalledWith("https://github.com/acme/toolbox");

    const dirBtn = wrapper.find('[aria-label="Open Local Directory"]');
    await dirBtn.trigger("click");
    expect(mocks.openSkillDir).toHaveBeenCalledWith(7);
  });

  it("keeps the local directory action when source metadata is unavailable", () => {
    const wrapper = mount(SkillSourceActions, {
      props: { skill: { id: 9 } },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[aria-label="Open Skills Source Page"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Open GitHub Repository"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Open Local Directory"]').exists()).toBe(true);
  });

  it("reports action failures through the shared error callback", async () => {
    mocks.openUrl.mockRejectedValueOnce(new Error("cannot open"));

    const wrapper = mount(SkillSourceActions, {
      props: { skill: netSkill },
      global: { plugins: [i18n] },
    });

    await wrapper.find('[aria-label="Open Skills Source Page"]').trigger("click");
    await Promise.resolve();

    expect(wrapper.emitted("error")).toBeTruthy();
    expect(wrapper.emitted("error")![0]).toEqual(["Error: cannot open"]);
  });

  it("hides GitHub repository action when hideRepoActions is true but retains directory action", () => {
    const wrapper = mount(SkillSourceActions, {
      props: { skill: netSkill, hideRepoActions: true },
      slots: {
        default: `<button type="button" aria-label="Delete action">Delete</button>`,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[aria-label="Open Skills Source Page"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Open GitHub Repository"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Open Local Directory"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Delete action"]').exists()).toBe(true);
  });

  it("navigates to the subdirectory on GitHub when source_path is present", async () => {
    const githubSkill = {
      id: 10,
      source_type: "net" as const,
      owner: "focus-creative-games",
      repo: "luban",
      install_source: "github" as const,
      source_path: "ai/skills/luban-add-table",
    };

    const wrapper = mount(SkillSourceActions, {
      props: { skill: githubSkill },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[aria-label="Open Skills Source Page"]').exists()).toBe(false);
    const githubBtn = wrapper.find('[aria-label="Open GitHub Repository"]');
    await githubBtn.trigger("click");

    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://github.com/focus-creative-games/luban/tree/HEAD/ai/skills/luban-add-table",
    );
  });

  it("does not show skills.sh button when install_source is github even if source_url is populated", () => {
    const githubSkillWithLegacySourceUrl = {
      id: 11,
      source_type: "net" as const,
      owner: "focus-creative-games",
      repo: "luban",
      source_url: "focus-creative-games/luban/luban-add-table",
      install_source: "github" as const,
    };

    const wrapper = mount(SkillSourceActions, {
      props: { skill: githubSkillWithLegacySourceUrl },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[aria-label="Open Skills Source Page"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Open GitHub Repository"]').exists()).toBe(true);
  });

  it("retains GitHub repository action when hideRepoActions is true if the skill has no skills.sh page", () => {
    const archifySkill = {
      id: 3598,
      source_type: "net" as const,
      owner: "tt-a1i",
      repo: "archify",
      install_source: "github" as const,
      source_path: "archify",
    };

    const wrapper = mount(SkillSourceActions, {
      props: { skill: archifySkill, hideRepoActions: true },
      slots: {
        default: `<button type="button" aria-label="Delete action">Delete</button>`,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[aria-label="Open Skills Source Page"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Open GitHub Repository"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Open Local Directory"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Delete action"]').exists()).toBe(true);
  });
});

