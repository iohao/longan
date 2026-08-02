import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "../types";

const mocks = vi.hoisted(() => ({
  listSkills: vi.fn(),
  skillsChangedListener: null as (() => void) | null,
  unlisten: vi.fn(),
}));

vi.mock("../api", () => ({
  api: { listSkills: mocks.listSkills },
  listenForSkillsChanged: vi.fn(async (listener: () => void) => {
    mocks.skillsChangedListener = listener;
    return mocks.unlisten;
  }),
}));

import {
  UpdateNotificationProvider,
  useUpdateNotification,
} from "./UpdateNotificationContext";

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

function UpdateCount() {
  const { updatableCount } = useUpdateNotification();
  return <output aria-label="Skill update count">{updatableCount}</output>;
}

beforeEach(() => {
  mocks.listSkills.mockResolvedValue([updateAvailableSkill(1)]);
  mocks.skillsChangedListener = null;
  mocks.unlisten.mockClear();
});

describe("UpdateNotificationProvider", () => {
  it("refreshes the badge after the backend reports changed Skills", async () => {
    const view = render(
      <UpdateNotificationProvider>
        <UpdateCount />
      </UpdateNotificationProvider>
    );

    expect(await screen.findByRole("status", { name: "Skill update count" })).toHaveTextContent("1");
    await waitFor(() => expect(mocks.skillsChangedListener).not.toBeNull());

    mocks.listSkills.mockResolvedValue([updateAvailableSkill(1), updateAvailableSkill(2)]);
    act(() => mocks.skillsChangedListener?.());

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Skill update count" })).toHaveTextContent("2");
    });

    view.unmount();
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
  });
});
