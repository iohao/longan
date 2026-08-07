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
  progressListener: null as ((progress: SkillUpdateProgressEvent) => void) | null,
  skillsChangedListeners: [] as Array<() => void>,
  skillsChangedCleanup: vi.fn(),
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
  await i18n.changeLanguage("zh");
  mocks.listSkills.mockResolvedValue(skills);
  mocks.skillReferenceDetails.mockResolvedValue([]);
  mocks.updateSkill.mockResolvedValue({ ...skills[0], status: "ok" });
  mocks.updateSkills.mockResolvedValue(skills.map((skill) => ({ ...skill, status: "ok" })));
  mocks.checkUpdates.mockResolvedValue(1);
  mocks.rescanLocal.mockResolvedValue(skills);
  mocks.skillReferences.mockResolvedValue([[], []]);
  mocks.deleteSkill.mockResolvedValue(undefined);
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
});
