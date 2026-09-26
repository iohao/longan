import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListedSkill, Skill, SkillUpdateProgressEvent } from "../types";

const skills: ListedSkill[] = [
  {
    id: 1,
    name: "brainstorming",
    source_type: "net",
    owner: "obra",
    repo: "superpowers",
    dir_path: "net/obra/superpowers/brainstorming",
    description: "Generate ideas",
    latest_sha: "abc",
    status: "update_available",
    updated_at: "2026-07-01",
    reference_count: 0,
    source_url: "obra/superpowers/brainstorming",
  },
  {
    id: 2,
    name: "tdd",
    source_type: "net",
    owner: "obra",
    repo: "superpowers",
    dir_path: "net/obra/superpowers/tdd",
    description: null,
    latest_sha: "def",
    status: "update_available",
    updated_at: "2026-07-02",
    reference_count: 0,
  },
  {
    id: 3,
    name: "debugging",
    source_type: "net",
    owner: "obra",
    repo: "superpowers",
    dir_path: "net/obra/superpowers/debugging",
    description: null,
    latest_sha: "ghi",
    status: "update_available",
    updated_at: "2026-07-03",
    reference_count: 0,
  },
];

const localSkill: ListedSkill = {
  id: 4,
  name: "longan-release",
  source_type: "local",
  owner: null,
  repo: null,
  dir_path: "local/longan-release",
  description: "Release workflow",
  latest_sha: null,
  status: "ok",
  updated_at: "2027-08-01",
  reference_count: 0,
};

const mocks = vi.hoisted(() => ({
  listSkills: vi.fn(),
  updateSkill: vi.fn(),
  updateSkills: vi.fn(),
  checkUpdates: vi.fn(),
  rescanLocal: vi.fn(),
  skillReferences: vi.fn(),
  deleteSkill: vi.fn(),
  skillReferenceDetails: vi.fn(),
  openSkillDir: vi.fn(),
  openSkillGroupDir: vi.fn(),
  openSkillSubDir: vi.fn(),
  openUrl: vi.fn(),
  progressListener: null as ((progress: SkillUpdateProgressEvent) => void) | null,
  skillsChangedListeners: [] as Array<() => void>,
  skillsChangedCleanup: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrl,
}));

vi.mock("../api", () => ({
  api: {
    listSkills: mocks.listSkills,
    updateSkill: mocks.updateSkill,
    updateSkills: mocks.updateSkills,
    checkUpdates: mocks.checkUpdates,
    rescanLocal: mocks.rescanLocal,
    skillReferences: mocks.skillReferences,
    deleteSkill: mocks.deleteSkill,
    skillReferenceDetails: mocks.skillReferenceDetails,
    openSkillDir: mocks.openSkillDir,
    openSkillGroupDir: mocks.openSkillGroupDir,
    openSkillSubDir: mocks.openSkillSubDir,
    getSetting: vi.fn(async () => null),
  },
  errorMessage: (error: unknown) => String(error),
  listenForSkillUpdateProgress: vi.fn(async (listener: (progress: SkillUpdateProgressEvent) => void) => {
    mocks.progressListener = listener;
    return vi.fn();
  }),
  listenForSkillsChanged: vi.fn(async (listener: () => void) => {
    mocks.skillsChangedListeners.push(listener);
    return () => {
      mocks.skillsChangedCleanup();
      mocks.skillsChangedListeners = mocks.skillsChangedListeners.filter(
        (candidate) => candidate !== listener,
      );
    };
  }),
}));

import { api } from "../api";
import i18n from "../i18n";
import { UpdateNotificationProvider } from "../context/UpdateNotificationContext";
import InstalledPage from "./InstalledPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  return render(
    <UpdateNotificationProvider>
      <InstalledPage />
    </UpdateNotificationProvider>
  );
}

