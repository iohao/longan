import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../context/UpdateNotificationContext", () => ({
  useUpdateNotification: () => ({ updatableCount: 0 }),
}));

vi.mock("../context/SkillInstallContext", () => ({
  useSkillInstallQueue: () => ({
    tasks: [],
    expanded: false,
    setExpanded: vi.fn(),
    enqueue: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    remove: vi.fn(),
    clearFinished: vi.fn(),
  }),
}));

vi.mock("../context/UpdateContext", () => ({
  useAppUpdate: () => ({
    currentVersion: "1.0.3",
    availableUpdate: null,
    updateStatus: "idle",
    updateErrorMessage: null,
    isInstallingUpdate: false,
    updateDownloadedBytes: 0,
    updateContentLength: null,
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
    dismissUpdate: vi.fn(),
  }),
}));

import i18n from "../i18n";
import type { Project, ProjectGroup } from "../types";
import Sidebar from "./Sidebar";

const groups: ProjectGroup[] = [
  { id: 0, name: null, is_system: true, hidden: false, sort_order: 0 },
  { id: 1, name: "Frontend", is_system: false, hidden: false, sort_order: 1 },
  { id: 2, name: "Servers", is_system: false, hidden: true, sort_order: 2 },
  { id: 3, name: "Empty", is_system: false, hidden: false, sort_order: 3 },
];

function project(id: number, name: string, groupId: number, hidden = false): Project {
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

const projects = [
  project(1, "Ungrouped visible", 0),
  project(2, "Frontend visible", 1),
  project(3, "Frontend hidden", 1, true),
  project(4, "Server visible", 2),
  project(5, "Server hidden", 2, true),
];

function renderSidebar(overrides: Partial<ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      currentPage="projects"
      selectedProjectId={null}
      onSelectPage={vi.fn()}
      onSelectProject={vi.fn()}
      projects={projects}
      projectGroups={groups}
      {...overrides}
    />,
  );
}

describe("Sidebar", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh");
  });

  it("renders branding with version and without page shortcut hints", () => {
    renderSidebar({ projects: [], projectGroups: [groups[0]] });

    expect(screen.getByText("v1.0.3")).toBeInTheDocument();
    expect(screen.queryByText(/^⌘\d+$/)).not.toBeInTheDocument();
  });

  it("formats custom or prefixed version strings properly", () => {
    const { unmount } = renderSidebar({ currentVersion: "2.0.0" });
    expect(screen.getByText("v2.0.0")).toBeInTheDocument();
    unmount();

    renderSidebar({ currentVersion: "v3.1.2" });
    expect(screen.getByText("v3.1.2")).toBeInTheDocument();
  });

  it("shows only visible groups and visible projects while preview is off", () => {
    renderSidebar();

    expect(screen.queryByText("未分组")).not.toBeInTheDocument();
    expect(screen.getByText("Ungrouped visible")).toBeInTheDocument();
    const frontend = screen.getByRole("region", { name: "Frontend" });
    expect(within(frontend).getByText("Frontend visible")).toBeInTheDocument();
    expect(within(frontend).queryByText("Frontend hidden")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Servers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Empty" })).not.toBeInTheDocument();
  });

  it("keeps hidden projects in their group and moves hidden groups to the end", () => {
    renderSidebar({ showHiddenProjects: true });

    const frontend = screen.getByRole("region", { name: "Frontend" });
    const frontendVisible = within(frontend).getByText("Frontend visible");
    const frontendHidden = within(frontend).getByText("Frontend hidden");
    expect(
      frontendVisible.compareDocumentPosition(frontendHidden) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const servers = screen.getByRole("region", { name: "Servers" });
    expect(within(servers).getByRole("separator", { name: "隐藏分组" })).toBeInTheDocument();
    expect(
      frontend.compareDocumentPosition(servers) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(servers).getByText("Server visible")).toBeInTheDocument();
    expect(within(servers).getByText("Server hidden")).toBeInTheDocument();
  });

  it("places a hidden system group first within the hidden group partition", () => {
    renderSidebar({
      showHiddenProjects: true,
      projectGroups: groups.map((group) =>
        group.id === 0 ? { ...group, hidden: true } : group,
      ),
    });

    const ungrouped = screen.getByText("Ungrouped visible").closest("button");
    const servers = screen.getByRole("region", { name: "Servers" });
    expect(ungrouped).toBeInstanceOf(HTMLButtonElement);
    expect(
      ungrouped!.compareDocumentPosition(servers) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("未分组")).not.toBeInTheDocument();
  });

  it("renders eye toggle button to toggle hidden projects preview", async () => {
    const user = userEvent.setup();
    const onSetHiddenProjectsPreview = vi.fn();
    renderSidebar({
      showHiddenProjects: false,
      onSetHiddenProjectsPreview,
    });

    const toggleButton = screen.getByRole("button", { name: "显示隐藏项" });
    expect(toggleButton).toHaveAttribute("aria-pressed", "false");
    expect(toggleButton.querySelector(".lucide-eye-off")).toBeInTheDocument();

    await user.click(toggleButton);
    expect(onSetHiddenProjectsPreview).toHaveBeenCalledWith(true);
  });

  it("renders end preview eye button when hidden projects preview is active", async () => {
    const user = userEvent.setup();
    const onSetHiddenProjectsPreview = vi.fn();
    renderSidebar({
      showHiddenProjects: true,
      onSetHiddenProjectsPreview,
    });

    const toggleButton = screen.getByRole("button", { name: "结束预览" });
    expect(toggleButton).toHaveAttribute("aria-pressed", "true");
    expect(toggleButton.querySelector(".lucide-eye")).toBeInTheDocument();

    await user.click(toggleButton);
    expect(onSetHiddenProjectsPreview).toHaveBeenCalledWith(false);
  });

  it("does not render eye toggle button when there are no hidden items and preview is off", () => {
    renderSidebar({
      projects: [project(1, "Ungrouped visible", 0)],
      projectGroups: [groups[0]],
      showHiddenProjects: false,
      onSetHiddenProjectsPreview: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: "显示隐藏项" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "结束预览" })).not.toBeInTheDocument();
  });
});
