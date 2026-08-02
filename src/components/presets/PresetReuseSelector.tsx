import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Link2, Search } from "lucide-react";

import type { Preset, PresetReuseMode } from "../../types";
import Input from "../ui/Input";

interface PresetReuseSelectorProps {
  presets: Preset[];
  targetPreset?: Preset;
  mode: PresetReuseMode;
  selectedIds: number[];
  onModeChange: (mode: PresetReuseMode) => void;
  onSelectedIdsChange: (ids: number[]) => void;
}

function presetContains(
  presetsById: Map<number, Preset>,
  presetId: number,
  searchedId: number,
  visited = new Set<number>(),
): boolean {
  if (presetId === searchedId) return true;
  if (visited.has(presetId)) return false;
  visited.add(presetId);
  const preset = presetsById.get(presetId);
  return preset?.included_preset_ids.some((id) =>
    presetContains(presetsById, id, searchedId, visited),
  ) ?? false;
}

export default function PresetReuseSelector({
  presets,
  targetPreset,
  mode,
  selectedIds,
  onModeChange,
  onSelectedIdsChange,
}: PresetReuseSelectorProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const presetsById = useMemo(
    () => new Map(presets.map((preset) => [preset.id, preset])),
    [presets],
  );
  const directSkillIds = useMemo(
    () => new Set(targetPreset?.direct_skill_ids ?? []),
    [targetPreset?.direct_skill_ids],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = presets.filter((preset) => {
      if (preset.id === targetPreset?.id) return false;
      if (!normalizedQuery) return true;
      return preset.name.toLowerCase().includes(normalizedQuery)
        || preset.description?.toLowerCase().includes(normalizedQuery);
    });
    if (mode !== "link" || !targetPreset) return filtered;

    const linkedIds = new Set(targetPreset.included_preset_ids);
    return filtered.sort(
      (left, right) => Number(linkedIds.has(left.id)) - Number(linkedIds.has(right.id)),
    );
  }, [mode, presets, query, targetPreset]);

  const copiedSkillCount = useMemo(() => {
    const copyIds = new Set<number>();
    for (const sourceId of selectedIds) {
      for (const skillId of presetsById.get(sourceId)?.skill_ids ?? []) {
        if (!directSkillIds.has(skillId)) copyIds.add(skillId);
      }
    }
    return copyIds.size;
  }, [directSkillIds, presetsById, selectedIds]);

  const selectMode = (nextMode: PresetReuseMode) => {
    if (nextMode === mode) return;
    onModeChange(nextMode);
    onSelectedIdsChange([]);
  };

  const togglePreset = (presetId: number) => {
    onSelectedIdsChange(
      selectedSet.has(presetId)
        ? selectedIds.filter((id) => id !== presetId)
        : [...selectedIds, presetId],
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 rounded-lg border border-slate-700/80 bg-slate-950/60 p-1">
        {(["link", "copy"] as const).map((itemMode) => {
          const active = itemMode === mode;
          const Icon = itemMode === "copy" ? Copy : Link2;
          return (
            <button
              key={itemMode}
              type="button"
              aria-pressed={active}
              onClick={() => selectMode(itemMode)}
              className={`flex h-9 items-center justify-center gap-2 rounded-md text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                active
                  ? "bg-slate-800 text-emerald-300 shadow-sm"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`presets.reuseMode.${itemMode}`)}
            </button>
          );
        })}
      </div>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("presets.reuseSearch")}
        icon={<Search className="h-4 w-4 text-slate-500" />}
      />

      <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800/80 bg-slate-950/30">
        {candidates.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-500">
            {t("presets.reuseEmpty")}
          </p>
        ) : (
          candidates.map((preset) => {
            const alreadyLinked = mode === "link"
              && (targetPreset?.included_preset_ids.includes(preset.id) ?? false);
            const createsCycle = mode === "link"
              && targetPreset !== undefined
              && presetContains(presetsById, preset.id, targetPreset.id);
            const noNewSkills = mode === "copy"
              && preset.skill_ids.every((id) => directSkillIds.has(id));
            const disabled = alreadyLinked || createsCycle || noNewSkills;
            const selected = selectedSet.has(preset.id);
            const stateLabel = alreadyLinked
              ? t("presets.alreadyLinked")
              : createsCycle
                ? t("presets.cycleBlocked")
                : noNewSkills
                  ? t("presets.noNewSkills")
                  : t("presets.count", { count: preset.skill_ids.length });

            return (
              <label
                key={preset.id}
                className={`flex min-h-12 items-center gap-3 border-b border-slate-800/70 px-3 py-2.5 last:border-b-0 ${
                  disabled
                    ? "cursor-not-allowed opacity-45"
                    : "cursor-pointer hover:bg-slate-900/70"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    selected
                      ? "border-emerald-500 bg-emerald-500 text-slate-950"
                      : "border-slate-600 bg-slate-900"
                  }`}
                >
                  {selected ? <Check className="h-3 w-3" /> : null}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => togglePreset(preset.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-200">
                    {preset.name}
                  </span>
                  {preset.description ? (
                    <span className="block truncate text-[11px] text-slate-500">
                      {preset.description}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[11px] text-slate-500">{stateLabel}</span>
              </label>
            );
          })
        )}
      </div>

      <div className="flex min-h-8 items-center justify-between rounded-lg bg-slate-900/70 px-3 text-xs">
        <span className="text-slate-500">{t("presets.reusePreview")}</span>
        <span className="font-semibold text-emerald-300">
          {mode === "copy"
            ? t("presets.copySkillCount", { count: copiedSkillCount })
            : t("presets.linkPresetCount", { count: selectedIds.length })}
        </span>
      </div>
    </div>
  );
}
