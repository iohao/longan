import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Preset, Skill } from "../types";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(async () => null),
  listPresets: vi.fn(),
  presetProjectReferences: vi.fn(),
  rescanLocal: vi.fn(),
  openSkillDir: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock("../api", () => ({
  api: {
    getSetting: mocks.getSetting,
    listPresets: mocks.listPresets,
    presetProjectReferences: mocks.presetProjectReferences,
    rescanLocal: mocks.rescanLocal,
    openSkillDir: mocks.openSkillDir,
  },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrl,
}));

import "../i18n";
import PresetsPage from "./PresetsPage";

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

import i18n from "../i18n";

beforeEach(async () => {
  await i18n.changeLanguage("zh");
  mocks.getSetting.mockResolvedValue(null);
  mocks.listPresets.mockResolvedValue(presets);
  mocks.presetProjectReferences.mockResolvedValue([]);
  mocks.rescanLocal.mockResolvedValue(skills);
});

describe("PresetsPage create modal", () => {
  it("defaults the create modal to compose mode", async () => {
    const user = userEvent.setup();
    render(<PresetsPage />);

    await user.click(await screen.findByRole("button", { name: "创建" }));

    expect(screen.getByRole("button", { name: "组合" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "复制" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("PresetsPage inherited skill groups", () => {
  it("presents preset composition separately from skill controls", async () => {
    const user = userEvent.setup();
    render(<PresetsPage />);

    const summary = await screen.findByRole("region", { name: "A" });
    const directMetric = within(summary).getByText("直属 Skill").closest("div");
    const inheritedMetric = within(summary).getByText("继承 Skill").closest("div");
    const effectiveMetric = within(summary).getByText("生效 Skill").closest("div");

    expect(directMetric).toHaveTextContent("0");
    expect(inheritedMetric).toHaveTextContent("4");
    expect(effectiveMetric).toHaveTextContent("4");
    expect(within(summary).getByText("B")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Skill 配置" })).toBeInTheDocument();
    expect(screen.getByLabelText("搜索当前 Preset 的 Skill")).toBeInTheDocument();

    await user.click(within(summary).getByRole("button", { name: "复用 Preset" }));
    expect(await screen.findByRole("heading", { name: "从 Preset 添加到 A" })).toBeInTheDocument();
  });

  it("shows a stable empty state when a preset has no linked sources", async () => {
    mocks.listPresets.mockResolvedValue([presets[2]]);
    render(<PresetsPage />);

    const summary = await screen.findByRole("region", { name: "C" });
    expect(within(summary).getByText("未组合其他 Preset")).toBeInTheDocument();
  });

  it("renders deeper concrete sources first and keeps skills in their owner group", async () => {
    render(<PresetsPage />);

    const inheritedRegion = await screen.findByRole("region", { name: /继承 Skill/ });
    const sourceHeadings = within(inheritedRegion).getAllByRole("heading", { level: 6 });
    expect(sourceHeadings.map((heading) => heading.textContent)).toEqual(["C", "B"]);

    const cRegion = within(inheritedRegion).getByRole("region", { name: "C" });
    expect(within(cRegion).getByText("C-1-SKILL")).toBeInTheDocument();
    expect(within(cRegion).getByText("C-2-SKILL")).toBeInTheDocument();
    expect(within(cRegion).queryByText("B-1-SKILL")).not.toBeInTheDocument();

    const bRegion = within(inheritedRegion).getByRole("region", { name: "B" });
    expect(within(bRegion).getByText("B-1-SKILL")).toBeInTheDocument();
    expect(within(bRegion).getByText("B-2-SKILL")).toBeInTheDocument();
  });

  it("hides empty source groups and preserves filtered and total counts", async () => {
    const user = userEvent.setup();
    render(<PresetsPage />);

    await user.type(
      await screen.findByPlaceholderText("搜索 skill 名称、描述或来源…"),
      "C-1-SKILL",
    );

    const inheritedRegion = await screen.findByRole("region", { name: /继承 Skill/ });
    await waitFor(() => {
      expect(within(inheritedRegion).getByRole("region", { name: "C" })).toBeInTheDocument();
      expect(within(inheritedRegion).queryByRole("region", { name: "B" })).not.toBeInTheDocument();
    });
    expect(within(inheritedRegion).getByText("1 / 2")).toBeInTheDocument();
  });

  it("offers source, GitHub, and directory actions for network skills", async () => {
    const user = userEvent.setup();
    const networkSkill: Skill = {
      ...skills[2],
      source_type: "net",
      owner: "acme",
      repo: "skills",
      source_url: "acme/skills/c-1-skill",
    };
    const availableNetworkSkill: Skill = {
      ...skills[0],
      id: 40,
      name: "AVAILABLE-NET-SKILL",
      source_type: "net",
      owner: "acme",
      repo: "available-skills",
      source_url: "acme/available-skills/available-net-skill",
    };
    mocks.rescanLocal.mockResolvedValue([networkSkill, ...skills.slice(0, 2), skills[3], availableNetworkSkill]);

    render(<PresetsPage />);

    const inheritedRegion = await screen.findByRole("region", { name: /继承 Skill/ });
    const inheritedSkillRegion = within(inheritedRegion).getByRole("region", { name: "C" });
    const inheritedSkillRow = within(inheritedSkillRegion).getByText("C-1-SKILL").closest("div.group");
    expect(inheritedSkillRow).not.toBeNull();
    await user.click(
      within(inheritedSkillRow as HTMLElement).getByRole("button", { name: "打开 skills 源页面" }),
    );
    await user.click(within(inheritedSkillRow as HTMLElement).getByRole("button", { name: "打开 GitHub 仓库" }));
    await user.click(within(inheritedSkillRow as HTMLElement).getByRole("button", { name: "打开本地目录" }));

    expect(mocks.openUrl).toHaveBeenNthCalledWith(
      1,
      "https://skills.sh/acme/skills/c-1-skill",
    );
    expect(mocks.openUrl).toHaveBeenNthCalledWith(2, "https://github.com/acme/skills");
    expect(mocks.openSkillDir).toHaveBeenCalledWith(31);

    const availableRegion = screen.getByRole("heading", { name: /可添加 Skill/ }).closest("div")
      ?.parentElement;
    expect(availableRegion).not.toBeNull();
    const availableSkill = within(availableRegion as HTMLElement).getByText("AVAILABLE-NET-SKILL")
      .closest("[role='button']");
    expect(availableSkill).not.toBeNull();
    expect(within(availableSkill as HTMLElement).getByRole("button", { name: "打开 skills 源页面" }))
      .toBeInTheDocument();
    await user.click(
      within(availableSkill as HTMLElement).getByRole("button", { name: "打开 GitHub 仓库" }),
    );
    expect(mocks.openUrl).toHaveBeenNthCalledWith(3, "https://github.com/acme/available-skills");
  });

  it("keeps the directory action for local skills without source or GitHub actions", async () => {
    render(<PresetsPage />);

    const inheritedRegion = await screen.findByRole("region", { name: /继承 Skill/ });
    const localSkillRegion = within(inheritedRegion).getByRole("region", { name: "C" });
    const localSkillRow = within(localSkillRegion).getByText("C-1-SKILL").closest("div.group");
    expect(localSkillRow).not.toBeNull();
    expect(within(localSkillRow as HTMLElement).queryByRole("button", { name: "打开 skills 源页面" }))
      .not.toBeInTheDocument();
    expect(within(localSkillRow as HTMLElement).queryByRole("button", { name: "打开 GitHub 仓库" }))
      .not.toBeInTheDocument();
    expect(within(localSkillRow as HTMLElement).getByRole("button", { name: "打开本地目录" }))
      .toBeInTheDocument();
  });
});

describe("PresetsPage project references", () => {
  it("opens project details without changing the active preset and shows zero counts", async () => {
    const user = userEvent.setup();
    mocks.presetProjectReferences.mockResolvedValue([
      { id: 10, name: "Project One", path: "/work/project-one" },
    ]);
    render(<PresetsPage />);

    const referenceButton = await screen.findByRole("button", {
      name: "查看 Preset「B」的项目引用",
    });
    referenceButton.focus();
    await user.keyboard("{Enter}");

    expect(mocks.presetProjectReferences).toHaveBeenCalledWith(2);
    expect(await screen.findByRole("heading", { name: "引用详情：B" })).toBeInTheDocument();
    expect(screen.getByText("Project One")).toBeInTheDocument();
    expect(screen.getByText("/work/project-one")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "A" })).toBeInTheDocument();
    const zeroReferenceCount = screen.getByTitle("被引用 0 次");
    expect(zeroReferenceCount).toHaveTextContent("0");
    expect(zeroReferenceCount).not.toBeInstanceOf(HTMLButtonElement);
  });

  it("keeps preset actions ordered and disables unavailable moves", async () => {
    render(<PresetsPage />);

    const moveUpButtons = await screen.findAllByRole("button", { name: "上移" });
    const moveDownButtons = screen.getAllByRole("button", { name: "下移" });
    const firstActionGroup = moveUpButtons[0].parentElement;

    expect(firstActionGroup).not.toBeNull();
    expect(
      within(firstActionGroup as HTMLElement)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["上移", "下移", "编辑", "删除"]);
    expect(moveUpButtons[0]).toBeDisabled();
    expect(moveDownButtons[moveDownButtons.length - 1]).toBeDisabled();
  });

  it("shows a localized error when project references cannot be loaded", async () => {
    const user = userEvent.setup();
    mocks.presetProjectReferences.mockRejectedValueOnce("database unavailable");
    render(<PresetsPage />);

    await user.click(
      await screen.findByRole("button", { name: "查看 Preset「A」的项目引用" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法加载项目引用：database unavailable",
    );
  });
});
