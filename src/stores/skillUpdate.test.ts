import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import type { Skill } from "@/types";

const mocks = vi.hoisted(() => ({
  listSkills: vi.fn(),
  checkUpdates: vi.fn(),
  updateSkill: vi.fn(),
  updateSkills: vi.fn(),
  skillsChangedListener: null as (() => void) | null,
  unlisten: vi.fn(),
}));

vi.mock("@/api", () => ({
  api: {
    listSkills: mocks.listSkills,
    checkUpdates: mocks.checkUpdates,
    updateSkill: mocks.updateSkill,
    updateSkills: mocks.updateSkills,
  },
  listenForSkillsChanged: vi.fn(async (listener: () => void) => {
    mocks.skillsChangedListener = listener;
    return mocks.unlisten;
  }),
  errorMessage: (error: unknown) => String(error),
}));

import { useSkillUpdateStore } from "./skillUpdate";

const updateAvailableSkill = (id: number): Skill => ({
  id,
  name: `skill-${id}`,
  source_type: "net",
  owner: "owner",
  repo: "repo",
  dir_path: `net/owner/repo/skill-${id}`,
  description: null,
  latest_sha: `sha-${id}`,
  status: "update_available",
  updated_at: "2026-07-01",
});

describe("useSkillUpdateStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.listSkills.mockResolvedValue([updateAvailableSkill(1)]);
    mocks.checkUpdates.mockResolvedValue(1);
    mocks.updateSkill.mockImplementation(async (id: number) => ({
      ...updateAvailableSkill(id),
      status: "ok",
    }));
    mocks.updateSkills.mockImplementation(async (ids: number[]) =>
      ids.map((id) => ({ ...updateAvailableSkill(id), status: "ok" })),
    );
    mocks.skillsChangedListener = null;
  });

  it("calculates updatableCount from skills with update_available status", async () => {
    const store = useSkillUpdateStore();
    await store.refreshUpdatableCount();

    expect(store.updatableCount).toBe(1);

    mocks.listSkills.mockResolvedValue([
      updateAvailableSkill(1),
      updateAvailableSkill(2),
      { ...updateAvailableSkill(3), status: "ok" },
    ]);
    await store.refreshUpdatableCount();

    expect(store.updatableCount).toBe(2);
  });

  it("triggers checkUpdates and refreshes updatableCount", async () => {
    const store = useSkillUpdateStore();
    mocks.listSkills.mockResolvedValue([updateAvailableSkill(1), updateAvailableSkill(2)]);

    const count = await store.checkUpdates();

    expect(count).toBe(1);
    expect(mocks.checkUpdates).toHaveBeenCalledTimes(1);
    expect(store.updatableCount).toBe(2);
  });

  it("updates a single skill and refreshes count", async () => {
    const store = useSkillUpdateStore();
    mocks.listSkills.mockResolvedValueOnce([updateAvailableSkill(1)])
      .mockResolvedValueOnce([]);

    await store.refreshUpdatableCount();
    expect(store.updatableCount).toBe(1);

    const updated = await store.updateSkill(1);

    expect(mocks.updateSkill).toHaveBeenCalledWith(1);
    expect(updated?.status).toBe("ok");
    expect(store.updatableCount).toBe(0);
  });

  it("updates multiple skills in batch", async () => {
    const store = useSkillUpdateStore();
    mocks.listSkills.mockResolvedValueOnce([updateAvailableSkill(1), updateAvailableSkill(2)])
      .mockResolvedValueOnce([]);

    await store.refreshUpdatableCount();
    expect(store.updatableCount).toBe(2);

    const updated = await store.updateSkills([1, 2]);

    expect(mocks.updateSkills).toHaveBeenCalledWith([1, 2]);
    expect(updated).toHaveLength(2);
    expect(store.updatableCount).toBe(0);
  });

  it("listens for skillsChanged events and updates count", async () => {
    const store = useSkillUpdateStore();
    store.initEventListener();

    await flushPromises();
    expect(store.listenerInitialized).toBe(true);
    expect(store.updatableCount).toBe(1);

    mocks.listSkills.mockResolvedValue([
      updateAvailableSkill(1),
      updateAvailableSkill(2),
      updateAvailableSkill(3),
    ]);

    mocks.skillsChangedListener?.();
    await flushPromises();

    expect(store.updatableCount).toBe(3);
  });
});
