<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, Link2, Search } from "lucide-vue-next";
import type { Preset, PresetReuseMode } from "@/types";
import Input from "@/components/ui/Input.vue";

export interface PresetReuseSelectorProps {
  presets: Preset[];
  targetPreset?: Preset;
  mode: PresetReuseMode;
  selectedIds: number[];
}

const props = defineProps<PresetReuseSelectorProps>();

const emit = defineEmits<{
  (e: "update:mode", mode: PresetReuseMode): void;
  (e: "update:selectedIds", ids: number[]): void;
}>();

const { t } = useI18n();

const query = ref("");

const presetsById = computed(
  () => new Map(props.presets.map((preset) => [preset.id, preset])),
);

const directSkillIds = computed(
  () => new Set(props.targetPreset?.direct_skill_ids ?? []),
);

const selectedSet = computed(() => new Set(props.selectedIds));

function presetContains(
  map: Map<number, Preset>,
  presetId: number,
  searchedId: number,
  visited = new Set<number>(),
): boolean {
  if (presetId === searchedId) return true;
  if (visited.has(presetId)) return false;
  visited.add(presetId);
  const preset = map.get(presetId);
  return (
    preset?.included_preset_ids.some((id) =>
      presetContains(map, id, searchedId, visited),
    ) ?? false
  );
}

const candidates = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase();
  const filtered = props.presets.filter((preset) => {
    if (preset.id === props.targetPreset?.id) return false;
    if (!normalizedQuery) return true;
    return (
      preset.name.toLowerCase().includes(normalizedQuery) ||
      preset.description?.toLowerCase().includes(normalizedQuery)
    );
  });
  if (props.mode !== "link" || !props.targetPreset) return filtered;

  const linkedIds = new Set(props.targetPreset.included_preset_ids);
  return filtered.sort(
    (left, right) => Number(linkedIds.has(left.id)) - Number(linkedIds.has(right.id)),
  );
});

const copiedSkillCount = computed(() => {
  const copyIds = new Set<number>();
  for (const sourceId of props.selectedIds) {
    for (const skillId of presetsById.value.get(sourceId)?.skill_ids ?? []) {
      if (!directSkillIds.value.has(skillId)) copyIds.add(skillId);
    }
  }
  return copyIds.size;
});

function selectMode(nextMode: PresetReuseMode) {
  if (nextMode === props.mode) return;
  emit("update:mode", nextMode);
  emit("update:selectedIds", []);
}

function togglePreset(presetId: number) {
  emit(
    "update:selectedIds",
    selectedSet.value.has(presetId)
      ? props.selectedIds.filter((id) => id !== presetId)
      : [...props.selectedIds, presetId],
  );
}
</script>

<template>
  <div class="space-y-3">
    <!-- Mode switch buttons -->
    <div class="grid grid-cols-2 rounded-lg border border-slate-700/80 bg-slate-950/60 p-1">
      <button
        type="button"
        :aria-pressed="mode === 'link'"
        :class="[
          'flex h-9 items-center justify-center gap-2 rounded-md text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 cursor-pointer',
          mode === 'link'
            ? 'bg-slate-800 text-emerald-300 shadow-sm'
            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
        ]"
        @click="selectMode('link')"
      >
        <Link2 class="h-3.5 w-3.5" />
        <span>{{ t("presets.reuseMode.link") }}</span>
      </button>

      <button
        type="button"
        :aria-pressed="mode === 'copy'"
        :class="[
          'flex h-9 items-center justify-center gap-2 rounded-md text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 cursor-pointer',
          mode === 'copy'
            ? 'bg-slate-800 text-emerald-300 shadow-sm'
            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
        ]"
        @click="selectMode('copy')"
      >
        <Copy class="h-3.5 w-3.5" />
        <span>{{ t("presets.reuseMode.copy") }}</span>
      </button>
    </div>

    <!-- Search input -->
    <Input
      v-model="query"
      :placeholder="t('presets.reuseSearch')"
    >
      <template #icon>
        <Search class="h-4 w-4 text-slate-500" />
      </template>
    </Input>

    <!-- Candidates list -->
    <div class="max-h-56 overflow-y-auto rounded-lg border border-slate-800/80 bg-slate-950/30">
      <p v-if="candidates.length === 0" class="px-4 py-8 text-center text-xs text-slate-500">
        {{ t("presets.reuseEmpty") }}
      </p>
      <div v-else>
        <label
          v-for="preset in candidates"
          :key="preset.id"
          :class="[
            'flex min-h-12 items-center gap-3 border-b border-slate-800/70 px-3 py-2.5 last:border-b-0',
            (
              (mode === 'link' && (targetPreset?.included_preset_ids.includes(preset.id) ?? false)) ||
              (mode === 'link' && targetPreset !== undefined && presetContains(presetsById, preset.id, targetPreset.id)) ||
              (mode === 'copy' && preset.skill_ids.every((id) => directSkillIds.has(id)))
            )
              ? 'cursor-not-allowed opacity-45'
              : 'cursor-pointer hover:bg-slate-900/70',
          ]"
        >
          <span
            aria-hidden="true"
            :class="[
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
              selectedSet.has(preset.id)
                ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                : 'border-slate-600 bg-slate-900',
            ]"
          >
            <Check v-if="selectedSet.has(preset.id)" class="h-3 w-3" />
          </span>

          <input
            type="checkbox"
            class="sr-only"
            :checked="selectedSet.has(preset.id)"
            :disabled="
              (mode === 'link' && (targetPreset?.included_preset_ids.includes(preset.id) ?? false)) ||
              (mode === 'link' && targetPreset !== undefined && presetContains(presetsById, preset.id, targetPreset.id)) ||
              (mode === 'copy' && preset.skill_ids.every((id) => directSkillIds.has(id)))
            "
            @change="togglePreset(preset.id)"
          />

          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-slate-200">
              {{ preset.name }}
            </span>
            <span v-if="preset.description" class="block truncate text-[11px] text-slate-500">
              {{ preset.description }}
            </span>
          </span>

          <span class="shrink-0 text-[11px] text-slate-500">
            {{
              mode === "link" && (targetPreset?.included_preset_ids.includes(preset.id) ?? false)
                ? t("presets.alreadyLinked")
                : mode === "link" && targetPreset !== undefined && presetContains(presetsById, preset.id, targetPreset.id)
                  ? t("presets.cycleBlocked")
                  : mode === "copy" && preset.skill_ids.every((id) => directSkillIds.has(id))
                    ? t("presets.noNewSkills")
                    : t("presets.count", { count: preset.skill_ids.length })
            }}
          </span>
        </label>
      </div>
    </div>

    <!-- Reuse preview footer -->
    <div class="flex min-h-8 items-center justify-between rounded-lg bg-slate-900/70 px-3 text-xs">
      <span class="text-slate-500">{{ t("presets.reusePreview") }}</span>
      <span class="font-semibold text-emerald-300">
        {{
          mode === "copy"
            ? t("presets.copySkillCount", { count: copiedSkillCount })
            : t("presets.linkPresetCount", { count: selectedIds.length })
        }}
      </span>
    </div>
  </div>
</template>
