import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { i18n } from "@/i18n";
import { router } from "@/router";
import Sidebar from "./Sidebar.vue";
import type { Project, ProjectGroup } from "@/types";

const groups: ProjectGroup[] = [
  { id: 0, name: null, is_system: true, hidden: false, sort_order: 0 },
  { id: 1, name: "Frontend", is_system: false, hidden: false, sort_order: 1 },
  { id: 2, name: "Servers", is_system: false, hidden: true, sort_order: 2 },
  { id: 3, name: "Empty", is_system: false, hidden: false, sort_order: 3 },
];

function createProject(id: number, name: string, groupId: number, hidden = false): Project {
  return {
    id,
    name,
    path: `/projects/${name}`,
    created_at: "",
    path_exists: true,
    group_id: groupId,
    hidden,
    preset_ids: [],
    skill_ids: [],
    agent_ids: [],
  };
}

const projects: Project[] = [
  createProject(1, "Ungrouped visible", 0),
  createProject(2, "Frontend visible", 1),
  createProject(3, "Frontend hidden", 1, true),
  createProject(4, "Server visible", 2),
  createProject(5, "Server hidden", 2, true),
];

function renderSidebar(props: Record<string, unknown> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);

  return mount(Sidebar, {
    props: {
      currentPage: "projects",
      selectedProjectId: null,
      projects,
      projectGroups: groups,
      showHiddenProjects: false,
      ...props,
    },
    global: {
      plugins: [pinia, router, i18n],
    },
  });
}

describe("Sidebar.vue", () => {
  it("formats custom or prefixed version strings properly", () => {
    const wrapper = renderSidebar({ currentVersion: "2.0.0" });
    expect(wrapper.text()).toContain("v2.0.0");

    const wrapperPrefixed = renderSidebar({ currentVersion: "v3.1.2" });
    expect(wrapperPrefixed.text()).toContain("v3.1.2");
  });

  it("shows only visible groups and visible projects while preview is off", () => {
    const wrapper = renderSidebar();

    expect(wrapper.text()).toContain("Ungrouped visible");
    expect(wrapper.text()).toContain("Frontend visible");
    expect(wrapper.text()).not.toContain("Frontend hidden");
    expect(wrapper.text()).not.toContain("Server visible");
    expect(wrapper.text()).not.toContain("Empty");
  });

  it("shows hidden projects and groups when showHiddenProjects is true", () => {
    const wrapper = renderSidebar({ showHiddenProjects: true });

    expect(wrapper.text()).toContain("Frontend visible");
    expect(wrapper.text()).toContain("Frontend hidden");
    expect(wrapper.text()).toContain("Server visible");
    expect(wrapper.text()).toContain("Server hidden");
  });

  it("renders eye toggle button to toggle hidden projects preview", async () => {
    const onSetHidden = vi.fn();
    const wrapper = renderSidebar({
      showHiddenProjects: false,
      onSetHiddenProjectsPreview: onSetHidden,
    });

    const toggleBtn = wrapper.find("button[aria-pressed='false']");
    expect(toggleBtn.exists()).toBe(true);

    await toggleBtn.trigger("click");
    expect(wrapper.emitted("setHiddenProjectsPreview")?.[0]).toEqual([true]);
  });
});
