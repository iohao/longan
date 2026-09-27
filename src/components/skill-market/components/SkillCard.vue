<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderTree,
  Globe,
  HardDrive,
  Layers,
} from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import type { ListedSkill, Skill, SkillUpdateTask } from "@/types";
import Badge from "@/components/ui/Badge.vue";
import SkillActions from "./SkillActions.vue";

export interface SkillCardProps {
  skill: ListedSkill;
  updateTask?: SkillUpdateTask;
  updateDisabled: boolean;
  viewMode?: "tree" | "flat";
  searchQuery?: string;
}

const props = withDefaults(defineProps<SkillCardProps>(), {
  updateTask: undefined,
  viewMode: "flat",
  searchQuery: "",
});

const emit = defineEmits<{
  (e: "update", skill: Skill): void;
  (e: "delete", skill: Skill): void;
  (e: "viewReferences", skill: Skill): void;
  (e: "actionError", message: string): void;
}>();

const { t } = useI18n();

const isExpanded = ref(props.viewMode === "tree");

const updateInProgress = computed(
  () => props.updateTask?.status === "queued" || props.updateTask?.status === "updating",
);

const indeterminateDownload = computed(
  () =>
    props.updateTask?.phase === "retrying" ||
    (props.updateTask?.phase === "downloading" && props.updateTask.totalBytes === null),
);

const subSkills = computed(() => props.skill.sub_skills);
const isCollection = computed(() => Boolean(subSkills.value && subSkills.value.length > 0));

const q = computed(() => props.searchQuery.toLowerCase().trim());
const hasSearch = computed(() => Boolean(q.value));

const displayedSubSkills = computed(() => {
  if (!subSkills.value || subSkills.value.length === 0) return [];
  if (!hasSearch.value) return subSkills.value;
  const query = q.value;
  const matched = subSkills.value.filter(
    (sub) =>
      sub.name.toLowerCase().includes(query) ||
      Boolean(sub.description && sub.description.toLowerCase().includes(query)) ||
      sub.dir_path.toLowerCase().includes(query),
  );
  return matched.length > 0 ? matched : subSkills.value;
});

const shouldShowSubSkills = computed(
  () => isCollection.value && (hasSearch.value || isExpanded.value),
);

