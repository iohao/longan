import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import i18n, { setLanguage } from "@/i18n";
import type { Project, ProjectGroup } from "@/types";
import ProjectsPage from "./ProjectsPage.vue";

const mocks = vi.hoisted(() => ({
  createProjectGroup: vi.fn(async () => 10),
  deleteProject: vi.fn(async () => undefined),
  deleteProjectGroup: vi.fn(async () => 0),
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
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
  updateProjectGroup: vi.fn(async () => undefined),
}));

vi.mock("@/api", () => ({
  api: mocks,
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}));

const groups: ProjectGroup[] = [
  { id: 0, name: null, is_system: true, hidden: false, sort_order: 0 },
  { id: 1, name: "Frontend", is_system: false, hidden: false, sort_order: 1 },
  { id: 3, name: "Empty", is_system: false, hidden: false, sort_order: 3 },
  { id: 2, name: "Servers", is_system: false, hidden: true, sort_order: 2 },
];

function createProject(id: number, name: string, groupId: number, hidden = false): Project {
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
  createProject(1, "Ungrouped project", 0),
  createProject(2, "Frontend one", 1),
  createProject(3, "Frontend two", 1),
  createProject(4, "Frontend hidden", 1, true),
  createProject(5, "Server project", 2),
];

function mountPage(overrides: Record<string, unknown> = {}) {
  const onReloadProjects = vi.fn(async () => undefined);
  const onSelectProject = vi.fn();
  const wrapper = mount(ProjectsPage, {
    props: {
      projects,
      projectGroups: groups,
      presets: [],
      onReloadProjects,
      onSelectProject,
      onAddProject: vi.fn(async () => undefined),
      ...overrides,
    },
    global: {
      plugins: [i18n],
    },
  });
  return { wrapper, onReloadProjects, onSelectProject };
}

describe("ProjectsPage", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    await setLanguage("zh");
  });

  it("shows visible groups first and hidden projects at the end of their group", () => {
    const { wrapper } = mountPage();

    const headings = wrapper.findAll("h2").map((h) => h.text());
    expect(headings).toContain("未分组");
    expect(headings).toContain("Frontend");
    expect(headings).toContain("Empty");
    expect(headings).toContain("Servers");

    expect(wrapper.text()).toContain("Frontend two");
    expect(wrapper.text()).toContain("Frontend hidden");
    expect(wrapper.text()).toContain("已从侧栏隐藏");
  });

  it("switches between project overview and group management tabs", async () => {
    const { wrapper } = mountPage();

    const manageTab = wrapper.findAll('button[role="tab"]').find((b) => b.text().includes("分组管理"));
    expect(manageTab).toBeDefined();
    await manageTab!.trigger("click");
    await flushPromises();

    expect(wrapper.find('button[aria-label="新建分组"]').exists()).toBe(true);

    const overviewTab = wrapper.findAll('button[role="tab"]').find((b) => b.text().includes("项目总览"));
    expect(overviewTab).toBeDefined();
    await overviewTab!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Frontend");
  });

  it("hides and shows regular groups from the project overview", async () => {
    const { wrapper } = mountPage();

    const hideButtons = wrapper.findAll('button[aria-label="从侧栏隐藏分组"]');
    expect(hideButtons.length).toBeGreaterThan(0);
    await hideButtons[0].trigger("click");
    await flushPromises();

    expect(mocks.setProjectGroupHidden).toHaveBeenCalledWith(1, true);

    const showButtons = wrapper.findAll('button[aria-label="在侧栏显示分组"]');
    expect(showButtons.length).toBeGreaterThan(0);
    await showButtons[0].trigger("click");
    await flushPromises();

    expect(mocks.setProjectGroupHidden).toHaveBeenCalledWith(2, false);
  });

  it("moves a project inside its group and opens its directory", async () => {
    const { wrapper } = mountPage();

    const moveDownButtons = wrapper.findAll('button[aria-label="下移"]');
    expect(moveDownButtons.length).toBeGreaterThan(1);
    await moveDownButtons[1].trigger("click");
    await flushPromises();

    expect(mocks.moveProject).toHaveBeenCalledWith(2, "down");

    const openDirButtons = wrapper.findAll('button[aria-label="打开目录"]');
    expect(openDirButtons.length).toBeGreaterThan(1);
    await openDirButtons[1].trigger("click");
    await flushPromises();

    expect(mocks.openPath).toHaveBeenCalledWith("/projects/frontend-one");
  });

  it("selects a project on row click", async () => {
    const { wrapper, onSelectProject } = mountPage();

    const projectBtn = wrapper.find('button[aria-label="Frontend one"]');
    expect(projectBtn.exists()).toBe(true);
    await projectBtn.trigger("click");

    expect(onSelectProject).toHaveBeenCalledWith(2);
  });

  it("toggles project hidden visibility", async () => {
    const { wrapper } = mountPage();

    const hideBtn = wrapper.findAll('button[aria-label="从侧栏隐藏"]')[0];
    expect(hideBtn).toBeDefined();
    await hideBtn.trigger("click");
    await flushPromises();

    expect(mocks.setProjectHidden).toHaveBeenCalledWith(1, true);

    const showBtn = wrapper.find('button[aria-label="显示在侧栏"]');
    expect(showBtn.exists()).toBe(true);
    await showBtn.trigger("click");
    await flushPromises();

    expect(mocks.setProjectHidden).toHaveBeenCalledWith(4, false);
  });

  it("uses the preview button for hidden sidebar items", async () => {
    const onSetHiddenProjectsPreview = vi.fn(async () => undefined);
    const { wrapper } = mountPage({
      showHiddenProjectsInSidebar: false,
      onSetHiddenProjectsPreview,
    });

    const previewButton = wrapper.find('button[aria-label="显示隐藏项"]');
    expect(previewButton.exists()).toBe(true);
    await previewButton.trigger("click");
    await flushPromises();

    expect(onSetHiddenProjectsPreview).toHaveBeenCalledWith(true);
  });
});
