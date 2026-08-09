import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EffectiveSkill, Preset, Project, Skill } from "../types";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<() => Promise<string | null>>(async () => null),
  getProject: vi.fn(),
  listPresets: vi.fn(),
  listAgents: vi.fn(),
  rescanLocal: vi.fn(),
  effectiveSkills: vi.fn(),
  openPath: vi.fn(),
  syncProject: vi.fn(),
  gitignoreLinks: vi.fn(),
  setProjectSkill: vi.fn(),
}));

vi.mock("../api", () => ({
  api: {
    getSetting: mocks.getSetting,
    getProject: mocks.getProject,
    listPresets: mocks.listPresets,
    listAgents: mocks.listAgents,
    rescanLocal: mocks.rescanLocal,
    effectiveSkills: mocks.effectiveSkills,
    openPath: mocks.openPath,
    syncProject: mocks.syncProject,
    gitignoreLinks: mocks.gitignoreLinks,
    setProjectSkill: mocks.setProjectSkill,
  },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

import i18n from "../i18n";
import { saveProjectDetailTab } from "../utils/navigation";
import ProjectDetailPage from "./ProjectDetailPage";

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

beforeEach(async () => {
  vi.clearAllMocks();
  sessionStorage.clear();
  await i18n.changeLanguage("zh");
  mocks.getProject.mockResolvedValue(project);
  mocks.listPresets.mockResolvedValue(presets);
  mocks.listAgents.mockResolvedValue([]);
  mocks.rescanLocal.mockResolvedValue(skills);
  mocks.effectiveSkills.mockResolvedValue(effective);
  mocks.openPath.mockResolvedValue(undefined);
  mocks.syncProject.mockResolvedValue({ created: [], removed: [] });
  mocks.gitignoreLinks.mockResolvedValue(undefined);
  mocks.setProjectSkill.mockResolvedValue({ created: [], removed: [] });
});

describe("ProjectDetailPage tabs", () => {
  it("defaults to project actions and switches panels", async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    const operationsTab = await screen.findByRole("tab", { name: "项目操作" });
    const skillsTab = screen.getByRole("tab", { name: "单独关联 Skill" });
    expect(operationsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "项目操作" })).toBeVisible();
    expect(screen.queryByRole("tabpanel", { name: "单独关联 Skill" })).not.toBeInTheDocument();

    await user.click(skillsTab);

    expect(skillsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "单独关联 Skill" })).toBeVisible();
    const panelHeading = screen.getByRole("heading", { name: "单独关联 Skill" });
    expect(panelHeading.closest("button")).toBeNull();
  });

  it("supports arrow, Home, and End keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    const operationsTab = await screen.findByRole("tab", { name: "项目操作" });
    operationsTab.focus();
    await user.keyboard("{ArrowRight}");

    const skillsTab = screen.getByRole("tab", { name: "单独关联 Skill" });
    expect(skillsTab).toHaveFocus();
    expect(skillsTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    const agentsTab = screen.getByRole("tab", { name: "Agent 目录" });
    expect(agentsTab).toHaveFocus();
    expect(agentsTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(operationsTab).toHaveFocus();
    expect(operationsTab).toHaveAttribute("aria-selected", "true");
  });

  it("restores the active tab after a document reload", async () => {
    saveProjectDetailTab(project.id, "skills");

    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    expect(
      await screen.findByRole("tab", { name: "单独关联 Skill" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("keeps project actions working inside the actions panel", async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    const actionsPanel = await screen.findByRole("tabpanel", { name: "项目操作" });
    await user.click(within(actionsPanel).getByRole("button", { name: "打开目录" }));
    expect(mocks.openPath).toHaveBeenCalledWith(project.path);

    await user.click(within(actionsPanel).getByRole("button", { name: "重新同步" }));
    expect(mocks.syncProject).toHaveBeenCalledWith(project.id);

    await user.click(
      within(actionsPanel).getByRole("button", { name: "将链接目录加入 .gitignore" }),
    );
    expect(mocks.gitignoreLinks).toHaveBeenCalledWith(project.id);
    expect(await screen.findByRole("button", { name: "已加入 .gitignore" })).toBeDisabled();
  });
});

describe("ProjectDetailPage direct skill transitions", () => {
  it("stays on the direct skills tab when adding the first skill", async () => {
    const user = userEvent.setup();
    const emptyProject = { ...project, preset_ids: [], skill_ids: [] };
    const linkedProject = { ...emptyProject, skill_ids: [10] };
    mocks.getProject
      .mockResolvedValueOnce(emptyProject)
      .mockResolvedValue(linkedProject);
    mocks.listPresets.mockResolvedValue([]);
    mocks.effectiveSkills
      .mockResolvedValueOnce([])
      .mockResolvedValue([effective[0]]);

    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    const skillsTab = await screen.findByRole("tab", { name: "单独关联 Skill" });
    await user.click(skillsTab);
    const skillsPanel = screen.getByRole("tabpanel", { name: "单独关联 Skill" });
    await user.click(within(skillsPanel).getByRole("button", { name: /DIRECT-SKILL/ }));

    await waitFor(() => {
      expect(mocks.setProjectSkill).toHaveBeenCalledWith(project.id, 10, true);
      expect(mocks.getProject).toHaveBeenCalledTimes(2);
    });
    expect(skillsTab).toHaveAttribute("aria-selected", "true");
  });

  it("stays on the direct skills tab when removing the last skill", async () => {
    const user = userEvent.setup();
    const linkedProject = { ...project, preset_ids: [], skill_ids: [10] };
    const emptyProject = { ...linkedProject, skill_ids: [] };
    mocks.getProject
      .mockResolvedValueOnce(linkedProject)
      .mockResolvedValue(emptyProject);
    mocks.listPresets.mockResolvedValue([]);
    mocks.effectiveSkills
      .mockResolvedValueOnce([effective[0]])
      .mockResolvedValue([]);

    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    const skillsTab = await screen.findByRole("tab", { name: "单独关联 Skill" });
    await user.click(skillsTab);
    const skillsPanel = screen.getByRole("tabpanel", { name: "单独关联 Skill" });
    await user.click(within(skillsPanel).getByRole("button", { name: /DIRECT-SKILL/ }));

    await waitFor(() => {
      expect(mocks.setProjectSkill).toHaveBeenCalledWith(project.id, 10, false);
      expect(mocks.getProject).toHaveBeenCalledTimes(2);
    });
    expect(skillsTab).toHaveAttribute("aria-selected", "true");
  });
});

describe("ProjectDetailPage effective skill sources", () => {
  it("uses the shared SVG source action for direct and inherited skills", async () => {
    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    const sourceButtons = await screen.findAllByRole("button", { name: "打开 skills 源页面" });
    expect(sourceButtons).toHaveLength(2);
    for (const button of sourceButtons) {
      expect(button.querySelector("svg")).toBeInTheDocument();
      expect(button.querySelector("img")).not.toBeInTheDocument();
    }
  });

  it("groups inherited skills by concrete preset with deeper sources first", async () => {
    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    const inheritedRegion = await screen.findByRole("region", { name: "继承 Skill" });
    const sourceHeadings = within(inheritedRegion).getAllByRole("heading", { level: 4 });
    expect(sourceHeadings.map((heading) => heading.textContent)).toEqual(["C", "B"]);

    const cRegion = within(inheritedRegion).getByRole("region", { name: "C" });
    expect(within(cRegion).getByText("C-1-SKILL")).toBeInTheDocument();
    expect(within(cRegion).getByText("C-2-SKILL")).toBeInTheDocument();
    expect(within(cRegion).getByText("SHARED-SKILL")).toBeInTheDocument();
    expect(within(cRegion).getByText("同名冲突，未链接")).toBeInTheDocument();

    const bRegion = within(inheritedRegion).getByRole("region", { name: "B" });
    expect(within(bRegion).getByText("B-1-SKILL")).toBeInTheDocument();
    expect(within(bRegion).getByText("B-2-SKILL")).toBeInTheDocument();
    expect(within(bRegion).getByText("SHARED-SKILL")).toBeInTheDocument();
  });

  it("keeps direct winners out of preset source groups", async () => {
    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    const inheritedRegion = await screen.findByRole("region", { name: "继承 Skill" });
    expect(within(inheritedRegion).queryByText("DIRECT-SKILL")).not.toBeInTheDocument();
    expect(within(inheritedRegion).queryByRole("region", { name: "A" })).not.toBeInTheDocument();
    expect(screen.getByText("DIRECT-SKILL")).toBeInTheDocument();
  });
});

describe("ProjectDetailPage preset ordering", () => {
  it("renders preset tags according to the saved display order", async () => {
    mocks.getSetting.mockResolvedValue(JSON.stringify([3, 1, 2]));
    render(<ProjectDetailPage projectId={project.id} onBack={vi.fn()} />);

    const presetHeading = await screen.findByRole("heading", { name: "Preset 标签" });
    const presetSection = presetHeading.closest("div")?.parentElement;
    expect(presetSection).not.toBeNull();

    const buttons = within(presetSection as HTMLElement)
      .getAllByRole("button")
      .map((btn) => btn.querySelector("span")?.textContent);
    expect(buttons).toEqual(["C", "A", "B"]);
  });
});