async function handleOpenSubDir(event: MouseEvent, subName: string) {
  event.stopPropagation();
  try {
    await api.openSkillSubDir(props.skill.id, subName);
  } catch (error) {
    emit("actionError", errorMessage(error));
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div
    class="glass-card skill-list-row group flex flex-col gap-2 rounded-xl border border-slate-800/80 p-4 transition-colors duration-200 hover:border-emerald-500/40"
  >
    <div class="flex min-w-0 items-center justify-between gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-2.5">
        <span class="shrink-0">
          <Badge :variant="skill.source_type === 'net' ? 'info' : 'neutral'">
            <Globe v-if="skill.source_type === 'net'" class="w-3 h-3" />
            <HardDrive v-else class="w-3 h-3" />
            <span>{{ t(`library.source.${skill.source_type}`) }}</span>
          </Badge>
        </span>

        <span v-if="isCollection" class="shrink-0">
          <Badge
            variant="neutral"
            class="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          >
            <Layers class="w-3 h-3 text-emerald-400" />
            <span>{{ t("library.collectionBadge", { count: subSkills!.length }) }}</span>
          </Badge>
        </span>

        <h3 class="min-w-0 truncate text-sm font-semibold text-slate-100">
          {{ skill.name }}
        </h3>

        <button
          v-if="isCollection"
          type="button"
          :aria-expanded="shouldShowSubSkills"
          :title="
            shouldShowSubSkills
              ? t('library.collapseSubSkills')
              : t('library.expandSubSkills', { count: subSkills!.length })
          "
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-emerald-400/90 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors cursor-pointer"
          @click="isExpanded = !isExpanded"
        >
          <ChevronDown v-if="shouldShowSubSkills" class="w-3.5 h-3.5" />
          <ChevronRight v-else class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">
            {{
              shouldShowSubSkills
                ? t("library.collapseSubSkills")
                : t("library.expandSubSkills", { count: subSkills!.length })
            }}
          </span>
        </button>
      </div>

      <SkillActions
        :skill="skill"
        :update-task="updateTask"
        :update-disabled="updateDisabled"
        :hide-repo-actions="viewMode === 'tree'"
        @update="(s) => emit('update', s)"
        @delete="(s) => emit('delete', s)"
        @view-references="(s) => emit('viewReferences', s)"
        @action-error="(msg) => emit('actionError', msg)"
      />
    </div>

    <!-- Description row -->
    <template v-if="viewMode === 'tree'">
      <p v-if="skill.description" class="w-full truncate font-mono text-xs text-slate-400">
        {{ skill.description }}
      </p>
    </template>
    <template v-else>
      <p class="w-full truncate font-mono text-xs text-slate-400">
        {{ skill.source_type === "net" ? `${skill.owner}/${skill.repo}` : skill.dir_path }}
        {{ skill.description ? ` • ${skill.description}` : "" }}
      </p>
    </template>

    <!-- Sub skills tree list -->
    <div
      v-if="shouldShowSubSkills && displayedSubSkills.length > 0"
      class="mt-2 space-y-1.5 pt-2 border-t border-slate-800/60"
    >
      <div class="flex items-center justify-between text-xs text-slate-400 px-1 font-medium">
        <span class="flex items-center gap-1.5">
          <FolderTree class="w-3.5 h-3.5 text-emerald-400" />
          <span>{{ t("library.subSkillsHeading") }}</span>
          <span class="text-[11px] text-slate-500">
            ({{ displayedSubSkills.length }})
          </span>
        </span>
      </div>

      <div class="relative ml-2 space-y-1.5 border-l-2 border-slate-800/80 pl-3.5 pt-1 pb-1">
        <div
          v-for="sub in displayedSubSkills"
          :key="sub.name"
          class="relative group/sub flex items-start justify-between gap-3 rounded-lg border border-slate-800/60 bg-slate-900/50 p-2.5 transition-colors hover:border-slate-700 hover:bg-slate-900/80"
        >
          <!-- Tree horizontal connector -->
          <div
            class="absolute -left-3.5 top-4 h-px w-2.5 bg-slate-800"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="font-mono text-xs font-semibold text-slate-200 group-hover/sub:text-emerald-300 transition-colors"
              >
                {{ sub.name }}
              </span>
              <span class="text-[10px] text-slate-500 font-mono">
                {{ sub.dir_path }}
              </span>
            </div>
            <p v-if="sub.description" class="mt-1 text-xs text-slate-400 line-clamp-2 leading-relaxed">
              {{ sub.description }}
            </p>
          </div>
          <button
            type="button"
            :title="t('library.openLocalDir')"
            :aria-label="t('library.openLocalDir')"
            class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/80 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100 opacity-0 group-hover/sub:opacity-100 focus:opacity-100"
            @click="(e) => handleOpenSubDir(e, sub.name)"
          >
            <FolderOpen class="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Update progress bar -->
    <div v-if="updateInProgress && updateTask" class="space-y-1.5 pt-2" aria-live="polite">
      <div class="flex items-center justify-between gap-3 text-xs">
        <span class="truncate text-amber-300">
          {{
            updateTask.status === "queued"
              ? t("library.updateQueued")
              : updateTask.phase
                ? t(`library.updatePhase.${updateTask.phase}`)
                : t("library.updating")
          }}
        </span>
        <span class="min-w-16 shrink-0 text-right font-mono text-slate-500">
          {{
            updateTask.phase === "downloading" && updateTask.downloadedBytes !== null
              ? t("library.downloadProgress", {
                  downloaded: formatBytes(updateTask.downloadedBytes),
                  total: updateTask.totalBytes === null ? "?" : formatBytes(updateTask.totalBytes),
                })
              : updateTask.phase === "retrying"
                ? ""
                : `${updateTask.progress}%`
          }}
        </span>
      </div>
      <div
        class="h-1.5 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        :aria-label="t('library.skillUpdateProgress', { name: skill.name })"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="indeterminateDownload ? undefined : updateTask.progress"
      >
        <div
          :class="[
            'h-full rounded-full bg-amber-500 transition-[width] duration-300',
            indeterminateDownload ? 'w-full animate-shimmer' : '',
          ]"
          :style="indeterminateDownload ? undefined : { width: `${updateTask.progress}%` }"
        />
      </div>
    </div>
  </div>
</template>
