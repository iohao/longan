import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import i18n, { setLanguage } from "@/i18n";
import type { Project, ProjectGroup } from "@/types";
import ProjectGroupsPage from "./ProjectGroupsPage.vue";

const mocks = vi.hoisted(() => ({
  createProjectGroup: vi.fn(async () => 10),
  deleteProjectGroup: vi.fn(async () => 0),
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
  moveProjectGroup: vi.fn(async () => undefined),
  setProjectGroupHidden: vi.fn(async () => undefined),
  setProjectsGroup: vi.fn(async (projectIds: number[]) => projectIds.length),
  updateProjectGroup: vi.fn(async () => undefined),
}));

vi.mock("@/api", () => ({
  api: mocks,
  errorMessage: (error: unknown) => String(error),
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
  const wrapper = mount(ProjectGroupsPage, {
    props: {
      projects,
      projectGroups: groups,
      onReloadProjects,
      ...overrides,
    },
    global: {
      plugins: [i18n],
    },
    attachTo: document.body,
  });
  return { wrapper, onReloadProjects };
}

describe("ProjectGroupsPage", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    await setLanguage("zh");
  });

  it("defaults to a custom group and only offers ungrouped projects for assignment", () => {
    const { wrapper } = mountPage();

    expect(wrapper.text()).toContain("Frontend");
    expect(wrapper.text()).toContain("Frontend one");
    expect(wrapper.text()).toContain("Ungrouped project");
    expect(wrapper.text()).not.toContain("Server project");
    wrapper.unmount();
  });

  it("moves selected ungrouped projects to the active group in project order", async () => {
    const { wrapper, onReloadProjects } = mountPage();

    // Check ungrouped project checkbox
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    // Find checkbox with aria-label="Ungrouped project"
    const ungroupedCheckbox = checkboxes.find(
      (c) => c.attributes("aria-label") === "Ungrouped project",
    );
    expect(ungroupedCheckbox).toBeDefined();
    await ungroupedCheckbox!.setValue(true);

    const moveBtn = wrapper.findAll("button").find((b) => b.text().includes("移动 1 个到「Frontend」"));
    expect(moveBtn).toBeDefined();
    await moveBtn!.trigger("click");
    await flushPromises();

    expect(mocks.setProjectsGroup).toHaveBeenCalledWith([1], 1);
    expect(onReloadProjects).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("moves selected group projects back to Ungrouped", async () => {
    const { wrapper } = mountPage();

    const f1Checkbox = wrapper.findAll('input[type="checkbox"]').find(
      (c) => c.attributes("aria-label") === "Frontend one",
    );
    const f2Checkbox = wrapper.findAll('input[type="checkbox"]').find(
      (c) => c.attributes("aria-label") === "Frontend two",
    );
    await f1Checkbox!.setValue(true);
    await f2Checkbox!.setValue(true);

    const moveBtn = wrapper.findAll("button").find((b) => b.text().includes("移动 2 个到未分组"));
    expect(moveBtn).toBeDefined();
    await moveBtn!.trigger("click");
    await flushPromises();

    expect(mocks.setProjectsGroup).toHaveBeenCalledWith([2, 3], 0);
    wrapper.unmount();
  });

  it("clears selection when the active group changes", async () => {
    const { wrapper } = mountPage();

    const ungroupedCheckbox = wrapper.findAll('input[type="checkbox"]').find(
      (c) => c.attributes("aria-label") === "Ungrouped project",
    );
    await ungroupedCheckbox!.setValue(true);

    // Click Servers group
    const serversBtn = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Servers");
    expect(serversBtn).toBeDefined();
    await serversBtn!.trigger("click");

    expect(wrapper.text()).toContain("已选择 0 个");
    wrapper.unmount();
  });

  it("creates a new project group", async () => {
    const { wrapper } = mountPage();

    const createBtn = wrapper.find('[aria-label="新建分组"]');
    expect(createBtn.exists()).toBe(true);
    await createBtn.trigger("click");
    await flushPromises();

    const input = document.body.querySelector("#managed-project-group-name") as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = "Mobile";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();

    const submitBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "创建" && !b.disabled,
    );
    expect(submitBtn).toBeDefined();
    submitBtn!.click();
    await flushPromises();

    expect(mocks.createProjectGroup).toHaveBeenCalledWith("Mobile");
    wrapper.unmount();
  });

  it("moves groups up and down", async () => {
    const { wrapper } = mountPage();

    const moveDownBtn = wrapper.findAll('[aria-label="下移"]')[0];
    expect(moveDownBtn).toBeDefined();
    await moveDownBtn.trigger("click");
    await flushPromises();

    expect(mocks.moveProjectGroup).toHaveBeenCalledWith(1, "down");
    wrapper.unmount();
  });

  it("toggles group visibility", async () => {
    const { wrapper } = mountPage();

    const hideBtn = wrapper.find('[aria-label="从侧栏隐藏分组"]');
    expect(hideBtn.exists()).toBe(true);
    await hideBtn.trigger("click");
    await flushPromises();

    expect(mocks.setProjectGroupHidden).toHaveBeenCalledWith(1, true);
    wrapper.unmount();
  });

  it("shows delete confirmation dialog and deletes group", async () => {
    const { wrapper } = mountPage();

    const deleteBtn = wrapper.findAll('[aria-label="删除"]')[0];
    expect(deleteBtn).toBeDefined();
    await deleteBtn.trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain("删除分组「Frontend」？");

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const confirmDeleteBtn = buttons.reverse().find(
      (b) => b.textContent?.includes("删除") && !b.disabled,
    );
    expect(confirmDeleteBtn).toBeDefined();
    confirmDeleteBtn!.click();
    await flushPromises();

    expect(mocks.deleteProjectGroup).toHaveBeenCalledWith(1);
    wrapper.unmount();
  });
});
