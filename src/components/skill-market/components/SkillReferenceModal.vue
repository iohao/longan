<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Tag, FolderOpen } from "lucide-vue-next";
import Dialog from "@/components/ui/Dialog.vue";
import Badge from "@/components/ui/Badge.vue";
import { api, errorMessage } from "@/api";
import type { Skill, ReferenceDetail } from "@/types";

export interface SkillReferenceModalProps {
  skill: Skill | null;
  isOpen: boolean;
}

const props = defineProps<SkillReferenceModalProps>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useI18n();

const details = ref<ReferenceDetail[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const presetRefs = computed(() => details.value.filter((d) => d.type_ === "preset"));
const projectRefs = computed(() => details.value.filter((d) => d.type_ === "project"));

async function loadReferences() {
  if (!props.skill) return;
  loading.value = true;
  error.value = null;
  try {
    const refDetails = await api.skillReferenceDetails(props.skill.id);
    details.value = refDetails;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.isOpen, props.skill?.id],
  ([open, skillId]) => {
    if (open && skillId) {
      void loadReferences();
    } else {
      details.value = [];
      error.value = null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Dialog
    :open="isOpen"
    :title="skill ? `${t('library.viewReferences', { name: skill.name })}` : ''"
    size="xl"
    @close="emit('close')"
  >
    <div v-if="skill" class="space-y-4">
      <!-- Summary -->
      <div class="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
        <p class="text-sm text-slate-300">
          <span class="font-semibold text-emerald-400">{{ details.length }}</span>
          {{ t("library.referenceLocationsCount", { count: details.length }) }}
        </p>
      </div>

      <!-- Error State -->
      <div v-if="error" class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
        <p class="text-sm text-red-400">{{ t("common.loadFailed") }}：{{ error }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <div class="text-slate-400">{{ t("common.loading") }}</div>
      </div>

      <!-- Content -->
      <div v-if="!loading && !error" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Preset References -->
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Tag class="w-4 h-4 text-emerald-400" />
            <span>Preset {{ t("presets.eyebrow") }} ({{ presetRefs.length }})</span>
          </div>
          <div class="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
            <div
              v-for="(refItem, idx) in presetRefs"
              :key="idx"
              class="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-emerald-500/40 transition-colors"
            >
              <Tag class="w-3.5 h-3.5 shrink-0 text-emerald-400/70" />
              <span class="flex-1 text-sm text-slate-200 truncate">{{ refItem.name }}</span>
            </div>
            <div v-if="presetRefs.length === 0" class="text-center py-6 px-3">
              <p class="text-xs text-slate-500">{{ t("common.empty") }}</p>
            </div>
          </div>
        </div>

        <!-- Project References -->
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <FolderOpen class="w-4 h-4 text-blue-400" />
            <span>{{ t("nav.projects") }} ({{ projectRefs.length }})</span>
          </div>
          <div class="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
            <div
              v-for="(refItem, idx) in projectRefs"
              :key="idx"
              class="flex flex-col gap-1.5 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-blue-500/40 transition-colors"
            >
              <div class="flex items-center gap-2">
                <Badge variant="neutral">
                  <FolderOpen class="w-3 h-3" />
                  <span>{{ t("nav.projects") }}</span>
                </Badge>
                <span class="text-sm font-medium text-slate-200">{{ refItem.name }}</span>
              </div>
              <p v-if="refItem.path" class="text-xs text-slate-400 truncate pl-8" :title="refItem.path">
                {{ refItem.path }}
              </p>
            </div>
            <div v-if="projectRefs.length === 0" class="text-center py-6 px-3">
              <p class="text-xs text-slate-500">{{ t("common.empty") }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>
