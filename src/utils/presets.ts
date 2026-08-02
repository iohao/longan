import type { Preset } from "../types";

export interface InheritedSkillGroup {
  presetId: number;
  presetName: string;
  depth: number;
  skillIds: number[];
}

function collectReachablePresetDepths(
  presetsById: Map<number, Preset>,
  roots: Array<{ presetId: number; depth: number }>,
): Map<number, number> {
  const depthsByPresetId = new Map<number, number>();

  const visit = (presetId: number, depth: number, ancestors: Set<number>) => {
    if (ancestors.has(presetId)) return;
    const preset = presetsById.get(presetId);
    if (!preset) return;

    depthsByPresetId.set(
      presetId,
      Math.max(depthsByPresetId.get(presetId) ?? 0, depth),
    );

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(presetId);
    preset.included_preset_ids.forEach((includedId) => {
      visit(includedId, depth + 1, nextAncestors);
    });
  };

  roots.forEach(({ presetId, depth }) => visit(presetId, depth, new Set()));
  return depthsByPresetId;
}

export function buildInheritedSkillGroups(
  presets: Preset[],
  activePresetId: number,
): InheritedSkillGroup[] {
  const presetsById = new Map(presets.map((preset) => [preset.id, preset]));
  const presetOrder = new Map(presets.map((preset, index) => [preset.id, index]));
  const activePreset = presetsById.get(activePresetId);
  if (!activePreset) return [];

  const depthsByPresetId = collectReachablePresetDepths(
    presetsById,
    activePreset.included_preset_ids.map((presetId) => ({ presetId, depth: 1 })),
  );

  const directSkillIds = new Set(activePreset.direct_skill_ids);
  const effectiveSkillIds = new Set(activePreset.skill_ids);

  return [...depthsByPresetId.entries()]
    .map(([presetId, depth]) => {
      const preset = presetsById.get(presetId);
      if (!preset) return null;

      const skillIds = [...new Set(preset.direct_skill_ids)].filter(
        (skillId) => effectiveSkillIds.has(skillId) && !directSkillIds.has(skillId),
      );

      return {
        presetId,
        presetName: preset.name,
        depth,
        skillIds,
      };
    })
    .filter((group): group is InheritedSkillGroup => group !== null && group.skillIds.length > 0)
    .sort(
      (a, b) =>
        b.depth - a.depth ||
        (presetOrder.get(a.presetId) ?? Number.MAX_SAFE_INTEGER) -
          (presetOrder.get(b.presetId) ?? Number.MAX_SAFE_INTEGER),
    );
}

export function buildPresetSkillSourceGroups(
  presets: Preset[],
  rootPresetIds: number[],
): InheritedSkillGroup[] {
  const presetsById = new Map(presets.map((preset) => [preset.id, preset]));
  const presetOrder = new Map(presets.map((preset, index) => [preset.id, index]));
  const depthsByPresetId = collectReachablePresetDepths(
    presetsById,
    rootPresetIds.map((presetId) => ({ presetId, depth: 0 })),
  );

  return [...depthsByPresetId.entries()]
    .map(([presetId, depth]) => {
      const preset = presetsById.get(presetId);
      if (!preset) return null;

      return {
        presetId,
        presetName: preset.name,
        depth,
        skillIds: [...new Set(preset.direct_skill_ids)],
      };
    })
    .filter((group): group is InheritedSkillGroup => group !== null && group.skillIds.length > 0)
    .sort(
      (a, b) =>
        b.depth - a.depth ||
        (presetOrder.get(a.presetId) ?? Number.MAX_SAFE_INTEGER) -
          (presetOrder.get(b.presetId) ?? Number.MAX_SAFE_INTEGER),
    );
}

export function replacePresetDirectSkills(
  presets: Preset[],
  presetId: number,
  directSkillIds: number[],
): Preset[] {
  const updated = presets.map((preset) =>
    preset.id === presetId
      ? { ...preset, direct_skill_ids: directSkillIds }
      : preset,
  );
  const presetsById = new Map(updated.map((preset) => [preset.id, preset]));

  return updated.map((preset) => {
    const effectiveSkillIds = new Set<number>();
    const visitedPresetIds = new Set<number>();
    const pendingPresetIds = [preset.id];

    while (pendingPresetIds.length > 0) {
      const currentId = pendingPresetIds.pop();
      if (currentId === undefined || visitedPresetIds.has(currentId)) continue;
      visitedPresetIds.add(currentId);

      const current = presetsById.get(currentId);
      if (!current) continue;
      current.direct_skill_ids.forEach((skillId) => effectiveSkillIds.add(skillId));
      pendingPresetIds.push(...current.included_preset_ids);
    }

    return {
      ...preset,
      skill_ids: [...effectiveSkillIds].sort((a, b) => a - b),
    };
  });
}
