import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Preset, PresetReuseMode } from "../../types";
import PresetReuseSelector from "./PresetReuseSelector";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number; source?: string }) => {
      if (key === "presets.copySkillCount") return `${values?.count} direct skills`;
      if (key === "presets.linkPresetCount") return `${values?.count} linked presets`;
      if (key === "presets.count") return `${values?.count} skills`;
      return key;
    },
  }),
}));

function preset(
  id: number,
  name: string,
  skillIds: number[],
  includedPresetIds: number[] = [],
): Preset {
  return {
    id,
    name,
    description: null,
    created_at: "",
    skill_ids: skillIds,
    direct_skill_ids: skillIds,
    included_preset_ids: includedPresetIds,
    reference_count: 0,
  };
}

function Harness({ presets, target }: { presets: Preset[]; target: Preset }) {
  const [mode, setMode] = useState<PresetReuseMode>("copy");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  return (
    <PresetReuseSelector
      presets={presets}
      targetPreset={target}
      mode={mode}
      selectedIds={selectedIds}
      onModeChange={setMode}
      onSelectedIdsChange={setSelectedIds}
    />
  );
}

describe("PresetReuseSelector", () => {
  it("previews unique direct skills copied from selected presets", async () => {
    const target = preset(3, "target", [1]);
    render(<Harness presets={[preset(1, "frontend", [1, 2]), target]} target={target} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /frontend/i }));
    expect(screen.getByText("1 direct skills")).toBeInTheDocument();
  });

  it("disables a linked source that would create an indirect cycle", async () => {
    const target = preset(3, "target", []);
    const source = preset(1, "source", [], [3]);
    render(<Harness presets={[source, target]} target={target} />);

    await userEvent.click(screen.getByRole("button", { name: /presets.reuseMode.link/i }));
    expect(screen.getByRole("checkbox", { name: /source/i })).toBeDisabled();
  });
});
