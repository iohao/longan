<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Globe,
  HardDrive,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-vue-next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, errorMessage } from "@/api";
import GithubIcon from "@/components/icons/GithubIcon.vue";
import HoverActionGroup from "@/components/ui/HoverActionGroup.vue";
import type { Skill, SkillUpdateTask } from "@/types";
import type { SkillRepoGroup } from "@/utils/skillGrouping";
import SkillCard from "./SkillCard.vue";

export interface RepoGroupCardProps {
  group: SkillRepoGroup;
  isCollapsed: boolean;
  updateTasks: Record<number, SkillUpdateTask>;
  updatesAtCapacity: boolean;
  batchUpdating?: boolean;
  searchQuery?: string;
}

const props = withDefaults(defineProps<RepoGroupCardProps>(), {
  batchUpdating: false,
  searchQuery: "",
});

const emit = defineEmits<{
  (e: "toggleCollapse", groupKey: string): void;
  (e: "update", skill: Skill): void;
  (e: "updateGroup", skillIds: number[]): void;
  (e: "delete", skill: Skill): void;
  (e: "viewReferences", skill: Skill): void;
  (e: "actionError", message: string): void;
}>();

const { t } = useI18n();

const isGroupUpdating = computed(() =>
  props.group.skills.some((s) => {
    const task = props.updateTasks[s.id];
    return task?.status === "queued" || task?.status === "updating";
  }),
);

const displayName = computed(() =>
  props.group.sourceType === "local" ? t("library.localGroup") : props.group.title,
);

async function handleOpenGithub(event: MouseEvent) {
  event.stopPropagation();
  if (!props.group.githubUrl) return;
  try {
    await openUrl(props.group.githubUrl);
  } catch {
    window.open(props.group.githubUrl, "_blank", "noopener,noreferrer");
  }
}

async function handleOpenDir(event: MouseEvent) {
  event.stopPropagation();
  try {
    await api.openSkillGroupDir(props.group.sourceType, props.group.owner, props.group.repo);
  } catch (error) {
    emit("actionError", errorMessage(error));
  }
}

function handleUpdateGroup(event: MouseEvent) {
  event.stopPropagation();
  const updatableSkillIds = props.group.skills
    .filter((s) => s.status === "update_available" && s.source_type === "net")
    .map((s) => s.id);
  if (updatableSkillIds.length > 0) {
    emit("updateGroup", updatableSkillIds);
  }
}
</script>

<template>
  <div class="space-y-1">
    <!-- Group Header Card -->
    <div
      role="button"
      tabindex="0"
      :aria-expanded="!isCollapsed"
      :aria-label="`${displayName} (${group.skills.length})`"
      class="group group/repo flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-800/90 bg-slate-900/50 px-3.5 py-2.5 transition-colors hover:border-slate-700 hover:bg-slate-900/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
      @click="emit('toggleCollapse', group.key)"
      @keydown.enter.prevent="emit('toggleCollapse', group.key)"
      @keydown.space.prevent="emit('toggleCollapse', group.key)"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <span
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors group-hover/repo:text-slate-200"
        >
          <ChevronRight v-if="isCollapsed" class="h-4 w-4" />
          <ChevronDown v-else class="h-4 w-4" />
        </span>

        <span class="shrink-0 text-slate-400">
          <Globe v-if="group.sourceType === 'net'" class="h-4 w-4 text-emerald-400" />
          <HardDrive v-else class="h-4 w-4 text-slate-400" />
        </span>

        <span class="truncate font-mono text-xs sm:text-sm font-medium text-slate-200">
          {{ displayName }}
        </span>

        <span
          class="shrink-0 rounded-full border border-slate-700/60 bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] text-slate-400"
        >
          {{ t("library.repoSkillCount", { count: group.skills.length }) }}
        </span>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <HoverActionGroup>
          <button
            v-if="group.githubUrl"
            type="button"
            :title="t('library.openGithub')"
            :aria-label="t('library.openGithub')"
            class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100 hover:bg-slate-700/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            @click="handleOpenGithub"
          >
            <GithubIcon class="h-3.5 w-3.5 text-slate-300" />
          </button>

          <button
            type="button"
            :title="t('library.openLocalDir')"
            :aria-label="t('library.openLocalDir')"
            class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100 hover:bg-slate-700/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            @click="handleOpenDir"
          >
            <FolderOpen class="h-3.5 w-3.5 text-slate-300" />
          </button>
        </HoverActionGroup>

        <span
          v-if="group.updatableCount > 0"
          class="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
        >
          <Sparkles class="h-3 w-3 text-amber-400" />
          <span>{{ t("library.updatableCount", { count: group.updatableCount }) }}</span>
        </span>

        <button
          v-if="group.updatableCount > 0 && group.sourceType === 'net'"
          type="button"
          :disabled="isGroupUpdating || batchUpdating || updatesAtCapacity"
          :title="t('library.updateRepo')"
          :aria-label="t('library.updateRepo')"
          class="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:border-amber-500/60 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          @click="handleUpdateGroup"
        >
          <Loader2 v-if="isGroupUpdating" class="h-3.5 w-3.5 animate-spin" />
          <RefreshCw v-else class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">{{ t("library.updateRepo") }}</span>
        </button>
      </div>
    </div>

    <!-- Group Children (Skills Tree) -->
    <div
      v-if="!isCollapsed"
      class="relative ml-4 space-y-2 border-l-2 border-slate-800/80 pl-4 pt-1 pb-1 sm:ml-5 sm:pl-5"
      role="region"
      :aria-label="displayName"
    >
      <div v-for="skill in group.skills" :key="skill.id" class="relative">
        <!-- Tree horizontal connector -->
        <div
          class="absolute -left-4 top-5 h-px w-3 bg-slate-800 sm:-left-5 sm:w-4"
          aria-hidden="true"
        />
        <SkillCard
          :skill="skill"
          view-mode="tree"
          :update-task="updateTasks[skill.id]"
          :update-disabled="!updateTasks[skill.id] && updatesAtCapacity"
          :search-query="searchQuery"
          @update="(s) => emit('update', s)"
          @delete="(s) => emit('delete', s)"
          @view-references="(s) => emit('viewReferences', s)"
          @action-error="(msg) => emit('actionError', msg)"
        />
      </div>
    </div>
  </div>
</template>
