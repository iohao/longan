import { describe, it, expect, afterEach } from "vitest";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { api, errorMessage } from "./api";
import type { Skill } from "./types";

describe("errorMessage", () => {
  it("extracts message from a structured error payload", () => {
    expect(errorMessage({ code: "not_found", message: "skill missing" })).toBe("skill missing");
  });

  it("stringifies plain values", () => {
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});

describe("api IPC wrappers", () => {
  afterEach(() => {
    clearMocks();
  });

  it("maps installSkill args to the install_skill command in camelCase", async () => {
    const skill = { id: 1, name: "s" } as Skill;
    let seen: { cmd: string; args: unknown } | null = null;
    mockIPC((cmd, args) => {
      seen = { cmd, args };
      return skill;
    });

    const result = await api.installSkill("o", "r", "s", "operation-1", "o/r/s");
    expect(result).toEqual(skill);
    expect(seen!.cmd).toBe("install_skill");
    expect(seen!.args).toEqual({
      owner: "o",
      repoName: "r",
      skillId: "s",
      operationId: "operation-1",
      sourceUrl: "o/r/s",
      githubSource: undefined,
    });
  });

  it("propagates command rejections", async () => {
    mockIPC(() => {
      throw { code: "invalid_input", message: "invalid identifier: .." };
    });
    await expect(api.installSkill("..", "r", "s", "operation-2")).rejects.toMatchObject({
      message: "invalid identifier: ..",
    });
  });

  it("maps single and all install cancellation commands", async () => {
    const calls: Array<{ cmd: string; args: unknown }> = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
      return cmd === "cancel_skill_install" ? true : 2;
    });

    await expect(api.cancelSkillInstall("operation-1")).resolves.toBe(true);
    await expect(api.cancelSkillInstalls()).resolves.toBe(2);
    expect(calls).toEqual([
      { cmd: "cancel_skill_install", args: { operationId: "operation-1" } },
      { cmd: "cancel_skill_installs", args: {} },
    ]);
  });

  it("maps Git cache inspection and clear commands", async () => {
    const commands: string[] = [];
    mockIPC((cmd) => {
      commands.push(cmd);
      return cmd === "get_git_cache_info"
        ? { repository_count: 2, total_bytes: 4096 }
        : undefined;
    });

    await expect(api.getGitCacheInfo()).resolves.toEqual({
      repository_count: 2,
      total_bytes: 4096,
    });
    await api.clearGitCache();
    expect(commands).toEqual(["get_git_cache_info", "clear_git_cache"]);
  });

  it("passes the selected path and exact snapshot to profile file saving", async () => {
    let seen: { cmd: string; args: unknown } | null = null;
    mockIPC((cmd, args) => {
      seen = { cmd, args };
    });

    await api.saveProfileFile("/tmp/longan-profile.json", "{\"version\":\"2.0\"}");

    expect(seen).toEqual({
      cmd: "save_profile_file",
      args: {
        path: "/tmp/longan-profile.json",
        profileJson: "{\"version\":\"2.0\"}",
      },
    });
  });

  it("maps preset reuse commands and modes", async () => {
    const calls: Array<{ cmd: string; args: unknown }> = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
      return cmd === "create_preset"
        ? 42
        : { added_direct_skill_count: 2, added_include_count: 0 };
    });

    await api.createPreset("TauriRust", undefined, [1, 2], "link");
    await api.reusePreset(42, [1], "copy");

    expect(calls).toEqual([
      {
        cmd: "create_preset",
        args: {
          name: "TauriRust",
          description: undefined,
          sourcePresetIds: [1, 2],
          reuseMode: "link",
        },
      },
      {
        cmd: "reuse_preset",
        args: { presetId: 42, sourcePresetIds: [1], mode: "copy" },
      },
    ]);
  });

  it("maps project group and grouped project commands", async () => {
    const calls: Array<{ cmd: string; args: unknown }> = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
    });

    await api.moveProjectGroup(4, "down");
    await api.setProjectGroupHidden(4, true);
    await api.setProjectGroup(9, 4);
    await api.setProjectsGroup([9, 10], 4);
    await api.moveProject(9, "up");

    expect(calls).toEqual([
      { cmd: "move_project_group", args: { groupId: 4, direction: "down" } },
      { cmd: "set_project_group_hidden", args: { groupId: 4, hidden: true } },
      { cmd: "set_project_group", args: { projectId: 9, groupId: 4 } },
      { cmd: "set_projects_group", args: { projectIds: [9, 10], groupId: 4 } },
      { cmd: "move_project", args: { projectId: 9, direction: "up" } },
    ]);
  });
});
