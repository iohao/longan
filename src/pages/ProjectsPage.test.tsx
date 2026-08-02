import { render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, ProjectGroup } from "../types";

const mocks = vi.hoisted(() => ({
  createProjectGroup: vi.fn(async () => 10),
  deleteProject: vi.fn(async () => undefined),
  deleteProjectGroup: vi.fn(async () => 0),
  getSetting: vi.fn(async () => null),
  listPresets: vi.fn(async () => []),
  listProjectGroups: vi.fn(async () => []),
  listProjects: vi.fn(async () => []),
  moveProject: vi.fn(async () => undefined),
  moveProjectGroup: vi.fn(async () => undefined),
  openPath: vi.fn(async () => undefined),
  setProjectGroup: vi.fn(async () => undefined),
  setProjectsGroup: vi.fn(async () => 0),
  setProjectGroupHidden: vi.fn(async () => undefined),
  setProjectHidden: vi.fn(async () => undefined),
  setSetting: vi.fn(async () => undefined),
  updateProjectGroup: vi.fn(async () => undefined),
}));

vi.mock("../api", () => ({
  api: mocks,
  errorMessage: (error: unknown) => String(error),
}));

import i18n from "../i18n";
import ProjectsPage from "./ProjectsPage";

const groups: ProjectGroup[] = [
  { id: 0, name: null, is_system: true, hidden: false, sort_order: 0 },
  { id: 1, name: "Frontend", is_system: false, hidden: false, sort_order: 1 },
  { id: 3, name: "Empty", is_system: false, hidden: false, sort_order: 3 },
  { id: 2, name: "Servers", is_system: false, hidden: true, sort_order: 2 },
];

function project(id: number, name: string, groupId: number, hidden = false): Project {
  return {
    id,
    name,
    path: `/projects/${name.toLowerCase().replace(/ /g, "-")}`,
    created_at: "",
    path_exists: true,
    group_id: groupId,
    hidden,
    preset_ids: [],
    skill_ids: [],
    agent_ids: [],
  };
}

const projects = [
  project(1, "Ungrouped project", 0),
  project(2, "Frontend one", 1),
  project(3, "Frontend two", 1),
  project(4, "Frontend hidden", 1, true),
  project(5, "Server project", 2),
];

function renderPage(overrides: Partial<ComponentProps<typeof ProjectsPage>> = {}) {
  const onReloadProjects = vi.fn(async () => undefined);
  const onSelectProject = vi.fn();
  const result = render(
    <ProjectsPage
      projects={projects}
      projectGroups={groups}
      presets={[]}
      onReloadProjects={onReloadProjects}
      onSelectProject={onSelectProject}
      onAddProject={vi.fn(async () => undefined)}
      {...overrides}
    />,
  );
  return { ...result, onReloadProjects, onSelectProject };
}

function projectRow(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3, name });
  const row = heading.closest("li");
  if (!(row instanceof HTMLElement)) throw new Error(`row not found for ${name}`);
  return row;
}

