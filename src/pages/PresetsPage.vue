<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import {
  Layers,
  Plus,
  Trash2,
  AlertCircle,
  Package,
  Search,
  CheckCircle2,
  PlusCircle,
  ChevronUp,
  ChevronDown,
  Pencil,
  X,
  Link2,
} from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import type { Preset, PresetReuseMode, Skill } from "@/types";
import { useDebounce } from "@/utils/debounce";
import {
  buildInheritedSkillGroups,
  parsePresetOrder,
  replacePresetDirectSkills,
  sortPresets,
  PRESET_ORDER_SETTING_KEY,
} from "@/utils/presets";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Card from "@/components/ui/Card.vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ReferenceCount from "@/components/ui/ReferenceCount.vue";
import Dialog from "@/components/ui/Dialog.vue";
import SkillItem from "@/components/presets/SkillItem.vue";
import SkillSourceActions from "@/components/skills/SkillSourceActions.vue";
import PresetSummaryPanel from "@/components/presets/PresetSummaryPanel.vue";
import PresetReuseSelector from "@/components/presets/PresetReuseSelector.vue";
import PresetReferenceModal from "@/components/presets/PresetReferenceModal.vue";

const { t } = useI18n();

const presets = ref<Preset[]>([]);
const skills = ref<Skill[]>([]);
const activePresetId = ref<number | null>(null);

const presetSearchQuery = ref("");
const skillSearchQuery = ref("");
const presetOrder = ref<number[]>([]);

const presetModal = ref<{ mode: "create" } | { mode: "edit"; preset: Preset } | null>(null);
const deletingPreset = ref<Preset | null>(null);
const viewingReferences = ref<Preset | null>(null);
const reuseModalOpen = ref(false);

const formName = ref("");
const formDesc = ref("");
const formReuseMode = ref<PresetReuseMode>("link");
const formSourcePresetIds = ref<number[]>([]);
const reuseMode = ref<PresetReuseMode>("link");
const reuseSourcePresetIds = ref<number[]>([]);
const isSubmitting = ref(false);
const error = ref<string | null>(null);

async function reload() {
  try {
    const [ps, ss, savedOrderStr] = await Promise.all([
      api.listPresets(),
      api.rescanLocal(),
      api.getSetting(PRESET_ORDER_SETTING_KEY),
    ]);
    presets.value = ps;
    skills.value = ss;
    presetOrder.value = parsePresetOrder(savedOrderStr, ps);

    if (activePresetId.value !== null && ps.some((p) => p.id === activePresetId.value)) {
      // keep current
    } else {
      activePresetId.value = ps.length > 0 ? ps[0].id : null;
    }
  } catch (e) {
    error.value = errorMessage(e);
  }
}

onMounted(() => {
  void reload();
});

const sortedPresets = computed(() => sortPresets(presets.value, presetOrder.value));

const filteredPresets = computed(() => {
  if (!presetSearchQuery.value.trim()) return sortedPresets.value;
  const q = presetSearchQuery.value.toLowerCase();
  return sortedPresets.value.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)),
  );
});

const activePreset = computed(
  () => presets.value.find((p) => p.id === activePresetId.value) || null,
);