function emitSkillsChanged() {
  for (const listener of [...mocks.skillsChangedListeners]) listener();
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("zh");
  mocks.listSkills.mockResolvedValue(skills);
  mocks.skillReferenceDetails.mockResolvedValue([]);
  mocks.updateSkill.mockResolvedValue({ ...skills[0], status: "ok" });
  mocks.updateSkills.mockResolvedValue(skills.map((skill) => ({ ...skill, status: "ok" })));
  mocks.checkUpdates.mockResolvedValue(1);
  mocks.rescanLocal.mockResolvedValue(skills);
  mocks.skillReferences.mockResolvedValue([[], []]);
  mocks.deleteSkill.mockResolvedValue(undefined);
  mocks.openSkillDir.mockResolvedValue(undefined);
  mocks.openSkillGroupDir.mockResolvedValue(undefined);
  mocks.openUrl.mockResolvedValue(undefined);
  mocks.progressListener = null;
  mocks.skillsChangedListeners = [];
  mocks.skillsChangedCleanup.mockClear();
});

describe("InstalledPage", () => {
  it("loads skills via the api and renders them", async () => {
    renderPage();

    expect(await screen.findByText("brainstorming")).toBeInTheDocument();
    expect(screen.getByText("tdd")).toBeInTheDocument();
    const sourceButton = screen.getByRole("button", { name: "打开 skills 源页面" });
    expect(sourceButton.querySelector("svg")).toBeInTheDocument();
    expect(sourceButton.querySelector("img")).not.toBeInTheDocument();
    expect(api.listSkills).toHaveBeenCalled();
  });

  it("reloads skills when the backend reports a change", async () => {
    const currentSkills: ListedSkill[] = skills.map((skill) => ({ ...skill, status: "ok" }));
    mocks.listSkills.mockResolvedValue(currentSkills);
    renderPage();

    expect(await screen.findByText("brainstorming")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更新" })).not.toBeInTheDocument();

    mocks.listSkills.mockResolvedValue(skills);
    act(() => emitSkillsChanged());

    expect(await screen.findAllByRole("button", { name: "更新" })).toHaveLength(3);
  });

  it("ignores an older reload that finishes after a change event", async () => {
    const initialRequest = deferred<ListedSkill[]>();
    const currentSkills: ListedSkill[] = skills.map((skill) => ({ ...skill, status: "ok" }));
    let initialLoading = true;
    mocks.listSkills.mockImplementation(() => (
      initialLoading ? initialRequest.promise : Promise.resolve(skills)
    ));
    renderPage();

    await waitFor(() => expect(mocks.skillsChangedListeners).toHaveLength(2));
    initialLoading = false;
    act(() => emitSkillsChanged());
    expect(await screen.findAllByRole("button", { name: "更新" })).toHaveLength(3);

    await act(async () => initialRequest.resolve(currentSkills));

    expect(screen.getAllByRole("button", { name: "更新" })).toHaveLength(3);
  });

  it("stops listening for backend changes when unmounted", async () => {
    const { unmount } = renderPage();
    expect(await screen.findByText("brainstorming")).toBeInTheDocument();
    expect(mocks.skillsChangedListeners).toHaveLength(2);

    unmount();

    expect(mocks.skillsChangedListeners).toHaveLength(0);
    expect(mocks.skillsChangedCleanup).toHaveBeenCalledTimes(2);
  });

  it("places references beside the skill name and removes copy details", async () => {
    mocks.listSkills.mockResolvedValue(
      skills.map((skill) => ({
        ...skill,
        reference_count: skill.id === 1 ? 2 : 0,
      })),
    );
    mocks.skillReferenceDetails.mockResolvedValue([
      { name: "Frontend Preset", type_: "preset", path: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    const skillName = await screen.findByRole("heading", { name: "brainstorming" });
    const titleRow = skillName.parentElement?.parentElement;
    expect(titleRow).toHaveClass("justify-between");

    const referenceButton = screen.getByRole("button", {
      name: "查看 Skill「brainstorming」的引用",
    });
    expect(titleRow).toContainElement(referenceButton);
    expect(screen.getAllByTitle("被引用 0 次")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "复制详情" })).not.toBeInTheDocument();

    await user.click(referenceButton);

    expect(mocks.skillReferenceDetails).toHaveBeenCalledWith(1);
    expect(await screen.findByRole("heading", { name: "引用详情：brainstorming" })).toBeInTheDocument();
  });

  it("explains trash recovery before deleting a local skill", async () => {
    mocks.listSkills.mockResolvedValue([localSkill]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "删除" }));

    expect(await screen.findByText(/将移动到存储目录的 trash 文件夹/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(mocks.deleteSkill).toHaveBeenCalledWith(localSkill.id);
  });

  it("does not show the trash recovery notice for a network skill", async () => {
    mocks.listSkills.mockResolvedValue([skills[0]]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "删除" }));
    await waitFor(() => expect(mocks.skillReferences).toHaveBeenCalledWith(skills[0].id));

    expect(screen.queryByText(/将移动到存储目录的 trash 文件夹/)).not.toBeInTheDocument();
  });

  it("disables a skill update immediately and ignores repeated clicks", async () => {
    const request = deferred<Skill>();
    mocks.updateSkill.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderPage();

    const buttons = await screen.findAllByRole("button", { name: "更新" });
    await user.dblClick(buttons[0]);

    expect(mocks.updateSkill).toHaveBeenCalledTimes(1);
    expect(buttons[0]).toBeDisabled();
    expect(await screen.findByRole("progressbar", { name: "正在更新 brainstorming" })).toBeInTheDocument();

    request.resolve({ ...skills[0], status: "ok" });
    await waitFor(() => expect(buttons[0]).not.toBeInTheDocument());
  });

  it("retains the installed copy when the upstream skill is unavailable", async () => {
    mocks.updateSkill.mockResolvedValue({ ...skills[0], status: "ok" });
    const user = userEvent.setup();
    renderPage();

    const buttons = await screen.findAllByRole("button", { name: "更新" });
    await user.click(buttons[0]);

    expect(
      await screen.findByText("Skill「brainstorming」的上游已无可用更新，已保留本地副本")
    ).toBeInTheDocument();
  });

  it("renders backend phase and byte progress for the matching skill", async () => {
    const request = deferred<Skill>();
    mocks.updateSkill.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderPage();

    const buttons = await screen.findAllByRole("button", { name: "更新" });
    await user.click(buttons[0]);
    await waitFor(() => expect(mocks.progressListener).not.toBeNull());

    act(() => {
      mocks.progressListener?.({
        skillId: 1,
        phase: "downloading",
        progress: 37,
        downloadedBytes: 1024,
        totalBytes: 4096,
        error: null,
      });
    });

    expect(screen.getByText("下载文件")).toBeInTheDocument();
    expect(screen.getByText("1.0 KB / 4.0 KB")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "正在更新 brainstorming" })).toHaveAttribute(
      "aria-valuenow",
      "37"
    );

    act(() => {
      mocks.progressListener?.({
        skillId: 1,
        phase: "retrying",
        progress: 10,
        downloadedBytes: null,
        totalBytes: null,
        error: null,
      });
    });
    expect(screen.getByText("下载中断，正在重试")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "正在更新 brainstorming" })).not.toHaveAttribute(
      "aria-valuenow"
    );

    request.resolve({ ...skills[0], status: "ok" });
    await waitFor(() => expect(buttons[0]).not.toBeInTheDocument());
  });

  it("re-enables a failed update and shows the error", async () => {
    const request = deferred<Skill>();
    mocks.updateSkill.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderPage();

    const buttons = await screen.findAllByRole("button", { name: "更新" });
    await user.click(buttons[0]);
    request.reject(new Error("network down"));

    await waitFor(() => expect(buttons[0]).not.toBeDisabled());
    expect(screen.getByText("Error: network down")).toBeInTheDocument();
  });

  it("sends all batch updates in one repository-aware request", async () => {
    const request = deferred<Skill[]>();
    mocks.updateSkills.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderPage();

    const batchButton = await screen.findByRole("button", { name: /一键批量更新/ });
    await user.click(batchButton);
    await waitFor(() => expect(mocks.updateSkills).toHaveBeenCalledWith([1, 2, 3]));
    expect(mocks.updateSkill).not.toHaveBeenCalled();
    expect(batchButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /取消|停止/ })).not.toBeInTheDocument();

    act(() => {
      mocks.progressListener?.({
        skillId: 1,
        phase: "downloading",
        progress: 10,
        downloadedBytes: 2048,
        totalBytes: null,
        error: null,
      });
    });
    expect(screen.getByRole("progressbar", { name: "批量更新进度" })).not.toHaveAttribute(
      "aria-valuenow"
    );
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();

    act(() => request.resolve(skills.map((skill) => ({ ...skill, status: "ok" }))));
    await waitFor(() => expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument());
  });

  it("reconciles batch results after later skills overwrite earlier progress", async () => {
    const request = deferred<Skill[]>();
    mocks.updateSkills.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /一键批量更新/ }));
    await waitFor(() => expect(mocks.progressListener).not.toBeNull());

    act(() => {
      mocks.progressListener?.({
        skillId: 1,
        phase: "completed",
        progress: 100,
        downloadedBytes: null,
        totalBytes: null,
        error: null,
      });
      mocks.progressListener?.({
        skillId: 2,
        phase: "completed",
        progress: 100,
        downloadedBytes: null,
        totalBytes: null,
        error: null,
      });
      for (const skillId of [1, 2]) {
        mocks.progressListener?.({
          skillId,
          phase: "installing",
          progress: 88,
          downloadedBytes: null,
          totalBytes: null,
          error: null,
        });
      }
      mocks.progressListener?.({
        skillId: 3,
        phase: "failed",
        progress: 88,
        downloadedBytes: null,
        totalBytes: null,
        error: "skill path not found in commit",
      });
    });

    act(() => request.resolve(skills.slice(0, 2).map((skill) => ({ ...skill, status: "ok" }))));

    expect(await screen.findByText("成功 2")).toBeInTheDocument();
    expect(screen.getByText("失败 1")).toBeInTheDocument();
    expect(screen.getByText("进行中/等待 0")).toBeInTheDocument();
  });

  it("marks unfinished batch tasks failed when the request rejects", async () => {
    mocks.updateSkills.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /一键批量更新/ }));

    expect(await screen.findByText("Error: network down")).toBeInTheDocument();
    expect(screen.getByText("失败 3")).toBeInTheDocument();
    expect(screen.getByText("进行中/等待 0")).toBeInTheDocument();
  });

  it("checks for updates from the compact header action", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "检测 Skill 更新" }));

    expect(mocks.checkUpdates).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("发现 1 个 Skill 可更新")).toBeInTheDocument();
  });

  it("rescans local Skills from the overflow menu", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "更多 Skill 操作" }));
    await user.click(screen.getByRole("menuitem", { name: "重新扫描本地 Skill" }));

    expect(mocks.rescanLocal).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("已完成本地 Skill 扫描")).toBeInTheDocument();
  });

  it("groups skills by repository in tree view and allows collapsing and expanding", async () => {
    const user = userEvent.setup();
    renderPage();

    // Group header should display the repo name and skill count badge
    const repoHeader = await screen.findByRole("button", { name: "obra/superpowers (3)" });
    expect(repoHeader).toBeInTheDocument();
    expect(repoHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("brainstorming")).toBeInTheDocument();
    expect(screen.getByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("debugging")).toBeInTheDocument();

    // Collapse the group
    await user.click(repoHeader);
    expect(repoHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("brainstorming")).not.toBeInTheDocument();

    // Expand the group again
    await user.click(repoHeader);
    expect(repoHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("brainstorming")).toBeInTheDocument();
  });

  it("supports collapsing and expanding all groups via the toolbar button", async () => {
    const user = userEvent.setup();
    renderPage();

    const repoHeader = await screen.findByRole("button", { name: "obra/superpowers (3)" });
    expect(repoHeader).toHaveAttribute("aria-expanded", "true");

    // Click "全部收起"
    const toggleAllBtn = screen.getByRole("button", { name: "全部收起" });
    await user.click(toggleAllBtn);

    expect(repoHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("brainstorming")).not.toBeInTheDocument();

    // Click "全部展开"
    await user.click(screen.getByRole("button", { name: "全部展开" }));
    expect(repoHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("brainstorming")).toBeInTheDocument();
  });

  it("allows switching between tree view and flat list view", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "obra/superpowers (3)" })).toBeInTheDocument();

    // Switch to flat view
    const flatViewBtn = screen.getByRole("button", { name: "平铺视图" });
    await user.click(flatViewBtn);

    // In flat view, repo group header button is not rendered
    expect(screen.queryByRole("button", { name: "obra/superpowers (3)" })).not.toBeInTheDocument();
    // Skills are still rendered directly
    expect(screen.getByText("brainstorming")).toBeInTheDocument();
    expect(screen.getByText("tdd")).toBeInTheDocument();

    // Switch back to tree view
    const treeViewBtn = screen.getByRole("button", { name: "树状视图" });
    await user.click(treeViewBtn);
    expect(await screen.findByRole("button", { name: "obra/superpowers (3)" })).toBeInTheDocument();
  });

  it("triggers repository-level batch update when clicking update repo button", async () => {
    const user = userEvent.setup();
    renderPage();

    const updateRepoBtn = await screen.findByRole("button", { name: "更新仓库" });
    await user.click(updateRepoBtn);

    // All updatable skills in obra/superpowers (ids 1, 2, 3) should be updated
    expect(mocks.updateSkills).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("renders repo actions on parent group card and triggers them on click", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "obra/superpowers (3)" })).toBeInTheDocument();

    // Click "打开 GitHub 仓库" on the repo group card
    const githubBtns = screen.getAllByRole("button", { name: "打开 GitHub 仓库" });
    // Only 1 GitHub button should be in tree view (on the parent group card, none on children)
    expect(githubBtns).toHaveLength(1);
    await user.click(githubBtns[0]);
    expect(mocks.openUrl).toHaveBeenCalledWith("https://github.com/obra/superpowers");

    // Click "打开本地目录" on the repo group card
    const openDirBtns = screen.getAllByRole("button", { name: "打开本地目录" });
    // In tree view, the parent group card has "打开本地目录" (1) and each child skill card also has its own "打开本地目录" (3) -> total 4
    expect(openDirBtns).toHaveLength(4);
    await user.click(openDirBtns[0]);
    expect(mocks.openSkillGroupDir).toHaveBeenCalledWith("net", "obra", "superpowers");

    // Click "打开本地目录" on the first child skill card
    await user.click(openDirBtns[1]);
    expect(mocks.openSkillDir).toHaveBeenCalledWith(1);
  });

  it("omits redundant repo prefix in tree view child cards but retains it in flat view", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: "obra/superpowers (3)" });

    // In tree view, child card subtitle only displays description without repeating owner/repo
    expect(screen.getByText("Generate ideas")).toBeInTheDocument();
    expect(screen.queryByText("obra/superpowers • Generate ideas")).not.toBeInTheDocument();

    // Switch to flat view
    const flatViewBtn = screen.getByRole("button", { name: "平铺视图" });
    await user.click(flatViewBtn);

    // In flat view, child card subtitle includes owner/repo prefix
    expect(screen.getByText("obra/superpowers • Generate ideas")).toBeInTheDocument();
    // And each skill card in flat view has its own open directory button
    expect(screen.getAllByRole("button", { name: "打开本地目录" })).toHaveLength(3);
  });

  it("displays skills grouped and ordered by organization in flat view", async () => {
    const multiOrgSkills: ListedSkill[] = [
      {
        id: 1,
        name: "golang-testing",
        source_type: "net",
        owner: "samber",
        repo: "cc-skills-golang",
        dir_path: "net/samber/cc-skills-golang/golang-testing",
        description: "Testing Go",
        latest_sha: "sha1",
        status: "ok",
        updated_at: "2026-07-01",
        reference_count: 0,
      },
      {
        id: 2,
        name: "alpha-query",
        source_type: "net",
        owner: "tanstack",
        repo: "query-skills",
        dir_path: "net/tanstack/query-skills/alpha-query",
        description: "Alpha Query",
        latest_sha: "sha2",
        status: "ok",
        updated_at: "2026-07-02",
        reference_count: 0,
      },
      {
        id: 3,
        name: "golang-security",
        source_type: "net",
        owner: "samber",
        repo: "cc-skills-golang",
        dir_path: "net/samber/cc-skills-golang/golang-security",
        description: "Security Go",
        latest_sha: "sha3",
        status: "ok",
        updated_at: "2026-07-03",
        reference_count: 0,
      },
      {
        id: 4,
        name: "react-query",
        source_type: "net",
        owner: "tanstack",
        repo: "query-skills",
        dir_path: "net/tanstack/query-skills/react-query",
        description: "React Query",
        latest_sha: "sha4",
        status: "ok",
        updated_at: "2026-07-04",
        reference_count: 0,
      },
    ];

    mocks.listSkills.mockResolvedValue(multiOrgSkills);
    const user = userEvent.setup();
    renderPage();

    // Switch to flat view
    const flatViewBtn = await screen.findByRole("button", { name: "平铺视图" });
    await user.click(flatViewBtn);

    // Verify skill headings order in the flat list
    const skillHeadings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    // samber/cc-skills-golang skills are grouped together (golang-security, golang-testing),
    // followed by tanstack/query-skills (alpha-query, react-query)
    expect(skillHeadings).toEqual([
      "golang-security",
      "golang-testing",
      "alpha-query",
      "react-query",
    ]);
  });

  it("displays sub-skills details for collection skills under local in tree view", async () => {
    const collectionSkill: ListedSkill = {
      id: 10,
      name: "dc-skill",
      source_type: "local",
      owner: null,
      repo: null,
      dir_path: "local/dc-skill",
      description: "Skill Collection (2 skills)",
      latest_sha: null,
      status: "ok",
      updated_at: "2026-07-01",
      reference_count: 0,
      sub_skills: [
        {
          name: "dc-class",
          description: "Class sync documentation",
          dir_path: "local/dc-skill/dc-class",
        },
        {
          name: "dc-module-design",
          description: "Module design specification",
          dir_path: "local/dc-skill/dc-module-design",
        },
      ],
    };

    mocks.listSkills.mockResolvedValue([collectionSkill]);
    const user = userEvent.setup();
    renderPage();

    // Verify parent skill name and collection badge
    expect(await screen.findByText("dc-skill")).toBeInTheDocument();
    expect(screen.getByText("合集 (2)")).toBeInTheDocument();

    // Verify sub-skills details are visible
    expect(screen.getByText("dc-class")).toBeInTheDocument();
    expect(screen.getByText("Class sync documentation")).toBeInTheDocument();
    expect(screen.getByText("dc-module-design")).toBeInTheDocument();
    expect(screen.getByText("Module design specification")).toBeInTheDocument();

    // Verify collapsing sub-skills
    const collapseBtn = screen.getByRole("button", { name: /收起明细/ });
    await user.click(collapseBtn);

    expect(screen.queryByText("Class sync documentation")).not.toBeInTheDocument();

    // Verify expanding sub-skills again
    const expandBtn = screen.getByRole("button", { name: /展开明细/ });
    await user.click(expandBtn);

    expect(screen.getByText("Class sync documentation")).toBeInTheDocument();
  });
});