describe("ProjectsPage grouped display", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh");
  });

  it("shows visible groups first and hidden projects at the end of their group", () => {
    renderPage();

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["未分组", "Frontend", "Empty", "Servers"]);

    const frontend = screen.getByRole("region", { name: "Frontend" });
    const visible = within(frontend).getByText("Frontend two");
    const hidden = within(frontend).getByText("Frontend hidden");
    expect(
      visible.compareDocumentPosition(hidden) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(frontend).queryByRole("separator")).not.toBeInTheDocument();
    expect(within(frontend).getByText("已从侧栏隐藏")).toBeInTheDocument();
    expect(screen.queryByText("隐藏项目")).not.toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "隐藏分组" })).toBeInTheDocument();
  });

  it("switches between project overview and group management", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: "分组管理" }));
    expect(screen.getByRole("complementary", { name: "分组管理" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "项目总览" }));
    expect(screen.getByRole("heading", { level: 2, name: "Frontend" })).toBeInTheDocument();
  });

  it("hides and shows regular groups from the project overview", async () => {
    const user = userEvent.setup();
    renderPage();

    const frontend = screen.getByRole("region", { name: "Frontend" });
    const hideFrontend = within(frontend).getByRole("button", { name: "从侧栏隐藏分组" });
    expect(hideFrontend.querySelector(".lucide-eye")).toBeInTheDocument();
    expect(hideFrontend).toHaveClass("opacity-0", "group-hover/project-group:opacity-100");
    await user.click(hideFrontend);
    await waitFor(() => expect(mocks.setProjectGroupHidden).toHaveBeenCalledWith(1, true));

    const servers = screen.getByRole("region", { name: "Servers" });
    const showServers = within(servers).getByRole("button", { name: "在侧栏显示分组" });
    expect(showServers.querySelector(".lucide-eye-off")).toBeInTheDocument();
    await user.click(showServers);
    await waitFor(() => expect(mocks.setProjectGroupHidden).toHaveBeenCalledWith(2, false));
  });

  it("does not expose group visibility for Ungrouped in the project overview", () => {
    renderPage();

    const ungrouped = screen.getByRole("region", { name: "未分组" });
    expect(
      within(ungrouped).queryByRole("button", { name: "从侧栏隐藏分组" }),
    ).not.toBeInTheDocument();
  });

});

describe("ProjectsPage project operations", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh");
  });

  it("moves a project inside its group and opens its directory", async () => {
    const user = userEvent.setup();
    renderPage();
    const operations = within(projectRow("Frontend one")).getByRole("group", {
      name: "项目操作",
    });

    await user.click(within(operations).getByRole("button", { name: "下移" }));
    await waitFor(() => expect(mocks.moveProject).toHaveBeenCalledWith(2, "down"));
    await user.click(within(operations).getByRole("button", { name: "打开目录" }));
    await waitFor(() => expect(mocks.openPath).toHaveBeenCalledWith("/projects/frontend-one"));
  });

  it("keeps project selection available through a keyboard-friendly row control", async () => {
    const user = userEvent.setup();
    const { onSelectProject } = renderPage();

    await user.click(screen.getByRole("button", { name: "Frontend one" }));

    expect(onSelectProject).toHaveBeenCalledWith(2);
  });

  it("moves a project to its single target group through the backend command", async () => {
    const user = userEvent.setup();
    renderPage();
    const operations = within(projectRow("Frontend one")).getByRole("group", {
      name: "项目操作",
    });
    await user.click(within(operations).getByRole("button", { name: "更改分组" }));
    await user.selectOptions(screen.getByLabelText("项目「Frontend one」所属分组"), "2");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(mocks.setProjectGroup).toHaveBeenCalledWith(2, 2));
  });

  it("toggles project visibility without changing its group", async () => {
    const user = userEvent.setup();
    renderPage();
    const operations = within(projectRow("Frontend one")).getByRole("group", {
      name: "项目操作",
    });
    const visibilityButton = within(operations).getByRole("button", { name: "从侧栏隐藏" });
    expect(visibilityButton.querySelector(".lucide-eye")).toBeInTheDocument();
    await user.click(visibilityButton);

    await waitFor(() => expect(mocks.setProjectHidden).toHaveBeenCalledWith(2, true));
  });

  it("uses the right-side toggle only for sidebar preview", async () => {
    const user = userEvent.setup();
    const onSetHiddenProjectsPreview = vi.fn(async () => undefined);
    renderPage({
      showHiddenProjectsInSidebar: false,
      onSetHiddenProjectsPreview,
    });

    const previewButton = screen.getByRole("button", { name: "显示隐藏项" });
    expect(previewButton).toHaveAttribute("aria-pressed", "false");
    expect(previewButton.querySelector(".lucide-eye-off")).toBeInTheDocument();
    await user.click(previewButton);
    expect(onSetHiddenProjectsPreview).toHaveBeenCalledWith(true);
    expect(screen.getByText("Frontend hidden")).toBeInTheDocument();
  });
});