async function savePresetOrder(newOrder: number[]) {
  presetOrder.value = newOrder;
  try {
    await api.setSetting(PRESET_ORDER_SETTING_KEY, JSON.stringify(newOrder));
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function movePreset(presetId: number, direction: "up" | "down") {
  const currentList = sortedPresets.value.map((p) => p.id);
  const index = currentList.indexOf(presetId);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= currentList.length) return;

  const newOrder = [...currentList];
  const temp = newOrder[index];
  newOrder[index] = newOrder[targetIndex];
  newOrder[targetIndex] = temp;

  await savePresetOrder(newOrder);
}

function openCreateModal() {
  formName.value = "";
  formDesc.value = "";
  formReuseMode.value = "link";
  formSourcePresetIds.value = [];
  error.value = null;
  presetModal.value = { mode: "create" };
}

function openEditModal(p: Preset) {
  formName.value = p.name;
  formDesc.value = p.description || "";
  error.value = null;
  presetModal.value = { mode: "edit", preset: p };
}

async function submitPresetForm() {
  if (!presetModal.value) return;
  const n = formName.value.trim();
  if (!n || isSubmitting.value) return;
  isSubmitting.value = true;
  error.value = null;
  try {
    if (presetModal.value.mode === "create") {
      const newId = await api.createPreset(
        n,
        formDesc.value.trim() || undefined,
        formSourcePresetIds.value,
        formSourcePresetIds.value.length > 0 ? formReuseMode.value : undefined,
      );
      presetModal.value = null;
      formName.value = "";
      formDesc.value = "";
      await reload();
      activePresetId.value = newId;
    } else {
      await api.updatePreset(presetModal.value.preset.id, n, formDesc.value.trim() || undefined);
      presetModal.value = null;
      formName.value = "";
      formDesc.value = "";
      await reload();
    }
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    isSubmitting.value = false;
  }
}

async function removePreset() {
  if (!deletingPreset.value) return;
  error.value = null;
  try {
    await api.deletePreset(deletingPreset.value.id);
    deletingPreset.value = null;
    await reload();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function toggleSkill(p: Preset, skillId: number) {
  const next = p.direct_skill_ids.includes(skillId)
    ? p.direct_skill_ids.filter((id) => id !== skillId)
    : [...p.direct_skill_ids, skillId];

  presets.value = replacePresetDirectSkills(presets.value, p.id, next);
  error.value = null;
  try {
    await api.setPresetSkills(p.id, next);
  } catch (e) {
    error.value = errorMessage(e);
    await reload();
  }
}

function openReuseModal() {
  reuseMode.value = "link";
  reuseSourcePresetIds.value = [];
  reuseModalOpen.value = true;
}

async function applyPresetReuse() {
  if (!activePreset.value || reuseSourcePresetIds.value.length === 0 || isSubmitting.value) return;
  isSubmitting.value = true;
  error.value = null;
  try {
    await api.reusePreset(activePreset.value.id, reuseSourcePresetIds.value, reuseMode.value);
    reuseModalOpen.value = false;
    await reload();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    isSubmitting.value = false;
  }
}

async function removeIncludedPreset(includedPresetId: number) {
  if (!activePreset.value || isSubmitting.value) return;
  isSubmitting.value = true;
  error.value = null;
  try {
    await api.setPresetIncludes(
      activePreset.value.id,
      activePreset.value.included_preset_ids.filter((id) => id !== includedPresetId),
    );
    await reload();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    isSubmitting.value = false;
  }
}

const debouncedSkillSearch = useDebounce(
  computed(() => skillSearchQuery.value),
  300,
);

const presetsById = computed(() => new Map(presets.value.map((preset) => [preset.id, preset])));

const activeSourcePresets = computed(() => {
  if (!activePreset.value) return [];
  return activePreset.value.included_preset_ids.flatMap((id) => {
    const preset = presetsById.value.get(id);
    return preset ? [preset] : [];
  });
});

const filteredSkills = computed(() => {
  if (!debouncedSkillSearch.value.trim()) return skills.value;
  const q = debouncedSkillSearch.value.toLowerCase().trim();
  return skills.value.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      s.dir_path.toLowerCase().includes(q) ||
      (s.owner && s.owner.toLowerCase().includes(q)) ||
      (s.repo && s.repo.toLowerCase().includes(q)),
  );
});

const directSkills = computed(() => {
  if (!activePreset.value) return [];
  return filteredSkills.value.filter((skill) =>
    activePreset.value!.direct_skill_ids.includes(skill.id),
  );
});

const inheritedSkills = computed(() => {
  if (!activePreset.value) return [];
  const directIds = new Set(activePreset.value.direct_skill_ids);
  return filteredSkills.value.filter(
    (skill) => activePreset.value!.skill_ids.includes(skill.id) && !directIds.has(skill.id),
  );
});

const availableSkills = computed(() => {
  if (!activePreset.value) return [];
  return filteredSkills.value.filter((s) => !activePreset.value!.skill_ids.includes(s.id));
});

const isFilteringSkills = computed(() => debouncedSkillSearch.value.trim().length > 0);

const effectiveTotal = computed(() => {
  if (!activePreset.value) return 0;
  return skills.value.filter((s) => activePreset.value!.skill_ids.includes(s.id)).length;
});

const directTotal = computed(() => {
  if (!activePreset.value) return 0;
  return skills.value.filter((skill) => activePreset.value!.direct_skill_ids.includes(skill.id))
    .length;
});

const inheritedTotal = computed(() => effectiveTotal.value - directTotal.value);
const availableTotal = computed(() => skills.value.length - effectiveTotal.value);

const inheritedSkillGroups = computed(() => {
  if (!activePreset.value) return [];

  const visibleSkillIds = new Set(inheritedSkills.value.map((skill) => skill.id));
  return buildInheritedSkillGroups(sortedPresets.value, activePreset.value.id)
    .map((group) => {
      const groupSkillIds = new Set(group.skillIds);
      const groupSkills = skills.value.filter((skill) => groupSkillIds.has(skill.id));
      return {
        ...group,
        total: groupSkills.length,
        skills: groupSkills.filter((skill) => visibleSkillIds.has(skill.id)),
      };
    })
    .filter((group) => group.skills.length > 0);
});

const deletingDependents = computed(() => {
  if (!deletingPreset.value) return [];
  const dependentIds = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const preset of presets.value) {
      if (preset.id === deletingPreset.value.id || dependentIds.has(preset.id)) continue;
      if (
        preset.included_preset_ids.some(
          (id) => id === deletingPreset.value!.id || dependentIds.has(id),
        )
      ) {
        dependentIds.add(preset.id);
        changed = true;
      }
    }
  }
  return presets.value.filter((preset) => dependentIds.has(preset.id));
});
</script>

