import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill, SkillInstallProgressEvent, SkillInstallRequest } from "../types";

const mocks = vi.hoisted(() => ({
  installSkill: vi.fn(),
  cancelSkillInstall: vi.fn(),
  progressListener: null as ((progress: SkillInstallProgressEvent) => void) | null,
}));

vi.mock("../api", () => ({
  api: {
    installSkill: mocks.installSkill,
    cancelSkillInstall: mocks.cancelSkillInstall,
  },
  errorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
  listenForSkillInstallProgress: vi.fn(
    async (listener: (progress: SkillInstallProgressEvent) => void) => {
      mocks.progressListener = listener;
      return vi.fn();
    },
  ),
}));

import i18n from "../i18n";
import SkillInstallQueue from "../components/SkillInstallQueue";
import { SkillInstallProvider, useSkillInstallQueue } from "./SkillInstallContext";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function request(name: string): SkillInstallRequest {
  return {
    installKey: `owner/repo/${name}`,
    sourceId: `owner/repo/${name}`,
    name,
    owner: "owner",
    repoName: "repo",
    skillId: name,
    origin: "explore",
    sourceUrl: `owner/repo/${name}`,
    githubSource: "owner/repo",
  };
}

function Harness() {
  const { enqueue } = useSkillInstallQueue();
  return (
    <div>
      {['one', 'two', 'three'].map((name) => (
        <button key={name} type="button" onClick={() => enqueue(request(name))}>
          Add {name}
        </button>
      ))}
    </div>
  );
}

function renderQueue() {
  return render(
    <SkillInstallProvider>
      <Harness />
      <SkillInstallQueue />
    </SkillInstallProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("zh");
  vi.clearAllMocks();
  mocks.cancelSkillInstall.mockResolvedValue(true);
  mocks.progressListener = null;
  let uuid = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`),
  });
});

describe("SkillInstallProvider", () => {
  it("runs two installs concurrently and starts queued work in FIFO order", async () => {
    const one = deferred<Skill>();
    const two = deferred<Skill>();
    const three = deferred<Skill>();
    const requests = new Map([
      ["one", one.promise],
      ["two", two.promise],
      ["three", three.promise],
    ]);
    mocks.installSkill.mockImplementation((_: string, __: string, skillId: string) => requests.get(skillId));
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: "Add one" }));
    await user.click(screen.getByRole("button", { name: "Add two" }));
    await user.click(screen.getByRole("button", { name: "Add three" }));

    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledTimes(2));
    expect(mocks.installSkill.mock.calls.map((call) => call[2])).toEqual(["one", "two"]);
    expect(screen.getAllByText("等待安装")).toHaveLength(1);

    act(() => one.resolve({ id: 1, name: "one" } as Skill));
    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledTimes(3));
    expect(mocks.installSkill.mock.calls[2][2]).toBe("three");

    act(() => {
      two.resolve({ id: 2, name: "two" } as Skill);
      three.resolve({ id: 3, name: "three" } as Skill);
    });
  });

  it("cancels an active task, releases its slot, and retries with a new operation", async () => {
    const firstAttempt = deferred<Skill>();
    const secondAttempt = deferred<Skill>();
    const three = deferred<Skill>();
    mocks.installSkill
      .mockReturnValueOnce(firstAttempt.promise)
      .mockResolvedValueOnce({ id: 2, name: "two" } as Skill)
      .mockReturnValueOnce(three.promise)
      .mockReturnValueOnce(secondAttempt.promise);
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: "Add one" }));
    await user.click(screen.getByRole("button", { name: "Add two" }));
    await user.click(screen.getByRole("button", { name: "Add three" }));
    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledTimes(3));

    const firstOperationId = mocks.installSkill.mock.calls[0][3] as string;
    await user.click(screen.getByRole("button", { name: "取消 one" }));
    expect(mocks.cancelSkillInstall).toHaveBeenCalledWith(firstOperationId);
    act(() => firstAttempt.reject({ code: "cancelled", message: "cancelled" }));

    const retryButton = await screen.findByRole("button", { name: "重试 one" });
    await user.click(retryButton);
    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledTimes(4));
    expect(mocks.installSkill.mock.calls[3][3]).not.toBe(firstOperationId);

    act(() => {
      three.resolve({ id: 3, name: "three" } as Skill);
      secondAttempt.resolve({ id: 1, name: "one" } as Skill);
    });
  });
});
