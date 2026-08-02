import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, ProjectGroup } from "../types";

const mocks = vi.hoisted(() => ({
  createProjectGroup: vi.fn(async () => 10),
  deleteProjectGroup: vi.fn(async () => 0),
  getSetting: vi.fn(async () => null),
  moveProjectGroup: vi.fn(async () => undefined),
  setProjectGroupHidden: vi.fn(async () => undefined),
  setProjectsGroup: vi.fn(async (projectIds: number[]) => projectIds.length),
  updateProjectGroup: vi.fn(async () => undefined),
}));

vi.mock("../api", () => ({
  api: mocks,
  errorMessage: (error: unknown) => String(error),
}));

import i18n from "../i18n";
import ProjectGroupsPage from "./ProjectGroupsPage";

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

function renderPage() {
  const onReloadProjects = vi.fn(async () => undefined);
  const result = render(
    <ProjectGroupsPage
      projects={projects}
      projectGroups={groups}
      onReloadProjects={onReloadProjects}
    />,
  );
  return { ...result, onReloadProjects };
}

describe("ProjectGroupsPage bulk assignment", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh");
  });

  it("defaults to a custom group and only offers ungrouped projects for assignment", () => {
    renderPage();

    expect(screen.queryByRole("button", { name: "未分组" })).not.toBeInTheDocument();
    const inside = screen.getByRole("region", { name: "「Frontend」中的项目" });
    const ungrouped = screen.getByRole("region", { name: "未分组项目" });
    expect(within(inside).getByText("Frontend one")).toBeInTheDocument();
    expect(within(ungrouped).getByText("Ungrouped project")).toBeInTheDocument();
    expect(within(ungrouped).queryByText("Server project")).not.toBeInTheDocument();
  });

  it("moves selected ungrouped projects to the active group in project order", async () => {
    const user = userEvent.setup();
    const { onReloadProjects } = renderPage();
    await user.click(screen.getByRole("checkbox", { name: "Ungrouped project" }));
    await user.click(screen.getByRole("button", { name: "移动 1 个到「Frontend」" }));

    await waitFor(() => expect(mocks.setProjectsGroup).toHaveBeenCalledWith([1], 1));
    expect(onReloadProjects).toHaveBeenCalledOnce();
  });

  it("selects only filtered ungrouped projects", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "搜索项目或分组..." }), "Ungrouped");
    await user.click(screen.getByRole("checkbox", { name: "全选当前筛选出的未分组项目" }));
    await user.click(screen.getByRole("button", { name: "移动 1 个到「Frontend」" }));

    await waitFor(() => expect(mocks.setProjectsGroup).toHaveBeenCalledWith([1], 1));
  });

  it("moves selected group projects back to Ungrouped", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("checkbox", { name: "Frontend one" }));
    await user.click(screen.getByRole("checkbox", { name: "Frontend two" }));
    await user.click(screen.getByRole("button", { name: "移动 2 个到未分组" }));

    await waitFor(() => expect(mocks.setProjectsGroup).toHaveBeenCalledWith([2, 3], 0));
  });

  it("clears selection when the active group changes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("checkbox", { name: "Ungrouped project" }));
    await user.click(screen.getByRole("button", { name: "Servers" }));

    expect(screen.getAllByText("已选择 0 个")).toHaveLength(2);
  });
});

describe("ProjectGroupsPage group operations", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh");
  });

  it("does not expose operations for the system group", () => {
    renderPage();

    expect(screen.queryByRole("button", { name: "未分组" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "分组「未分组」操作" }),
    ).not.toBeInTheDocument();
  });

  it("renders hidden operation groups for every custom group", () => {
    renderPage();

    for (const name of ["Frontend", "Servers", "Empty"]) {
      const operations = screen.getByRole("group", { name: `分组「${name}」操作` });
      expect(operations).toHaveClass(
        "opacity-0",
        "group-hover/group-item:opacity-100",
        "group-focus-within/group-item:opacity-100",
      );
    }
  });

  it("renders project groups as separated cards", () => {
    renderPage();

    expect(screen.getByRole("list")).toHaveClass("space-y-2");
    expect(screen.getByRole("button", { name: "Frontend" }).parentElement).toHaveClass(
      "rounded-xl",
      "border",
      "h-[90px]",
      "p-3.5",
    );
  });

  it("shows a create action when no custom groups exist", async () => {
    const user = userEvent.setup();
    const onReloadProjects = vi.fn(async () => undefined);
    render(
      <ProjectGroupsPage
        projects={projects}
        projectGroups={[groups[0]]}
        onReloadProjects={onReloadProjects}
      />,
    );

    expect(screen.getByText("暂无可用项目分组")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建分组" }));
    expect(screen.getByRole("dialog", { name: "新建项目分组" })).toBeInTheDocument();
  });

  it("falls back to another custom group when the active group disappears", async () => {
    const user = userEvent.setup();
    const { rerender, onReloadProjects } = renderPage();
    await user.click(screen.getByRole("checkbox", { name: "Frontend one" }));
    await user.click(screen.getByRole("checkbox", { name: "Ungrouped project" }));

    rerender(
      <ProjectGroupsPage
        projects={projects}
        projectGroups={[groups[0], groups[3]]}
        onReloadProjects={onReloadProjects}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Servers" })).toBeInTheDocument();
      expect(screen.getAllByText("已选择 0 个")).toHaveLength(2);
    });
  });

  it("creates and renames groups", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "新建分组" }));
    await user.type(screen.getByLabelText("分组名称"), "Mobile");
    await user.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => expect(mocks.createProjectGroup).toHaveBeenCalledWith("Mobile"));

    await user.click(screen.getByRole("button", { name: "Frontend" }));
    const operations = screen.getByRole("group", { name: "分组「Frontend」操作" });
    await user.click(within(operations).getByRole("button", { name: "编辑" }));
    const input = screen.getByLabelText("分组名称");
    await user.clear(input);
    await user.type(input, "Web");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(mocks.updateProjectGroup).toHaveBeenCalledWith(1, "Web"));
  });

  it("moves groups within their visibility partition", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Frontend" }));
    const operations = screen.getByRole("group", { name: "分组「Frontend」操作" });
    expect(within(operations).getByRole("button", { name: "上移" })).toBeDisabled();
    await user.click(within(operations).getByRole("button", { name: "下移" }));

    await waitFor(() => expect(mocks.moveProjectGroup).toHaveBeenCalledWith(1, "down"));
  });

  it("uses eye icons to show the current group visibility", async () => {
    const user = userEvent.setup();
    renderPage();

    const frontendOperations = screen.getByRole("group", { name: "分组「Frontend」操作" });
    expect(
      within(frontendOperations)
        .getByRole("button", { name: "从侧栏隐藏分组" })
        .querySelector(".lucide-eye"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Servers" }));
    const serverOperations = screen.getByRole("group", { name: "分组「Servers」操作" });
    expect(
      within(serverOperations)
        .getByRole("button", { name: "在侧栏显示分组" })
        .querySelector(".lucide-eye-off"),
    ).toBeInTheDocument();
  });

  it("confirms the number of projects before deleting a group", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Frontend" }));
    const operations = screen.getByRole("group", { name: "分组「Frontend」操作" });
    await user.click(within(operations).getByRole("button", { name: "删除" }));
    expect(screen.getByText("删除分组「Frontend」？其中 3 个项目将移至未分组，项目数据不会被删除。")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "删除项目分组" });
    await user.click(within(dialog).getByRole("button", { name: "删除" }));

    await waitFor(() => expect(mocks.deleteProjectGroup).toHaveBeenCalledWith(1));
  });
});