<template>
  <div class="w-full flex-1 flex flex-col gap-6">
    <!-- Header -->
    <div>
      <div class="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
        <Layers class="w-3.5 h-3.5" />
        <span>{{ t("presets.eyebrow") }}</span>
      </div>
      <h1 class="text-2xl font-bold text-slate-100 tracking-tight">
        {{ t("nav.presets") }}
      </h1>
      <p class="text-sm text-slate-400 mt-1">
        {{ t("presets.pageDesc") }}
      </p>
    </div>

    <!-- Error Message -->
    <div
      v-if="error"
      role="status"
      aria-live="polite"
      class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2"
    >
      <AlertCircle class="w-4 h-4 shrink-0" />
      <span class="flex-1 min-w-0 break-words">{{ error }}</span>
      <button
        type="button"
        :aria-label="t('common.close')"
        class="p-1 rounded shrink-0 hover:text-rose-300 hover:bg-rose-500/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 cursor-pointer"
        @click="error = null"
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Main Master-Detail Layout -->
    <div class="grid grid-cols-12 gap-6 flex-1">
      <!-- Left Master Column -->
      <div class="col-span-12 lg:col-span-3 flex flex-col gap-3 min-h-0">
        <div class="space-y-2">
          <Button
            variant="primary"
            class="w-full"
            @click="openCreateModal"
          >
            <Plus class="w-4 h-4" />
            <span>{{ t("common.create") }}</span>
          </Button>

          <Input
            v-model="presetSearchQuery"
            :placeholder="t('presets.searchPlaceholder')"
            class="w-full"
          >
            <template #icon>
              <Search class="w-4 h-4 text-slate-400" />
            </template>
          </Input>
        </div>

        <!-- Preset List Container -->
        <div class="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
          <Card v-if="filteredPresets.length === 0" :hover-effect="false" class="p-6 text-center">
            <p class="text-xs text-slate-500">
              {{ presets.length === 0 ? t("presets.empty") : t("install.noResults") }}
            </p>
          </Card>

          <div
            v-for="(p, idx) in filteredPresets"
            :key="p.id"
            role="button"
            tabindex="0"
            :class="[
              'group relative p-3.5 rounded-xl border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60',
              p.id === activePresetId
                ? 'bg-slate-900/60 border-emerald-500/30 text-slate-200 hover:border-emerald-500/40'
                : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-900/60 text-slate-300 hover:border-slate-700',
            ]"
            @click="activePresetId = p.id"
            @keydown.enter.prevent="activePresetId = p.id"
            @keydown.space.prevent="activePresetId = p.id"
          >
            <!-- Active Accent Bar -->
            <div
              v-if="p.id === activePresetId"
              class="absolute left-0 top-2 bottom-2 w-1 bg-emerald-500/60 rounded-r-full"
            />

            <!-- Skill Count Badge -->
            <div class="absolute right-1.5 top-3">
              <Badge
                :variant="p.id === activePresetId ? 'info' : 'neutral'"
                class="text-[10px] px-1.5 py-0"
              >
                {{ p.skill_ids.length }}
              </Badge>
            </div>

            <!-- Main Content & Actions -->
            <div class="flex flex-col items-start min-w-0 px-1.5 mt-1">
              <div class="min-w-0 flex-1 pl-2">
                <div class="flex items-center mb-1">
                  <span
                    class="font-semibold text-sm whitespace-normal break-words"
                    style="word-break: break-word"
                  >
                    {{ p.name }}
                  </span>
                </div>
                <p v-if="p.description" class="text-xs text-slate-400 leading-tight">
                  {{ p.description }}
                </p>
              </div>

              <!-- Operation bar -->
              <div class="mt-2 flex min-h-6 w-full items-center justify-between gap-2 pl-2">
                <div
                  class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <button
                    type="button"
                    :title="t('presets.moveUp')"
                    :aria-label="t('presets.moveUp')"
                    :disabled="idx === 0"
                    class="rounded p-1 text-slate-400 hover:bg-slate-800/60 hover:text-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer"
                    @click.stop="movePreset(p.id, 'up')"
                  >
                    <ChevronUp class="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    :title="t('presets.moveDown')"
                    :aria-label="t('presets.moveDown')"
                    :disabled="idx === filteredPresets.length - 1"
                    class="rounded p-1 text-slate-400 hover:bg-slate-800/60 hover:text-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer"
                    @click.stop="movePreset(p.id, 'down')"
                  >
                    <ChevronDown class="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    :title="t('common.edit')"
                    :aria-label="t('common.edit')"
                    class="rounded p-1 text-slate-400 hover:bg-slate-800/60 hover:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 cursor-pointer"
                    @click.stop="openEditModal(p)"
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    :title="t('common.delete')"
                    :aria-label="t('common.delete')"
                    class="rounded p-1 text-slate-400 hover:bg-slate-800/60 hover:text-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 cursor-pointer"
                    @click.stop="deletingPreset = p"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>

                <ReferenceCount
                  :count="p.reference_count"
                  :count-label="t('presets.referenceCount', { count: p.reference_count })"
                  :view-label="t('presets.viewReferences', { name: p.name })"
                  @view="viewingReferences = p"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Detail Column -->
      <div class="col-span-12 lg:col-span-9 flex flex-col">
        <div v-if="activePreset" class="flex-1 flex flex-col gap-5">
          <PresetSummaryPanel
            :preset="activePreset"
            :source-presets="activeSourcePresets"
            :direct-count="directTotal"
            :inherited-count="inheritedTotal"
            :effective-count="effectiveTotal"
            :is-submitting="isSubmitting"
            @reuse="openReuseModal"
            @remove-source="removeIncludedPreset"
          />

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 class="text-sm font-semibold text-slate-200">
              {{ t("presets.skillWorkspace") }}
            </h3>
            <div class="w-full sm:max-w-sm">
              <Input
                v-model="skillSearchQuery"
                :placeholder="t('library.searchPlaceholder')"
                :aria-label="t('presets.skillSearchLabel')"
              >
                <template #icon>
                  <Search class="w-4 h-4 text-slate-400" />
                </template>
                <template v-if="skillSearchQuery" #right>
                  <button
                    type="button"
                    :aria-label="t('presets.clearSkillSearch')"
                    class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                    @click="skillSearchQuery = ''"
                  >
                    <X class="w-4 h-4" />
                  </button>
                </template>
              </Input>
            </div>
          </div>

          <!-- Associated vs Available Grid -->
          <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-5">
            <!-- Associated Skills Column -->
            <Card :hover-effect="false" class="p-4 flex flex-col min-h-[440px]">
              <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/80 shrink-0">
                <h4 class="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                  <CheckCircle2 class="w-4 h-4" />
                  <span>
                    {{ t("presets.associatedTitle") }} (
                    {{
                      isFilteringSkills
                        ? `${directSkills.length + inheritedSkills.length} / ${effectiveTotal}`
                        : effectiveTotal
                    }}
                    )
                  </span>
                </h4>
              </div>

              <div
                v-if="directSkills.length === 0 && inheritedSkills.length === 0"
                class="flex-1 flex items-center justify-center p-4"
              >
                <p class="text-xs text-slate-500 text-center italic">
                  {{
                    isFilteringSkills && effectiveTotal > 0
                      ? t("install.noResults")
                      : t("presets.noAttached")
                  }}
                </p>
              </div>

              <div v-else class="flex-1 space-y-4 overflow-y-auto pr-1 pb-3 min-h-0">
                <!-- Direct skills -->
                <section v-if="directSkills.length > 0" class="space-y-2">
                  <h5 class="text-xs font-semibold text-emerald-300">
                    {{ t("presets.directSkills") }} ({{ isFilteringSkills ? directSkills.length : directTotal }})
                  </h5>
                  <SkillItem
                    v-for="skill in directSkills"
                    :key="skill.id"
                    :skill="skill"
                    variant="attached"
                    @toggle="() => toggleSkill(activePreset!, skill.id)"
                    @error="(msg) => (error = msg)"
                  />
                </section>

                <!-- Inherited skills -->
                <section v-if="inheritedSkills.length > 0" class="space-y-2">
                  <h5 class="text-xs font-semibold text-sky-300">
                    {{ t("presets.inheritedSkills") }} ({{ isFilteringSkills ? inheritedSkills.length : inheritedTotal }})
                  </h5>
                  <div class="space-y-4">
                    <section
                      v-for="group in inheritedSkillGroups"
                      :key="group.presetId"
                      class="space-y-2"
                    >
                      <div class="flex min-w-0 items-center gap-2 px-1">
                        <h6 class="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-sky-300">
                          <Link2 class="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                          <span class="truncate" :title="group.presetName">
                            {{ group.presetName }}
                          </span>
                        </h6>
                        <span class="shrink-0 font-mono text-[10px] text-slate-500">
                          {{ isFilteringSkills ? `${group.skills.length} / ${group.total}` : group.total }}
                        </span>
                      </div>
                      <div class="space-y-2 border-l border-sky-500/25 pl-3">
                        <div
                          v-for="skill in group.skills"
                          :key="`${group.presetId}:${skill.id}`"
                          class="group flex min-h-14 items-center justify-between gap-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-2.5 text-xs"
                        >
                          <div class="min-w-0 flex-1">
                            <div class="font-medium text-slate-300">
                              <span class="block truncate" :title="skill.name">
                                {{ skill.name }}
                              </span>
                            </div>
                            <p class="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                              {{
                                skill.owner && skill.repo
                                  ? `${skill.owner}/${skill.repo}`
                                  : skill.dir_path
                              }}
                            </p>
                          </div>
                          <SkillSourceActions :skill="skill" @error="(msg) => (error = msg)" />
                        </div>
                      </div>
                    </section>
                  </div>
                </section>
              </div>
            </Card>

            <!-- Available Skills Column -->
            <Card :hover-effect="false" class="p-4 flex flex-col min-h-[440px]">
              <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/80 shrink-0">
                <h4 class="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                  <PlusCircle class="w-4 h-4 text-slate-500" />
                  <span>
                    {{ t("presets.availableTitle") }} (
                    {{ isFilteringSkills ? `${availableSkills.length} / ${availableTotal}` : availableTotal }}
                    )
                  </span>
                </h4>
              </div>

              <div v-if="availableSkills.length === 0" class="flex-1 flex items-center justify-center p-4">
                <p class="text-xs text-slate-500 text-center italic">
                  {{
                    skills.length === 0
                      ? t("common.empty")
                      : isFilteringSkills && availableTotal > 0
                        ? t("install.noResults")
                        : t("presets.allAdded")
                  }}
                </p>
              </div>

              <div v-else class="flex-1 space-y-2 overflow-y-auto pr-1 pb-3 min-h-0">
                <SkillItem
                  v-for="s in availableSkills"
                  :key="s.id"
                  :skill="s"
                  variant="available"
                  @toggle="() => toggleSkill(activePreset!, s.id)"
                  @error="(msg) => (error = msg)"
                />
              </div>
            </Card>
          </div>
        </div>

        <EmptyState
          v-else
          :title="t('presets.noPresetSelected')"
          :description="t('presets.selectPrompt')"
        >
          <template #icon>
            <Layers class="w-8 h-8 text-slate-500" />
          </template>
          <template #action>
            <Button variant="primary" @click="openCreateModal">
              <Plus class="w-4 h-4" />
              <span>{{ t("presets.createModalTitle") }}</span>
            </Button>
          </template>
        </EmptyState>
      </div>
    </div>

    <!-- Create / Edit Modal -->
    <Dialog
      :open="presetModal !== null"
      :title="presetModal?.mode === 'edit' ? t('presets.editModalTitle') : t('presets.createModalTitle')"
      :size="presetModal?.mode === 'create' && presets.length > 0 ? 'lg' : 'md'"
      @close="presetModal = null"
    >
      <div class="space-y-4">
        <div>
          <label for="preset-form-name" class="block text-xs font-medium text-slate-400 mb-1.5">
            {{ t("presets.newName") }}
          </label>
          <Input
            id="preset-form-name"
            v-model="formName"
            :placeholder="t('presets.namePlaceholder')"
            @keydown.enter="submitPresetForm"
          />
        </div>

        <div>
          <label for="preset-form-desc" class="block text-xs font-medium text-slate-400 mb-1.5">
            {{ t("presets.newDesc") }}
          </label>
          <textarea
            id="preset-form-desc"
            v-model="formDesc"
            rows="3"
            :placeholder="t('presets.descPlaceholder')"
            class="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/80 focus:border-emerald-500/80 transition-all duration-150 px-3.5 py-2 resize-none"
            @keydown.enter.ctrl="submitPresetForm"
            @keydown.enter.meta="submitPresetForm"
          />
        </div>

        <div
          v-if="presetModal?.mode === 'create' && presets.length > 0"
          class="space-y-2 border-t border-slate-800/80 pt-4"
        >
          <h3 class="text-xs font-semibold text-slate-300">
            {{ t("presets.startFromPreset") }}
          </h3>
          <PresetReuseSelector
            :presets="presets"
            :mode="formReuseMode"
            :selected-ids="formSourcePresetIds"
            @update:mode="(m) => (formReuseMode = m)"
            @update:selected-ids="(ids) => (formSourcePresetIds = ids)"
          />
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="presetModal = null">
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="primary"
          :disabled="!formName.trim() || isSubmitting"
          @click="submitPresetForm"
        >
          {{ presetModal?.mode === "edit" ? t("common.save") : t("common.create") }}
        </Button>
      </template>
    </Dialog>

    <!-- Reuse Modal -->
    <Dialog
      :open="reuseModalOpen"
      :title="t('presets.reuseModalTitle', { name: activePreset?.name ?? '' })"
      size="lg"
      @close="reuseModalOpen = false"
    >
      <PresetReuseSelector
        v-if="activePreset"
        :presets="presets"
        :target-preset="activePreset"
        :mode="reuseMode"
        :selected-ids="reuseSourcePresetIds"
        @update:mode="(m) => (reuseMode = m)"
        @update:selected-ids="(ids) => (reuseSourcePresetIds = ids)"
      />

      <template #footer>
        <Button variant="ghost" @click="reuseModalOpen = false">
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="primary"
          :disabled="reuseSourcePresetIds.length === 0 || isSubmitting"
          @click="applyPresetReuse"
        >
          <Package v-if="reuseMode === 'copy'" class="h-4 w-4" />
          <Link2 v-else class="h-4 w-4" />
          <span>{{ t(`presets.reuseAction.${reuseMode}`) }}</span>
        </Button>
      </template>
    </Dialog>

    <!-- Reference Modal -->
    <PresetReferenceModal
      :preset="viewingReferences"
      :is-open="viewingReferences !== null"
      @close="viewingReferences = null"
    />

    <!-- Delete Confirmation Modal -->
    <Dialog
      :open="deletingPreset !== null"
      :title="t('presets.deleteModalTitle')"
      @close="deletingPreset = null"
    >
      <div class="space-y-3">
        <p class="text-sm text-slate-300 leading-relaxed">
          {{ deletingPreset ? t("presets.deleteConfirm", { name: deletingPreset.name }) : "" }}
        </p>
        <div v-if="deletingDependents.length > 0" class="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <p class="text-xs font-medium text-amber-300">
            {{ t("presets.deleteAffects", { count: deletingDependents.length }) }}
          </p>
          <p class="mt-1 break-words text-xs text-amber-200/70">
            {{ deletingDependents.map((p) => p.name).join(", ") }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="deletingPreset = null">
          {{ t("common.cancel") }}
        </Button>
        <Button variant="danger" @click="removePreset">
          <Trash2 class="w-4 h-4" />
          <span>{{ t("common.delete") }}</span>
        </Button>
      </template>
    </Dialog>
  </div>
</template>
